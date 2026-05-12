import { applyEdits, modify, parse } from 'jsonc-parser';
import * as os from 'node:os';

import type { ApiKeyServicePort, AuthServicePort } from './ports/auth-services';
import type { CommandRunner } from './ports/command-runner';
import type { FileStore } from './ports/file-store';
import type { Prompter } from './ports/prompter';

import { getAllAgents, toMarkdown, toPiPrompt } from '../../agents/index.js';
import { ApiKeyService } from '../../services/api-key-service.js';
import { AuthService } from '../../services/auth-service.js';
import { ClackPrompter } from './adapters/clack-prompter.js';
import { FsFileStore } from './adapters/fs-file-store.js';
import { SpawnCommandRunner } from './adapters/spawn-command-runner.js';
import { configureAuth } from './auth-sync.js';
import { CancelledError, CommandFailedError, PrerequisiteError } from './errors';

const OPENCODE_PLUGIN = '@bergetai/opencode-auth';
const PI_PROVIDER = 'npm:@bergetai/pi-provider';
const OPENCODE_PLUGIN_NAME = '@bergetai/opencode-auth';
const PI_PROVIDER_NAME = '@bergetai/pi-provider';

export interface WizardDeps {
  apiKeyService: ApiKeyServicePort;
  authService: AuthServicePort;
  commands: CommandRunner;
  cwd: string;
  files: FileStore;
  homeDir: string;
  prompter: Prompter;
}

export async function runSetup(deps: WizardDeps): Promise<void> {
  const { apiKeyService, authService, commands, cwd, files, homeDir, prompter } = deps;

  prompter.intro('\uD83D\uDD27 Berget Code Setup');

  const ocState = await getOpencodeState(files, homeDir, cwd);
  const piState = await getPiState(files, homeDir, cwd);

  const tool = await prompter.select<'opencode' | 'pi'>({
    message: 'How do you want to use Berget AI?',
    options: [
      {
        hint: 'Open source AI coding agent',
        label: `OpenCode${getOpencodeLabel(ocState)}`,
        value: 'opencode',
      },
      {
        hint: 'Minimal terminal coding harness',
        label: `Pi${getPiLabel(piState)}`,
        value: 'pi',
      },
    ],
  });

  const scope = await prompter.select<'global' | 'project'>({
    message: 'Where should the configuration apply?',
    options: [
      {
        hint:
          tool === 'opencode'
            ? ocState.project
              ? 'Already configured'
              : 'opencode.json in current directory'
            : piState.project
              ? 'Already configured'
              : '.pi/settings.json in current directory',
        label: 'This project only',
        value: 'project',
      },
      {
        hint:
          tool === 'opencode'
            ? ocState.global
              ? 'Already configured'
              : '~/.config/opencode/opencode.json'
            : piState.global
              ? 'Already configured'
              : '~/.pi/agent/settings.json',
        label: 'Globally for all projects',
        value: 'global',
      },
    ],
  });

  const authResult = await configureAuth(
    { apiKeyService, authService, files, homeDir, prompter },
    tool,
  );

  if (tool === 'opencode') {
    await setupOpenCode({ commands, cwd, files, homeDir, prompter, scope });
    await setupOpenCodeAgents({ cwd, files, homeDir, prompter, scope });

    if (authResult.authenticated) {
      prompter.note(
        `You're all set!\n\n1. Run: opencode\n2. Select model: /models\n\nFor more information, see official docs:\n\nhttps://github.com/berget-ai/opencode-berget-auth`,
        'Successfully configured Berget AI for OpenCode',
      );
    } else {
      prompter.note(
        `Next steps:\n\n1. Run: opencode\n2. Type: /connect\n3. Choose your auth method:\n   • "Login with Berget" — Berget Code plan\n   • "Enter Berget API Key manually"\n   • (or set BERGET_API_KEY env var)\n4. Select model: /models\n\nFor more information, see official docs:\n\nhttps://github.com/berget-ai/opencode-berget-auth`,
        'Successfully configured Berget AI for OpenCode',
      );
    }
  } else {
    await setupPi({ commands, cwd, files, homeDir, prompter, scope });
    await setupPiAgent({ cwd, files, homeDir, prompter, scope });

    if (authResult.authenticated) {
      prompter.note(
        `You're all set!\n\n1. Restart Pi or run /reload\n2. Select model: /model\n\nFor more information, see official docs:\n\nhttps://github.com/berget-ai/pi-provider`,
        'Successfully configured Berget AI for Pi',
      );
    } else {
      prompter.note(
        `Next steps:\n\n1. Restart Pi or run /reload\n2. Type: /login\n3. Choose your auth method:\n   • "Use a subscription" → Berget AI\n   • (or set BERGET_API_KEY env var)\n4. Select model: /model\n\nFor more information, see official docs:\n\nhttps://github.com/berget-ai/pi-provider`,
        'Successfully configured Berget AI for Pi',
      );
    }
  }

  prompter.outro('Setup complete!');
}

// ─── OpenCode ────────────────────────────────────────────────────────────────

export async function runSetupCommand(): Promise<void> {
  try {
    await runSetup({
      apiKeyService: ApiKeyService.getInstance(),
      authService: AuthService.getInstance(),
      commands: new SpawnCommandRunner(),
      cwd: process.cwd(),
      files: new FsFileStore(),
      homeDir: os.homedir(),
      prompter: new ClackPrompter(),
    });
    process.exit(0);
  } catch (error) {
    if (error instanceof CancelledError) {
      process.exit(130);
    }
    if (error instanceof PrerequisiteError) {
      console.error(`Missing required binary: ${error.binary}`);
      process.exit(2);
    }
    if (error instanceof CommandFailedError) {
      console.error(error.message);
      process.exit(5);
    }
    throw error;
  }
}

// ─── Pi ────────────────────────────────────────────────────────────────────────

function generateDiff(oldText: string, newText: string, filePath: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  let result = `--- ${filePath}\n+++ ${filePath}\n`;

  const maxLength = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < maxLength; index++) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine !== newLine) {
      if (oldLine !== undefined) result += `- ${oldLine}\n`;
      if (newLine !== undefined) result += `+ ${newLine}\n`;
    }
  }
  return result.trimEnd();
}

function generateModifiedContent(existingContent: null | string, configPath: string): string {
  if (configPath.endsWith('.jsonc')) {
    const content = existingContent || '{}';
    const parseErrors: any[] = [];
    const parsed = parse(content, parseErrors, {
      allowTrailingComma: true,
      disallowComments: false,
    });

    let jsConfig: Record<string, any> = {};
    const canModifyText =
      parsed !== undefined &&
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed);

    if (canModifyText) {
      jsConfig = parsed as Record<string, any>;
    }

    const pluginsKey = jsConfig.plugins === undefined ? 'plugin' : 'plugins';
    const existing: string[] = jsConfig[pluginsKey] || [];
    const filtered = existing.filter((p: string) => !p.includes(OPENCODE_PLUGIN_NAME));
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

    // Malformed, empty, or non-object JSONC — write a clean config
    const config: Record<string, any> = {
      $schema: 'https://opencode.ai/config.json',
      [pluginsKey]: filtered,
    };
    return JSON.stringify(config, null, 2) + '\n';
  }

  // Plain JSON
  let config: Record<string, any> = {};
  if (existingContent) {
    try {
      config = JSON.parse(existingContent);
    } catch {
      // ignore malformed, overwrite
    }
  }

  const pluginsKey = config.plugins === undefined ? 'plugin' : 'plugins';
  const existing: string[] = config[pluginsKey] || [];
  const filtered = existing.filter((p: string) => !p.includes(OPENCODE_PLUGIN_NAME));
  filtered.push(OPENCODE_PLUGIN);
  config[pluginsKey] = filtered;
  config.$schema = config.$schema || 'https://opencode.ai/config.json';

  return JSON.stringify(config, null, 2) + '\n';
}

function getOpencodeLabel(state: { global: boolean; project: boolean }): string {
  if (state.project || state.global) return ' (already configured)';
  return '';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOpencodeState(
  files: FileStore,
  homeDir: string,
  cwd: string,
): Promise<{ global: boolean; project: boolean }> {
  const projectJsonc = await readJsonMaybe(files, pathJoin(cwd, 'opencode.jsonc'));
  const projectJson = await readJsonMaybe(files, pathJoin(cwd, 'opencode.json'));
  const globalJsonc = await readJsonMaybe(
    files,
    pathJoin(homeDir, '.config', 'opencode', 'opencode.jsonc'),
  );
  const globalJson = await readJsonMaybe(
    files,
    pathJoin(homeDir, '.config', 'opencode', 'opencode.json'),
  );

  return {
    global: (await hasPluginInConfig(globalJsonc)) || (await hasPluginInConfig(globalJson)),
    project: (await hasPluginInConfig(projectJsonc)) || (await hasPluginInConfig(projectJson)),
  };
}

function getPiLabel(state: { global: boolean; project: boolean }): string {
  if (state.project || state.global) return ' (already configured)';
  return '';
}

async function getPiState(
  files: FileStore,
  homeDir: string,
  cwd: string,
): Promise<{ global: boolean; project: boolean }> {
  const projectSettings = await readJsonMaybe(files, pathJoin(cwd, '.pi', 'settings.json'));
  const globalSettings = await readJsonMaybe(
    files,
    pathJoin(homeDir, '.pi', 'agent', 'settings.json'),
  );

  return {
    global: await hasPiProviderInSettings(globalSettings),
    project: await hasPiProviderInSettings(projectSettings),
  };
}

async function hasPiProviderInSettings(settings: any): Promise<boolean> {
  if (!settings) return false;
  const packages = settings.packages || [];
  return packages.some((p: any) => {
    if (typeof p === 'string') return p.includes(PI_PROVIDER_NAME);
    if (typeof p === 'object' && p.source) return p.source.includes(PI_PROVIDER_NAME);
    return false;
  });
}

async function hasPluginInConfig(config: any): Promise<boolean> {
  if (!config) return false;
  const plugins = config.plugin || config.plugins || [];
  return plugins.some((p: string) => p.includes(OPENCODE_PLUGIN_NAME));
}

function pathJoin(...parts: string[]): string {
  // Simple path join that avoids importing 'path' module
  // This is good enough for cross-platform testing since tests control the path format
  return parts.join('/');
}

async function readJsonMaybe(files: FileStore, filePath: string): Promise<any | null> {
  const content = await files.readFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    try {
      return JSON.parse(stripJsoncComments(content));
    } catch {
      return null;
    }
  }
}

async function resolveOpencodeConfigPath(
  files: FileStore,
  homeDir: string,
  cwd: string,
  scope: 'global' | 'project',
): Promise<string> {
  if (scope === 'project') {
    const jsoncPath = pathJoin(cwd, 'opencode.jsonc');
    const jsonPath = pathJoin(cwd, 'opencode.json');
    if (await files.exists(jsoncPath)) return jsoncPath;
    if (await files.exists(jsonPath)) return jsonPath;
    return jsonPath;
  } else {
    const globalDir = pathJoin(homeDir, '.config', 'opencode');
    const jsoncPath = pathJoin(globalDir, 'opencode.jsonc');
    const jsonPath = pathJoin(globalDir, 'opencode.json');
    if (await files.exists(jsoncPath)) return jsoncPath;
    if (await files.exists(jsonPath)) return jsonPath;
    return jsonPath;
  }
}

async function setupOpenCode(deps: {
  commands: CommandRunner;
  cwd: string;
  files: FileStore;
  homeDir: string;
  prompter: Prompter;
  scope: 'global' | 'project';
}): Promise<void> {
  const { commands, cwd, files, homeDir, prompter, scope } = deps;

  const installed = await commands.checkInstalled('opencode');
  if (!installed) {
    throw new PrerequisiteError('opencode');
  }

  const configPath = await resolveOpencodeConfigPath(files, homeDir, cwd, scope);
  const existingContent = await files.readFile(configPath);
  const newContent = generateModifiedContent(existingContent, configPath);

  if (existingContent && existingContent === newContent) {
    return;
  }

  if (existingContent) {
    prompter.note(generateDiff(existingContent, newContent, configPath), 'Changes to be written');
  } else {
    prompter.note(`New config at ${configPath}:\n\n${newContent}`, 'Config preview');
  }

  const shouldWrite = await prompter.confirm({
    initialValue: true,
    message: existingContent ? `Write these changes to ${configPath}?` : `Create ${configPath}?`,
  });
  if (!shouldWrite) throw new CancelledError();

  const s = prompter.spinner();
  s.start('Writing OpenCode configuration...');
  await files.writeFile(configPath, newContent);
  s.stop(`Wrote configuration to ${configPath}.`);
}

async function setupOpenCodeAgents(deps: {
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
      ? pathJoin(cwd, '.opencode', 'agents')
      : pathJoin(homeDir, '.config', 'opencode', 'agents');

  prompter.note('Space to toggle, Enter to confirm.', 'Agent Setup');

  const agentOptions = await Promise.all(
    agents.map(async (agent) => {
      const agentPath = pathJoin(agentsDir, `${agent.config.name}.md`);
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
    selectedAgents.map(async (agentName) => {
      const agentPath = pathJoin(agentsDir, `${agentName}.md`);
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

  for (const agentName of selectedAgents) {
    const agent = agents.find((a) => a.config.name === agentName);
    if (!agent) continue;

    const agentPath = pathJoin(agentsDir, `${agentName}.md`);
    const content = toMarkdown(agent);
    await files.writeFile(agentPath, content);
  }

  s.stop(`Wrote ${selectedAgents.length} agent(s) to ${agentsDir}`);
  return true;
}

async function setupPi(deps: {
  commands: CommandRunner;
  cwd: string;
  files: FileStore;
  homeDir: string;
  prompter: Prompter;
  scope: 'global' | 'project';
}): Promise<void> {
  const { commands, cwd, files, homeDir, prompter, scope } = deps;
  const s = prompter.spinner();

  const installed = await commands.checkInstalled('pi');
  if (!installed) {
    throw new PrerequisiteError('pi');
  }

  const installArguments =
    scope === 'project' ? ['install', '-l', PI_PROVIDER] : ['install', PI_PROVIDER];

  s.start(`Installing Berget AI provider for Pi...`);
  try {
    await commands.run('pi', installArguments);
    s.stop('Installed Pi provider.');
  } catch {
    s.stop('Pi provider installation failed. Please try again or install manually.');
    throw new CommandFailedError(`pi ${installArguments.join(' ')}`, 1);
  }

  const settingsPath =
    scope === 'project'
      ? pathJoin(cwd, '.pi', 'settings.json')
      : pathJoin(homeDir, '.pi', 'agent', 'settings.json');

  const settings = (await readJsonMaybe(files, settingsPath)) || {};

  if (settings.defaultProvider === 'berget') {
    prompter.note(
      'Berget AI is already set as your default provider.',
      'Default provider already set',
    );
  } else {
    if (settings.defaultProvider) {
      const makeDefault = await prompter.confirm({
        initialValue: false,
        message: `Your default provider is ${settings.defaultProvider}. Switch to Berget AI instead?`,
      });
      if (makeDefault) {
        settings.defaultProvider = 'berget';
        await writeJsonFile(files, settingsPath, settings);
        prompter.note('Berget AI is now your default provider.', 'Updated default provider');
      }
    } else {
      settings.defaultProvider = 'berget';
      await writeJsonFile(files, settingsPath, settings);
      prompter.note('Berget AI is now your default provider.', 'Updated default provider');
    }
  }
}

async function setupPiAgent(deps: {
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

  const systemPath =
    scope === 'project'
      ? pathJoin(cwd, '.pi', 'SYSTEM.md')
      : pathJoin(homeDir, '.pi', 'agent', 'SYSTEM.md');

  prompter.note('Pi uses a single system prompt.', 'Agent Setup');

  const setupAgent = await prompter.confirm({
    initialValue: false,
    message: 'Set up an agent for Pi?',
  });

  if (!setupAgent) return false;

  const selectedAgentName = await prompter.select({
    message: 'Choose an agent:',
    options: agents.map((agent) => ({
      hint: agent.config.description,
      label: agent.config.name,
      value: agent.config.name,
    })),
  });

  const agent = agents.find((a) => a.config.name === selectedAgentName);
  if (!agent) return false;

  const systemExists = await files.exists(systemPath);
  const confirmMsg = systemExists
    ? `SYSTEM.md already exists. Replace with ${agent.config.name}?`
    : 'Create agent configuration?';

  const shouldWrite = await prompter.confirm({
    initialValue: true,
    message: confirmMsg,
  });

  if (!shouldWrite) {
    throw new CancelledError();
  }

  const s = prompter.spinner();
  s.start('Writing agent configuration...');

  const systemDir = scope === 'project' ? pathJoin(cwd, '.pi') : pathJoin(homeDir, '.pi', 'agent');
  await files.mkdir(systemDir);
  await files.writeFile(systemPath, toPiPrompt(agent));

  s.stop(`Wrote agent configuration to ${systemPath}`);
  return true;
}

function stripJsoncComments(content: string): string {
  content = content.replaceAll(/\/\/.*$/gm, '');
  content = content.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return content;
}

async function writeJsonFile(
  files: FileStore,
  filePath: string,
  data: Record<string, unknown>,
): Promise<void> {
  await files.writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}
