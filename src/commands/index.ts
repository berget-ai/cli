import { Command } from 'commander';

import { registerApiKeyCommands } from './api-keys';
import { registerAuthCommands } from './auth';
import { registerAutocompleteCommands } from './autocomplete';
import { registerBillingCommands } from './billing';
import { registerChatCommands } from './chat';
import { registerClusterCommands } from './clusters';
import { registerCodeCommands } from './code';
import { registerModelCommands } from './models';
import { registerUserCommands } from './users';

/**
 * Register all command groups with the program
 */
export function registerCommands(program: Command): void {
  registerAuthCommands(program);
  registerApiKeyCommands(program);
  registerClusterCommands(program);
  registerBillingCommands(program);
  registerModelCommands(program);
  registerUserCommands(program);
  registerChatCommands(program);
  registerAutocompleteCommands(program);
  registerCodeCommands(program);
}
