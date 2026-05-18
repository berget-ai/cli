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
import { configureAuth, ensureCliAuth } from './auth-sync.js';
import { CancelledError, CommandFailedError, FatalError, PrerequisiteError } from './errors.js';
import {
  getOpencodeLabel,
  getOpencodeState,
  initOpenCode,
  initOpenCodeAgents,
} from './opencode.js';
import { getPiLabel, getPiState, initPi, initPiAgent } from './pi.js';
import { checkTool, promptForMissingTool } from './tool-check.js';

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

  const cliAuth = await ensureCliAuth({ authService, files, homeDir, prompter });

  const ocState = await getOpencodeState(files, homeDir, cwd);
  const piState = await getPiState(files, homeDir, cwd);

  const tool = await prompter.select<'opencode' | 'pi'>({
    initialValue: 'opencode',
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

  // Check if the selected tool is installed
  const toolCheck = await checkTool(commands, tool);
  let toolConfigured = toolCheck.installed;

  if (!toolCheck.installed) {
    // Non-TTY guard: print instructions and exit instead of hanging
    // Only trigger when explicitly false (not undefined, as in tests)
    if (process.stdin.isTTY === false) {
      console.error(`${toolCheck.name} is not installed.`);
      console.error('Install it first:');
      console.error(`  ${toolCheck.installCommand}`);
      console.error(`Docs: ${toolCheck.docsUrl}`);
      process.exit(1);
    }

    const action = await promptForMissingTool(prompter, toolCheck);

    if (action === 'exit') {
      throw new CancelledError();
    }

    if (action === 'retry') {
      // Re-check once. If still missing, show prompt again.
      const recheck = await checkTool(commands, tool);
      if (recheck.installed) {
        toolConfigured = true;
      } else {
        const secondAction = await promptForMissingTool(prompter, recheck);
        if (secondAction === 'exit') throw new CancelledError();
        if (secondAction === 'continue') toolConfigured = false;
        if (secondAction === 'retry') {
          // One more check, then give up and treat as "continue"
          const finalCheck = await checkTool(commands, tool);
          toolConfigured = finalCheck.installed;
        }
      }
    }

    if (action === 'continue') {
      toolConfigured = false;
    }
  }

  const scope = await prompter.select<'global' | 'project'>({
    initialValue: 'project',
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

  prompter.log('step', 'Configuring authentication...');

  const authResult = await configureAuth(
    { apiKeyService, files, homeDir, prompter },
    tool,
    cliAuth,
  );

  // Only configure the tool if it's installed (or user chose retry and it was found)
  if (toolConfigured) {
    if (tool === 'opencode') {
      await initOpenCode({ commands, cwd, files, homeDir, prompter, scope });
      await initOpenCodeAgents({ cwd, files, homeDir, prompter, scope });
    } else {
      await initPi({ commands, cwd, files, homeDir, prompter, scope });
      await initPiAgent({ cwd, files, homeDir, prompter, scope });
    }
  }

  const nextSteps = toolConfigured
    ? authResult.authenticated
      ? tool === 'opencode'
        ? "You're all set!\n\n1. Run: opencode\n2. Select model: /models"
        : "You're all set!\n\n1. Restart Pi or run /reload\n2. Select model: /model"
      : tool === 'opencode'
        ? 'Next steps:\n\n1. Run: opencode\n2. Type: /connect\n3. Choose your auth method:\n   • "Login with Berget" — Berget Code plan\n   • "Enter Berget API Key manually"\n   • (or set BERGET_API_KEY env var)\n4. Select model: /models'
        : 'Next steps:\n\n1. Restart Pi or run /reload\n2. Type: /login\n3. Choose your auth method:\n   • "Use a subscription" → Berget AI\n   • (or set BERGET_API_KEY env var)\n4. Select model: /model'
    : authResult.authenticated
      ? tool === 'opencode'
        ? `Auth is configured. Next steps:\n\n1. Install OpenCode:\n   ${toolCheck.installCommand}\n2. Run: opencode\n3. Select model: /models`
        : `Auth is configured. Next steps:\n\n1. Install Pi:\n   ${toolCheck.installCommand}\n2. Run: pi\n3. Select model: /model`
      : tool === 'opencode'
        ? `Next steps:\n\n1. Install OpenCode:\n   ${toolCheck.installCommand}\n2. Run: opencode\n3. Authenticate with Berget AI`
        : `Next steps:\n\n1. Install Pi:\n   ${toolCheck.installCommand}\n2. Run: pi\n3. Authenticate with Berget AI`;

  const toolName = tool === 'opencode' ? 'OpenCode' : 'Pi';
  const docsUrl =
    tool === 'opencode'
      ? 'https://github.com/berget-ai/opencode-berget-auth'
      : 'https://github.com/berget-ai/pi-provider';

  prompter.note(
    `${nextSteps}\n\nFor more information, see official docs:\n\n${docsUrl}`,
    `Successfully configured Berget AI for ${toolName}`,
  );

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
    process.exitCode = 0;
  } catch (error) {
    if (error instanceof CancelledError) {
      process.exitCode = 130;
      return;
    }
    if (error instanceof FatalError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    if (error instanceof PrerequisiteError) {
      console.error(`Missing required binary: ${error.binary}`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof CommandFailedError) {
      console.error(error.message);
      process.exitCode = 5;
      return;
    }
    throw error;
  }
}
