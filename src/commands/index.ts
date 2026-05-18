import { Command } from 'commander';

import { registerApiKeyCommands } from './api-keys.js';
import { registerAuthCommands } from './auth.js';
import { registerAutocompleteCommands } from './autocomplete.js';
import { registerBillingCommands } from './billing.js';
import { registerChatCommands } from './chat.js';
import { registerClusterCommands } from './clusters.js';
import { registerCodeCommands } from './code.js';
import { registerModelCommands } from './models.js';
import { registerUserCommands } from './users.js';

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
