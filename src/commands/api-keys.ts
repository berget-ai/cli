import { Command } from 'commander'
import chalk from 'chalk'
import { ApiKeyService, ApiKey } from '../services/api-key-service'
import { handleError } from '../utils/error-handler'
import { DefaultApiKeyManager } from '../utils/default-api-key'
import { TokenManager } from '../utils/token-manager'

/**
 * Register API key commands
 */
export function registerApiKeyCommands(program: Command): void {
  const apiKey = program
    .command(ApiKeyService.COMMAND_GROUP)
    .description('Manage API keys')

  apiKey
    .command(ApiKeyService.COMMANDS.LIST)
    .description('List all API keys')
    .action(async () => {
      try {
        const apiKeyService = ApiKeyService.getInstance()
        const keys = await apiKeyService.list()

        if (keys.length === 0) {
          console.log(
            chalk.yellow(
              'No API keys found. Create one with `berget api-key create --name <name>`',
            ),
          )
          return
        }

        console.log(chalk.bold('Your API keys:'))
        console.log('')

        // Create a table-like format with headers
        console.log(
          chalk.dim('ID (8)'.padEnd(8)) +
            chalk.dim('NAME'.padEnd(25)) +
            chalk.dim('PREFIX'.padEnd(12)) +
            chalk.dim('STATUS'.padEnd(12)) +
            chalk.dim('CREATED'.padEnd(12)) +
            chalk.dim('LAST USED'),
        )

        console.log(chalk.dim('─'.repeat(85)))

        keys.forEach((key: ApiKey) => {
          const lastUsed = key.lastUsed
            ? key.lastUsed.substring(0, 10)
            : 'Never'
          const status = key.active
            ? chalk.green('● Active')
            : chalk.red('● Inactive')

          // Show only first 8 characters of ID for easier reading
          const shortId = String(key.id).substring(0, 8)

          // Format the prefix to ensure it's not too long
          const prefixStr =
            key.prefix.length > 12
              ? key.prefix.substring(0, 12) + '...'
              : key.prefix

          console.log(
            shortId.padEnd(8) +
              key.name.padEnd(25) +
              prefixStr.padEnd(15) +
              status.padEnd(12) +
              key.created.substring(0, 10).padEnd(12) +
              lastUsed,
          )
        })

        console.log('')
        console.log(
          chalk.dim(
            'Use `berget api-key create --name <name>` to create a new API key',
          ),
        )
        console.log(
          chalk.dim('Use `berget api-key delete <id>` to delete an API key'),
        )
        console.log(
          chalk.dim('Use `berget api-key rotate <id>` to rotate an API key'),
        )
      } catch (error) {
        handleError('Failed to list API keys', error)
      }
    })

  apiKey
    .command(ApiKeyService.COMMANDS.CREATE)
    .description('Create a new API key')
    .option('--name <name>', 'Name of the API key')
    .option('--description <description>', 'Description of the API key')
    .option('--debug', 'Show debug information for troubleshooting')
    .action(async (options) => {
      try {
        if (!options.name) {
          console.error(chalk.red('Error: --name is required'))
          console.log('')
          console.log(
            'Usage: berget api-key create --name <name> [--description <description>]',
          )
          return
        }

        if (options.debug) {
          console.log(chalk.blue('Debug mode enabled'))
          console.log(chalk.dim('API Base URL:'), process.env.BERGET_API_URL || 'https://api.berget.ai')
          
          // Check authentication status
          const tokenManager = require('../utils/token-manager').TokenManager.getInstance()
          const hasToken = !!tokenManager.getAccessToken()
          console.log(chalk.dim('Has access token:'), hasToken)
          console.log(chalk.dim('Token expired:'), hasToken ? tokenManager.isTokenExpired() : 'N/A')
          console.log('')
        }

        console.log(chalk.blue('Creating API key...'))

        const apiKeyService = ApiKeyService.getInstance()
        const result = await apiKeyService.create({
          name: options.name,
          description: options.description,
        })

        console.log('')
        console.log(chalk.green('✓ API key created'))
        console.log('')
        console.log(chalk.bold('API key details:'))
        console.log('')
        console.log(`${chalk.dim('ID:')}          ${result.id}`)
        console.log(`${chalk.dim('Name:')}        ${result.name}`)
        if (result.description) {
          console.log(`${chalk.dim('Description:')} ${result.description}`)
        }
        console.log(
          `${chalk.dim('Created:')}     ${new Date(
            result.created,
          ).toLocaleString()}`,
        )
        console.log('')
        console.log(chalk.bold('API key:'))
        console.log(chalk.cyan(result.key))
        console.log('')
        console.log(
          chalk.yellow(
            '⚠️  IMPORTANT: Save this API key in a secure location.',
          ),
        )
        console.log(chalk.yellow('   It will not be displayed again.'))

        console.log('')
        console.log(
          chalk.dim(
            'Use this key in your applications to authenticate with the Berget API.',
          ),
        )
      } catch (error) {
        handleError('Failed to create API key', error)
      }
    })

  apiKey
    .command(ApiKeyService.COMMANDS.DELETE)
    .description('Delete an API key')
    .argument('<identifier>', 'ID (first 8 chars), full ID, or name of the API key to delete')
    .action(async (identifier) => {
      try {
        const apiKeyService = ApiKeyService.getInstance()
        
        // First, get all API keys to find the matching one
        const keys = await apiKeyService.list()
        
        // Try to find the key by:
        // 1. Full ID match
        // 2. Short ID (first 8 chars) match
        // 3. Exact name match
        // 4. Partial name match
        
        // Check for exact matches first (full ID or exact name)
        let exactMatches = keys.filter(key => 
          String(key.id) === identifier ||
          key.name === identifier
        )
        
        // If no exact matches, check for short ID matches
        if (exactMatches.length === 0) {
          exactMatches = keys.filter(key => 
            String(key.id).substring(0, 8) === identifier
          )
        }
        
        // If still no matches, check for partial name matches
        if (exactMatches.length === 0) {
          exactMatches = keys.filter(key => 
            key.name.toLowerCase().includes(identifier.toLowerCase())
          )
        }
        
        // Handle multiple matches
        if (exactMatches.length > 1) {
          console.error(chalk.red(`Error: Multiple API keys found matching "${identifier}"`))
          console.log('')
          console.log('Please be more specific. Matching keys:')
          exactMatches.forEach(key => {
            const shortId = String(key.id).substring(0, 8)
            console.log(`  ${shortId.padEnd(8)} ${key.name}`)
          })
          console.log('')
          console.log('Use the first 8 characters of the ID to specify which key to delete.')
          return
        }
        
        // Handle no matches
        if (exactMatches.length === 0) {
          console.error(chalk.red(`Error: No API key found matching "${identifier}"`))
          console.log('')
          console.log('Available API keys:')
          keys.forEach(key => {
            const shortId = String(key.id).substring(0, 8)
            console.log(`  ${shortId.padEnd(8)} ${key.name}`)
          })
          console.log('')
          console.log('Use the first 8 characters of the ID, full ID, or name to delete.')
          return
        }
        
        const matchingKey = exactMatches[0]
        
        const keyId = String(matchingKey.id)
        const shortId = keyId.substring(0, 8)
        
        console.log(chalk.blue(`Deleting API key ${shortId} (${matchingKey.name})...`))

        await apiKeyService.delete(keyId)

        console.log(chalk.green(`✓ API key ${shortId} (${matchingKey.name}) has been deleted`))
        console.log('')
        console.log(
          chalk.dim(
            'Applications using this key will no longer be able to authenticate.',
          ),
        )
        console.log(
          chalk.dim(
            'Use `berget api-key list` to see your remaining API keys.',
          ),
        )
      } catch (error) {
        handleError('Failed to delete API key', error)
      }
    })

  apiKey
    .command(ApiKeyService.COMMANDS.ROTATE)
    .description(
      'Rotate an API key (creates a new one and invalidates the old one)',
    )
    .argument('<id>', 'ID of the API key to rotate')
    .action(async (id) => {
      try {
        console.log(chalk.blue(`Rotating API key ${id}...`))
        console.log(
          chalk.dim('This will invalidate the old key and generate a new one.'),
        )

        const apiKeyService = ApiKeyService.getInstance()
        const result = await apiKeyService.rotate(id)

        console.log('')
        console.log(chalk.green('✓ API key rotated'))
        console.log('')
        console.log(chalk.bold('New API key details:'))
        console.log('')
        console.log(`${chalk.dim('ID:')}          ${result.id}`)
        console.log(`${chalk.dim('Name:')}        ${result.name}`)
        if (result.description) {
          console.log(`${chalk.dim('Description:')} ${result.description}`)
        }
        console.log(
          `${chalk.dim('Created:')}     ${new Date(
            result.created,
          ).toLocaleString()}`,
        )
        console.log('')
        console.log(chalk.bold('New API key:'))
        console.log(chalk.cyan(result.key))
        console.log('')
        console.log(
          chalk.yellow(
            '⚠️  IMPORTANT: Update your applications with this new API key.',
          ),
        )
        console.log(
          chalk.yellow(
            '   The old key has been invalidated and will no longer work.',
          ),
        )
        console.log(
          chalk.yellow('   This new key will not be displayed again.'),
        )
      } catch (error) {
        handleError('Failed to rotate API key', error)
      }
    })

  apiKey
    .command(ApiKeyService.COMMANDS.DESCRIBE)
    .description('Show usage statistics for an API key')
    .argument('<id>', 'ID of the API key')
    .option('--start <date>', 'Start date (YYYY-MM-DD)')
    .option('--end <date>', 'End date (YYYY-MM-DD)')
    .action(async (id, options) => {
      try {
        console.log(
          chalk.blue(`Fetching usage statistics for API key ${id}...`),
        )

        const apiKeyService = ApiKeyService.getInstance()
        const usage = await apiKeyService.describe(id)

        console.log('')
        console.log(
          chalk.bold(`Usage statistics for API key: ${usage.name} (${id})`),
        )
        console.log('')

        // Period information
        console.log(
          chalk.dim(`Period: ${usage.period.start} to ${usage.period.end}`),
        )
        console.log('')

        // Request statistics
        console.log(chalk.bold('Request statistics:'))
        console.log(
          `Total requests: ${chalk.cyan(usage.requests.total.toLocaleString())}`,
        )

        // Daily breakdown if available
        if (usage.requests.daily && usage.requests.daily.length > 0) {
          console.log('')
          console.log(chalk.bold('Daily breakdown:'))
          console.log(chalk.dim('─'.repeat(30)))
          console.log(chalk.dim('DATE'.padEnd(12) + 'REQUESTS'))

          usage.requests.daily.forEach(
            (day: { date: string; count: number }) => {
              console.log(`${day.date.padEnd(12)}${day.count.toLocaleString()}`)
            },
          )
        }

        // Model usage if available
        if (usage.models && usage.models.length > 0) {
          console.log('')
          console.log(chalk.bold('Model usage:'))
          console.log(chalk.dim('─'.repeat(70)))
          console.log(
            chalk.dim('MODEL'.padEnd(20)) +
              chalk.dim('REQUESTS'.padEnd(10)) +
              chalk.dim('INPUT'.padEnd(12)) +
              chalk.dim('OUTPUT'.padEnd(12)) +
              chalk.dim('TOTAL TOKENS'),
          )

          usage.models.forEach(
            (model: {
              name: string
              requests: number
              tokens: {
                input: number
                output: number
                total: number
              }
            }) => {
              console.log(
                model.name.padEnd(20) +
                  model.requests.toString().padEnd(10) +
                  model.tokens.input.toLocaleString().padEnd(12) +
                  model.tokens.output.toLocaleString().padEnd(12) +
                  model.tokens.total.toLocaleString(),
              )
            },
          )
        }

        console.log('')
        console.log(
          chalk.dim(
            'Use these statistics to understand your API usage and optimize your costs.',
          ),
        )
      } catch (error) {
        handleError('Failed to get API key usage', error)
      }
    })

  apiKey
    .command(ApiKeyService.COMMANDS.SET_DEFAULT)
    .description('Set an API key as the default for chat commands')
    .argument('<id>', 'ID of the API key to set as default')
    .action(async (id) => {
      try {
        const apiKeyService = ApiKeyService.getInstance()
        const keys = await apiKeyService.list()
        const selectedKey = keys.find((key) => key.id.toString() === id)

        if (!selectedKey) {
          console.error(chalk.red(`Error: API key with ID ${id} not found`))
          return
        }

        // Save the default API key
        const defaultApiKeyManager = DefaultApiKeyManager.getInstance()

        // We need to rotate the key to get the actual key value
        const rotatedKey = await apiKeyService.rotate(id)

        defaultApiKeyManager.setDefaultApiKey(
          id,
          selectedKey.name,
          selectedKey.prefix,
          rotatedKey.key,
        )

        console.log(
          chalk.green(
            `✓ API key "${selectedKey.name}" set as default for chat commands`,
          ),
        )
        console.log('')
        console.log(
          chalk.dim(
            'This API key will be used by default when running chat commands',
          ),
        )
        console.log(
          chalk.dim(
            'You can override it with --api-key or --api-key-id options',
          ),
        )
      } catch (error) {
        handleError('Failed to set default API key', error)
      }
    })

  apiKey
    .command(ApiKeyService.COMMANDS.GET_DEFAULT)
    .description('Show the current default API key')
    .action(() => {
      try {
        const defaultApiKeyManager = DefaultApiKeyManager.getInstance()
        const defaultApiKeyData = defaultApiKeyManager.getDefaultApiKeyData()

        if (!defaultApiKeyData) {
          console.log(chalk.yellow('No default API key set'))
          console.log('')
          console.log('To set a default API key, run:')
          console.log(chalk.cyan('  berget api-keys set-default <id>'))
          return
        }

        console.log(chalk.bold('Default API key:'))
        console.log('')
        console.log(`${chalk.dim('ID:')}     ${defaultApiKeyData.id}`)
        console.log(`${chalk.dim('Name:')}   ${defaultApiKeyData.name}`)
        console.log(`${chalk.dim('Prefix:')} ${defaultApiKeyData.prefix}`)
        console.log('')
        console.log(
          chalk.dim(
            'This API key will be used by default when running chat commands',
          ),
        )
        console.log(
          chalk.dim(
            'You can override it with --api-key or --api-key-id options',
          ),
        )
      } catch (error) {
        handleError('Failed to get default API key', error)
      }
    })
}
