import { Command } from 'commander'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import { createAuthenticatedClient } from '../client'
import { handleError } from '../utils/error-handler'

/**
 * Register models commands
 */
export function registerModelCommands(program: Command): void {
  const models = program
    .command(COMMAND_GROUPS.MODELS)
    .description('Manage AI models')

  models
    .command(SUBCOMMANDS.MODELS.LIST)
    .description('List available AI models')
    .option('--id <modelId>', 'Get details for a specific model')
    .action(async (options) => {
      try {
        const client = createAuthenticatedClient()
        let response

        if (options.id) {
          const { data, error } = await client.GET('/v1/models/{modelId}', {
            params: { path: { modelId: options.id } },
          })
          if (error) throw new Error(JSON.stringify(error))
          response = data

          console.log('Model Details:')
          console.log(JSON.stringify(response, null, 2))
        } else {
          const { data, error } = await client.GET('/v1/models')
          if (error) throw new Error(JSON.stringify(error))
          response = data

          console.log('Available Models:')
          console.log(
            'ID                                                 OWNED BY                 CAPABILITIES'
          )
          // Ensure response has the expected structure
          const modelData = response as { data?: any[] }
          if (modelData.data) {
            modelData.data.forEach((model: any) => {
              const capabilities = []
              if (model.capabilities.vision) capabilities.push('vision')
              if (model.capabilities.function_calling)
                capabilities.push('function_calling')
              if (model.capabilities.json_mode) capabilities.push('json_mode')

              console.log(
                `${model.root.padEnd(50)} ${model.owned_by.padEnd(
                  24
                )} ${capabilities.join(', ')}`
              )
            })
          }
        }
      } catch (error) {
        handleError('Failed to get models', error)
      }
    })
}
