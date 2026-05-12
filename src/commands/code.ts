import { Command } from 'commander';

import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure';
import { handleError } from '../utils/error-handler';
import { runInitCommand } from './code/init';

/**
 * Register code commands
 */
export function registerCodeCommands(program: Command): void {
  const code = program
    .command(COMMAND_GROUPS.CODE)
    .description('AI-powered coding assistant with OpenCode');

  code
    .command(SUBCOMMANDS.CODE.INIT)
    .description('Interactive setup for Berget AI coding tools')
    .action(async () => {
      try {
        await runInitCommand();
      } catch (error) {
        handleError('Setup failed', error);
      }
    });
}
