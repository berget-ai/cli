import chalk from 'chalk';
import * as os from 'node:os';

import type { ApiKeyServicePort, AuthServicePort } from './ports/auth-services.js';
import type { CommandRunner } from './ports/command-runner.js';
import type { FileStore } from './ports/file-store.js';
import type { Prompter } from './ports/prompter.js';

import { ApiKeyService } from '../../services/api-key-service.js';
import { AuthService } from '../../services/auth-service.js';
import { ClackPrompter } from './adapters/clack-prompter.js';
import { FsFileStore } from './adapters/fs-file-store.js';
import { SpawnCommandRunner } from './adapters/spawn-command-runner.js';
import { configureAuth } from './auth-sync.js';
import { CancelledError, CommandFailedError, PrerequisiteError } from './errors.js';
import {
  getOpencodeLabel,
  getOpencodeState,
  initOpenCode,
  initOpenCodeAgents,
} from './opencode.js';
import { getPiLabel, getPiState, initPi, initPiAgent } from './pi.js';

export interface WizardDeps {
  apiKeyService: ApiKeyServicePort;
  authService: AuthServicePort;
  commands: CommandRunner;
  cwd: string;
  files: FileStore;
  homeDir: string;
  prompter: Prompter;
}

export async function runInit(deps: WizardDeps): Promise<void> {
  const { apiKeyService, authService, commands, cwd, files, homeDir, prompter } = deps;

  prompter.intro(`${chalk.bgGreen.black(' berget code ')}`);
  prompter.note(
    `Ask questions and report bugs on our GitHub repository:\n\n${chalk.cyan.underline('https://github.com/berget-ai/cli')}`,
    'Need help?',
  );

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
    await initOpenCode({ commands, cwd, files, homeDir, prompter, scope });
    await initOpenCodeAgents({ cwd, files, homeDir, prompter, scope });

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
    await initPi({ commands, cwd, files, homeDir, prompter, scope });
    await initPiAgent({ cwd, files, homeDir, prompter, scope });

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

  prompter.outro('Initialization complete!');
}

export async function runInitCommand(): Promise<void> {
  try {
    await runInit({
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
