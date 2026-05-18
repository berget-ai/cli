import path from 'node:path';

import type { CommandRunner } from './ports/command-runner.js';
import type { FileStore } from './ports/file-store.js';
import type { Prompter } from './ports/prompter.js';

import { getAllAgents, toPiPrompt } from '../../agents/index.js';
import { CancelledError, CommandFailedError, PrerequisiteError } from './errors.js';
import { readJsonMaybe, writeJsonFile } from './utils.js';

const PI_PROVIDER = 'npm:@bergetai/pi-provider';
const PI_PROVIDER_NAME = '@bergetai/pi-provider';

export interface InitPiDeps {
  commands: CommandRunner;
  cwd: string;
  files: FileStore;
  homeDir: string;
  prompter: Prompter;
  scope: 'global' | 'project';
}

export function getPiLabel(state: { global: boolean; project: boolean }): string {
  if (state.project || state.global) return ' (already configured)';
  return '';
}

export async function getPiState(
  files: FileStore,
  homeDir: string,
  cwd: string,
): Promise<{ global: boolean; project: boolean }> {
  const projectSettings = await readJsonMaybe(files, path.join(cwd, '.pi', 'settings.json'));
  const globalSettings = await readJsonMaybe(
    files,
    path.join(homeDir, '.pi', 'agent', 'settings.json'),
  );

  return {
    global: hasPiProviderInSettings(globalSettings),
    project: hasPiProviderInSettings(projectSettings),
  };
}

/* ─── State helpers ─────────────────────────────────────────────────────── */

export async function initPi(deps: InitPiDeps): Promise<void> {
  const { commands, cwd, files, homeDir, prompter, scope } = deps;
  const s = prompter.spinner();

  const installed = await commands.checkInstalled('pi');
  if (!installed) {
    throw new PrerequisiteError('pi');
  }

  const installArguments =
    scope === 'project' ? ['install', '-l', PI_PROVIDER] : ['install', PI_PROVIDER];

  s.start('Installing Berget AI provider for Pi...');
  try {
    await commands.run('pi', installArguments);
    s.stop('Installed Pi provider.');
  } catch {
    s.stop('Pi provider installation failed. Please try again or install manually.');
    throw new CommandFailedError(`pi ${installArguments.join(' ')}`, 1);
  }

  const settingsPath =
    scope === 'project'
      ? path.join(cwd, '.pi', 'settings.json')
      : path.join(homeDir, '.pi', 'agent', 'settings.json');

  const raw = await readJsonMaybe(files, settingsPath);
  const settings: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  if (settings.defaultProvider === 'berget') {
    prompter.note(
      'Berget AI is already set as your default provider.',
      'Default provider already set',
    );
    return;
  }

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

export async function initPiAgent(deps: {
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
      ? path.join(cwd, '.pi', 'SYSTEM.md')
      : path.join(homeDir, '.pi', 'agent', 'SYSTEM.md');

  prompter.note('Pi uses a single system prompt.', 'Agent Setup');

  const shouldInitAgent = await prompter.confirm({
    initialValue: false,
    message: 'Set up an agent for Pi?',
  });

  if (!shouldInitAgent) return false;

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
  try {
    const systemDir =
      scope === 'project' ? path.join(cwd, '.pi') : path.join(homeDir, '.pi', 'agent');
    await files.mkdir(systemDir);
    await files.writeFile(systemPath, toPiPrompt(agent));
    s.stop(`Wrote agent configuration to ${systemPath}`);
  } catch (error) {
    s.stop('Failed to write agent configuration.');
    throw error;
  }
  return true;
}

function hasPiProviderInSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const packages = (settings as Record<string, unknown>).packages;
  if (!Array.isArray(packages)) return false;
  return packages.some((p: unknown) => {
    if (typeof p === 'string') return p.includes(PI_PROVIDER_NAME);
    if (typeof p === 'object' && p !== null) {
      const source = (p as Record<string, unknown>).source;
      return typeof source === 'string' && source.includes(PI_PROVIDER_NAME);
    }
    return false;
  });
}
