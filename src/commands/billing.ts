import { Command } from 'commander'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import { createAuthenticatedClient } from '../client'
import { handleError } from '../utils/error-handler'

/**
 * Register billing commands
 */
export function registerBillingCommands(program: Command): void {
  const billing = program
    .command(COMMAND_GROUPS.BILLING)
    .description('Manage billing and usage')

  billing
    .command(SUBCOMMANDS.BILLING.GET_USAGE)
    .description('Get token usage statistics')
    .option('--model <modelId>', 'Get usage for a specific model')
    .action(async (options) => {
      try {
        const client = createAuthenticatedClient()
        let response

        if (options.model) {
          const { data, error } = await client.GET('/v1/usage/tokens/{modelId}', {
            params: { path: { modelId: options.model } },
          })
          if (error) throw new Error(JSON.stringify(error))
          response = data
        } else {
          const { data, error } = await client.GET('/v1/usage/tokens')
          if (error) throw new Error(JSON.stringify(error))
          response = data
        }

        console.log('Token Usage:')
        console.log(JSON.stringify(response, null, 2))
      } catch (error) {
        handleError('Failed to get token usage', error)
      }
    })
}
