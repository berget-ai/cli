import { applyEdits, modify, parse } from 'jsonc-parser';
import path from 'node:path';

import type { CommandRunner } from './ports/command-runner.js';
import type { FileStore } from './ports/file-store.js';
import type { Prompter } from './ports/prompter.js';

import { getAllAgents, toMarkdown } from '../../agents/index.js';
import { CancelledError } from './errors.js';
import { readJsonMaybe } from './utils.js';

const OPENCODE_PLUGIN = '@bergetai/opencode-auth@1.0.22';
const OPENCODE_PLUGIN_NAME = '@bergetai/opencode-auth';

export interface InitOpenCodeDeps {
  commands: CommandRunner;
  cwd: string;
  files: FileStore;
  homeDir: string;
  prompter: Prompter;
  scope: 'global' | 'project';
}

export function getOpencodeLabel(state: { global: boolean; project: boolean }): string {
  if (state.project || state.global) return ' (already configured)';
  return '';
}

export async function getOpencodeState(
  files: FileStore,
  homeDir: string,
  cwd: string,
): Promise<{ global: boolean; project: boolean }> {
  const projectJsonc = await readJsonMaybe(files, path.join(cwd, 'opencode.jsonc'));
  const projectJson = await readJsonMaybe(files, path.join(cwd, 'opencode.json'));
  const globalJsonc = await readJsonMaybe(
    files,
    path.join(homeDir, '.config', 'opencode', 'opencode.jsonc'),
  );
  const globalJson = await readJsonMaybe(
    files,
    path.join(homeDir, '.config', 'opencode', 'opencode.json'),
  );

  return {
    global: hasPluginInConfig(globalJsonc) || hasPluginInConfig(globalJson),
    project: hasPluginInConfig(projectJsonc) || hasPluginInConfig(projectJson),
  };
}

/* ─── State helpers ─────────────────────────────────────────────────────── */

export async function initOpenCode(deps: InitOpenCodeDeps): Promise<void> {
  const { commands: _commands, cwd, files, homeDir, prompter, scope } = deps;

  const configPath = await resolveOpencodeConfigPath(files, homeDir, cwd, scope);
  const existingContent = await files.readFile(configPath);
  const newContent = generateModifiedContent(existingContent, configPath);

  if (existingContent && existingContent === newContent) {
    return;
  }

  if (existingContent) {
    prompter.note(`OpenCode config will be updated at:\n  ${configPath}`, 'Config update');
  } else {
    prompter.note(`OpenCode config will be created at:\n  ${configPath}`, 'Config update');
  }

  const shouldWrite = await prompter.confirm({
    initialValue: true,
    message: existingContent ? `Write these changes to ${configPath}?` : `Create ${configPath}?`,
  });
  if (!shouldWrite) throw new CancelledError();

  const s = prompter.spinner();
  s.start('Writing OpenCode configuration...');
  try {
    await files.writeFile(configPath, newContent);
    s.stop(`Wrote configuration to ${configPath}.`);
  } catch (error) {
    s.stop('Failed to write configuration.');
    throw error;
  }
}

export async function initOpenCodeAgents(deps: {
  cwd: string;
  files: FileStore;
  homeDir: string;
  prompter: Prompter;
  scope: 'global' | 'project';
}): Promise<boolean> {
  const { cwd, files, homeDir, prompter, scope } = deps;

  const agents = getAllAgents().filter((a) => a.config.mode === 'primary');

  if (agents.length === 0) {
    return false;
  }

  const agentsDir =
    scope === 'project'
      ? path.join(cwd, '.opencode', 'agents')
      : path.join(homeDir, '.config', 'opencode', 'agents');

  prompter.note('Space to toggle, Enter to confirm.', 'Agent Setup');

  const agentOptions = await Promise.all(
    agents.map(async (agent) => {
      const agentPath = path.join(agentsDir, `${agent.config.name}.md`);
      const exists = await files.exists(agentPath);
      return {
        hint: exists ? 'already configured' : agent.config.description,
        label: agent.config.name,
        value: agent.config.name,
      };
    }),
  );

  const selectedAgents = await prompter.multiselect({
    message: 'Select agents to set up:',
    options: agentOptions,
    required: false,
  });

  if (selectedAgents.length === 0) {
    return false;
  }

  const newAgents: string[] = [];
  const existingAgents: string[] = [];
  await Promise.all(
    selectedAgents.map(async (agentName: string) => {
      const agentPath = path.join(agentsDir, `${agentName}.md`);
      const exists = await files.exists(agentPath);
      (exists ? existingAgents : newAgents).push(agentName);
    }),
  );

  const summaryParts: string[] = [];
  if (newAgents.length > 0) summaryParts.push(`New: ${newAgents.join(', ')}`);
  if (existingAgents.length > 0) summaryParts.push(`Replaced: ${existingAgents.join(', ')}`);
  if (summaryParts.length > 0) {
    prompter.note(
      `  Agent Setup Summary:\n${summaryParts.map((part) => `  ${part}`).join('\n')}`,
      'Agent Setup',
    );
  }

  const shouldWrite = await prompter.confirm({
    initialValue: true,
    message: 'Write agent configuration files?',
  });

  if (!shouldWrite) {
    throw new CancelledError();
  }

  await files.mkdir(agentsDir);

  const s = prompter.spinner();
  s.start('Writing agent configurations...');
  try {
    for (const agentName of selectedAgents) {
      const agent = agents.find((a) => a.config.name === agentName);
      if (!agent) continue;

      const agentPath = path.join(agentsDir, `${agentName}.md`);
      const content = toMarkdown(agent);
      await files.writeFile(agentPath, content);
    }
    s.stop(`Wrote ${selectedAgents.length} agent(s) to ${agentsDir}`);
  } catch (error) {
    s.stop('Failed to write agent configurations.');
    throw error;
  }
  return true;
}

function generateModifiedContent(existingContent: null | string, configPath: string): string {
  if (configPath.endsWith('.jsonc')) {
    const content = existingContent || '{}';
    const parseErrors: any[] = [];
    const parsed = parse(content, parseErrors, {
      allowTrailingComma: true,
      disallowComments: false,
    });

    let jsConfig: Record<string, unknown> = {};
    const canModifyText =
      parsed !== undefined &&
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed);

    if (canModifyText) {
      jsConfig = parsed as Record<string, unknown>;
    }

    const pluginsKey = jsConfig.plugins === undefined ? 'plugin' : 'plugins';
    const existingPlugins: string[] = (jsConfig[pluginsKey] as string[]) || [];
    const filtered = existingPlugins.filter((p: string) => !p.includes(OPENCODE_PLUGIN_NAME));
    filtered.push(OPENCODE_PLUGIN);

    if (canModifyText) {
      let modifiedContent = content;
      const pluginEdits = modify(modifiedContent, [pluginsKey], filtered, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      });
      modifiedContent = applyEdits(modifiedContent, pluginEdits);

      if (!jsConfig.$schema) {
        const schemaEdits = modify(
          modifiedContent,
          ['$schema'],
          'https://opencode.ai/config.json',
          {
            formattingOptions: { insertSpaces: true, tabSize: 2 },
          },
        );
        modifiedContent = applyEdits(modifiedContent, schemaEdits);
      }

      return modifiedContent;
    }

    const config: Record<string, unknown> = {
      $schema: 'https://opencode.ai/config.json',
      [pluginsKey]: filtered,
    };
    return JSON.stringify(config, null, 2) + '\n';
  }

  let config: Record<string, unknown> = {};
  if (existingContent) {
    try {
      config = JSON.parse(existingContent);
    } catch {
      // ignore malformed, overwrite
    }
  }

  const pluginsKey = config.plugins === undefined ? 'plugin' : 'plugins';
  const existingPlugins: string[] = (config[pluginsKey] as string[]) || [];
  const filtered = existingPlugins.filter((p: string) => !p.includes(OPENCODE_PLUGIN_NAME));
  filtered.push(OPENCODE_PLUGIN);
  config[pluginsKey] = filtered;
  config.$schema = config.$schema || 'https://opencode.ai/config.json';

  return JSON.stringify(config, null, 2) + '\n';
}

function hasPluginInConfig(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false;
  const plugins =
    (config as Record<string, unknown>).plugin || (config as Record<string, unknown>).plugins;
  if (!Array.isArray(plugins)) return false;
  return plugins.some((p: unknown) => typeof p === 'string' && p.includes(OPENCODE_PLUGIN_NAME));
}

async function resolveOpencodeConfigPath(
  files: FileStore,
  homeDir: string,
  cwd: string,
  scope: 'global' | 'project',
): Promise<string> {
  if (scope === 'project') {
    const jsoncPath = path.join(cwd, 'opencode.jsonc');
    const jsonPath = path.join(cwd, 'opencode.json');
    if (await files.exists(jsoncPath)) return jsoncPath;
    if (await files.exists(jsonPath)) return jsonPath;
    return jsonPath;
  }

  const globalDir = path.join(homeDir, '.config', 'opencode');
  const jsoncPath = path.join(globalDir, 'opencode.jsonc');
  const jsonPath = path.join(globalDir, 'opencode.json');
  if (await files.exists(jsoncPath)) return jsoncPath;
  if (await files.exists(jsonPath)) return jsonPath;
  return jsonPath;
}
