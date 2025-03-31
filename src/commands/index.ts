import { Command } from 'commander'
import { registerAuthCommands } from './auth'
import { registerApiKeyCommands } from './api-keys'
import { registerClusterCommands } from './clusters'
import { registerBillingCommands } from './billing'
import { registerModelCommands } from './models'
import { registerUserCommands } from './users'
import { registerChatCommands } from './chat'
import { registerAutocompleteCommands } from './autocomplete'

/**
 * Register all command groups with the program
 */
export function registerCommands(program: Command): void {
  registerAuthCommands(program)
  registerApiKeyCommands(program)
  //registerClusterCommands(program)
  //registerBillingCommands(program)
  registerModelCommands(program)
  registerUserCommands(program)
  registerChatCommands(program)
  registerAutocompleteCommands(program)
}
