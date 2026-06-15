import path from 'node:path';

import type { CommandRunner } from './ports/command-runner.js';
import type { FileStore } from './ports/file-store.js';
import type { Prompter } from './ports/prompter.js';

import { CommandFailedError } from './errors.js';
import { readJsonMaybe, writeJsonFile } from './utils.js';
import { getPiSettingsPath } from './xdg-paths.js';

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
  const globalSettings = await readJsonMaybe(files, getPiSettingsPath(homeDir));

  return {
    global: hasPiProviderInSettings(globalSettings),
    project: hasPiProviderInSettings(projectSettings),
  };
}

/* ─── State helpers ─────────────────────────────────────────────────────── */

export async function initPi(deps: InitPiDeps): Promise<void> {
  const { commands, cwd, files, homeDir, prompter, scope } = deps;
  const s = prompter.spinner();

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
    scope === 'project' ? path.join(cwd, '.pi', 'settings.json') : getPiSettingsPath(homeDir);

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
