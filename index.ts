#!/usr/bin/env node

import { program } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import { createAuthenticatedClient } from './src/client'
import { handleError } from './src/utils/error-handler'
import chalk from 'chalk'
import { COMMAND_GROUPS, SUBCOMMANDS } from './src/constants/command-structure'
import readline from 'readline'

// Helper function to get user confirmation
async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise<boolean>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// Set version and description
program
  .name('berget')
  .description(
    `______                     _      ___  _____ 
| ___ \\                   | |    / _ \\|_   _|
| |_/ / ___ _ __ __ _  ___| |_  / /_\\ \\ | |  
| ___ \\/ _ \\ '__/ _\` |/ _ \\ __| |  _  | | |  
| |_/ /  __/ | | (_| |  __/ |_  | | | |_| |_ 
\\____/ \\___|_|  \\__, |\\___|\\_\\_ \\_| |_/\\___/ 
                 __/ |                      
                |___/   AI on European terms`
  )
  .version(process.env.npm_package_version || '0.0.1', '-v, --version')
  .option('--local', 'Use local API endpoint (hidden)', false)
  .option('--debug', 'Enable debug output', false)

// Import services
import { AuthService } from './src/services/auth-service'
import { ApiKeyService, ApiKey } from './src/services/api-key-service'
import { ClusterService, Cluster } from './src/services/cluster-service'
import { ChatService, ChatMessage } from './src/services/chat-service'

// Auth commands
const auth = program
  .command(AuthService.COMMAND_GROUP)
  .description('Manage authentication and authorization')

auth
  .command(AuthService.COMMANDS.LOGIN)
  .description('Log in to Berget')
  .action(async () => {
    const authService = AuthService.getInstance()
    await authService.login()
  })

auth
  .command(AuthService.COMMANDS.LOGOUT)
  .description('Log out from Berget')
  .action(() => {
    const { clearAuthToken } = require('./src/client')
    clearAuthToken()
    console.log(chalk.green('You have been logged out from Berget'))
  })

auth
  .command(AuthService.COMMANDS.WHOAMI)
  .description('Show information about the logged in user')
  .action(async () => {
    try {
      const authService = AuthService.getInstance()
      const profile = await authService.whoami()

      if (profile) {
        console.log(
          chalk.bold(`Logged in as: ${profile.name || profile.login}`)
        )
        console.log(`Email: ${chalk.cyan(profile.email || 'Not available')}`)
        console.log(`Role: ${chalk.cyan(profile.role || 'Not available')}`)

        if (profile.company) {
          console.log(`Company: ${chalk.cyan(profile.company.name)}`)
        }
      } else {
        console.log(
          chalk.yellow('You are not logged in. Use `berget login` to log in.')
        )
      }
    } catch (error) {
      handleError('You are not logged in or an error occurred', error)
    }
  })

// API Key commands
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
            'No API keys found. Create one with `berget api-key create --name <name>`'
          )
        )
        return
      }

      console.log(chalk.bold('Your API keys:'))
      console.log('')

      // Create a table-like format with headers
      console.log(
        chalk.dim('ID'.padEnd(10)) +
          chalk.dim('NAME'.padEnd(25)) +
          chalk.dim('PREFIX'.padEnd(12)) +
          chalk.dim('STATUS'.padEnd(12)) +
          chalk.dim('CREATED'.padEnd(12)) +
          chalk.dim('LAST USED')
      )

      console.log(chalk.dim('─'.repeat(85)))

      keys.forEach((key: ApiKey) => {
        const lastUsed = key.lastUsed ? key.lastUsed.substring(0, 10) : 'Never'
        const status = key.active
          ? chalk.green('● Active')
          : chalk.red('● Inactive')

        console.log(
          String(key.id).padEnd(10) +
            key.name.padEnd(25) +
            key.prefix.padEnd(12) +
            status.padEnd(12) +
            key.created.substring(0, 10).padEnd(12) +
            lastUsed
        )
      })

      console.log('')
      console.log(
        chalk.dim(
          'Use `berget api-key create --name <name>` to create a new API key'
        )
      )
      console.log(
        chalk.dim('Use `berget api-key delete <id>` to delete an API key')
      )
      console.log(
        chalk.dim('Use `berget api-key rotate <id>` to rotate an API key')
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
  .action(async (options) => {
    try {
      if (!options.name) {
        console.error(chalk.red('Error: --name is required'))
        console.log('')
        console.log(
          'Usage: berget api-key create --name <name> [--description <description>]'
        )
        return
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
          result.created
        ).toLocaleString()}`
      )
      console.log('')
      console.log(chalk.bold('API key:'))
      console.log(chalk.cyan(result.key))
      console.log('')
      console.log(
        chalk.yellow('⚠️  IMPORTANT: Save this API key in a secure location.')
      )
      console.log(chalk.yellow('   It will not be displayed again.'))

      console.log('')
      console.log(
        chalk.dim(
          'Use this key in your applications to authenticate with the Berget API.'
        )
      )
    } catch (error) {
      handleError('Failed to create API key', error)
    }
  })

apiKey
  .command(ApiKeyService.COMMANDS.DELETE)
  .description('Delete an API key')
  .argument('<id>', 'ID of the API key to delete')
  .action(async (id) => {
    try {
      console.log(chalk.blue(`Deleting API key ${id}...`))

      const apiKeyService = ApiKeyService.getInstance()
      await apiKeyService.delete(id)

      console.log(chalk.green(`✓ API key ${id} has been deleted`))
      console.log('')
      console.log(
        chalk.dim(
          'Applications using this key will no longer be able to authenticate.'
        )
      )
      console.log(
        chalk.dim('Use `berget api-key list` to see your remaining API keys.')
      )
    } catch (error) {
      handleError('Failed to delete API key', error)
    }
  })

apiKey
  .command(ApiKeyService.COMMANDS.ROTATE)
  .description(
    'Rotate an API key (creates a new one and invalidates the old one)'
  )
  .argument('<id>', 'ID of the API key to rotate')
  .action(async (id) => {
    try {
      console.log(chalk.blue(`Rotating API key ${id}...`))
      console.log(
        chalk.dim('This will invalidate the old key and generate a new one.')
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
          result.created
        ).toLocaleString()}`
      )
      console.log('')
      console.log(chalk.bold('New API key:'))
      console.log(chalk.cyan(result.key))
      console.log('')
      console.log(
        chalk.yellow(
          '⚠️  IMPORTANT: Update your applications with this new API key.'
        )
      )
      console.log(
        chalk.yellow(
          '   The old key has been invalidated and will no longer work.'
        )
      )
      console.log(chalk.yellow('   This new key will not be displayed again.'))
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
      console.log(chalk.blue(`Fetching usage statistics for API key ${id}...`))

      const apiKeyService = ApiKeyService.getInstance()
      const usage = await apiKeyService.describe(id)

      console.log('')
      console.log(
        chalk.bold(`Usage statistics for API key: ${usage.name} (${id})`)
      )
      console.log('')

      // Period information
      console.log(
        chalk.dim(`Period: ${usage.period.start} to ${usage.period.end}`)
      )
      console.log('')

      // Request statistics
      console.log(chalk.bold('Request statistics:'))
      console.log(
        `Total requests: ${chalk.cyan(usage.requests.total.toLocaleString())}`
      )

      // Daily breakdown if available
      if (usage.requests.daily && usage.requests.daily.length > 0) {
        console.log('')
        console.log(chalk.bold('Daily breakdown:'))
        console.log(chalk.dim('─'.repeat(30)))
        console.log(chalk.dim('DATE'.padEnd(12) + 'REQUESTS'))

        usage.requests.daily.forEach((day: { date: string; count: number }) => {
          console.log(`${day.date.padEnd(12)}${day.count.toLocaleString()}`)
        })
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
            chalk.dim('TOTAL TOKENS')
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
                model.tokens.total.toLocaleString()
            )
          }
        )
      }

      console.log('')
      console.log(
        chalk.dim(
          'Use these statistics to understand your API usage and optimize your costs.'
        )
      )
    } catch (error) {
      handleError('Failed to get API key usage', error)
    }
  })

// Cluster commands
const cluster = program
  .command(ClusterService.COMMAND_GROUP)
  .description('Manage Berget clusters')

// Removed cluster create command as it's not available in the API

cluster
  .command(ClusterService.COMMANDS.LIST)
  .description('List all Berget clusters')
  .action(async () => {
    try {
      const clusterService = ClusterService.getInstance()
      const clusters = await clusterService.list()

      console.log('NAME                   STATUS    NODES    CREATED')
      clusters.forEach((cluster: Cluster) => {
        console.log(
          `${cluster.name.padEnd(22)} ${cluster.status.padEnd(9)} ${String(
            cluster.nodes
          ).padEnd(8)} ${cluster.created}`
        )
      })
    } catch (error) {
      handleError('Failed to list clusters', error)
    }
  })

cluster
  .command(ClusterService.COMMANDS.GET_USAGE)
  .description('Get usage metrics for a specific cluster')
  .argument('<clusterId>', 'Cluster ID')
  .action(async (clusterId) => {
    try {
      const clusterService = ClusterService.getInstance()
      const usage = await clusterService.getUsage(clusterId)

      console.log('Cluster Usage:')
      console.log(JSON.stringify(usage, null, 2))
    } catch (error) {
      handleError('Failed to get cluster usage', error)
    }
  })

cluster
  .command(ClusterService.COMMANDS.DESCRIBE)
  .description('Get detailed information about a cluster')
  .argument('<clusterId>', 'Cluster ID')
  .action(async (clusterId) => {
    try {
      const clusterService = ClusterService.getInstance()
      const clusterInfo = await clusterService.describe(clusterId)

      console.log('Cluster Details:')
      console.log(JSON.stringify(clusterInfo, null, 2))
    } catch (error) {
      handleError('Failed to describe cluster', error)
    }
  })

// Autocomplete command
program
  .command('autocomplete')
  .command('install')
  .description('Install shell autocompletion')
  .action(() => {
    console.log(chalk.green('✓ Berget autocomplete installed in your shell'))
    console.log(chalk.green('✓ Shell completion for kubectl also installed'))
    console.log('')
    console.log('Restart your shell or run:')
    console.log('  source ~/.bashrc')
  })

// Removed flux commands as they're not available in the API

// Removed collaborator commands as they're not available in the API

// Removed helm commands as they're not available in the API

// Removed kubernetes-like commands as they're not available in the API

// Add token usage command
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

// Add models command
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
          'ID                      OWNED BY                  CAPABILITIES'
        )
        // Ensure response has the expected structure
        const modelData = response as { data?: any[] };
        if (modelData.data) {
          modelData.data.forEach((model: any) => {
            const capabilities = []
            if (model.capabilities.vision) capabilities.push('vision')
            if (model.capabilities.function_calling)
              capabilities.push('function_calling')
            if (model.capabilities.json_mode) capabilities.push('json_mode')

            console.log(
              `${model.id.padEnd(24)} ${model.owned_by.padEnd(
                25
              )} ${capabilities.join(', ')}`
            )
          })
        }
      } catch (error) {
        handleError('Failed to get models', error)
      }
    }
  })

// Add team command
const users = program
  .command(COMMAND_GROUPS.USERS)
  .description('Manage users')

users
  .command(SUBCOMMANDS.USERS.LIST)
  .description('List team members')
  .action(async () => {
    try {
      const client = createAuthenticatedClient()
      const { data, error } = await client.GET('/v1/users')
      if (error) throw new Error(JSON.stringify(error))

      console.log('Team Members:')
      console.log(
        'NAME                     EMAIL                           ROLE'
      )
      data.forEach((user: any) => {
        console.log(
          `${user.name.padEnd(24)} ${user.email.padEnd(30)} ${user.role}`
        )
      })
    } catch (error) {
      handleError('Failed to list team members', error)
    }
  })

// Add chat commands
const chat = program
  .command(COMMAND_GROUPS.CHAT)
  .description('Interact with AI chat models')

chat
  .command(SUBCOMMANDS.CHAT.RUN)
  .description('Run a chat session with a specified model')
  .argument('[model]', 'Model to use (default: berget-70b-instruct)')
  .option('-s, --system <message>', 'System message')
  .option('-t, --temperature <temp>', 'Temperature (0-1)', parseFloat)
  .option('-m, --max-tokens <tokens>', 'Maximum tokens to generate', parseInt)
  .option('-k, --api-key <key>', 'API key to use for this chat session')
  .option('--api-key-id <id>', 'ID of the API key to use from your saved keys')
  .action(async (options) => {
    try {
      const chatService = ChatService.getInstance()
      
      // Check if we have an API key or need to get one
      let apiKey = options.apiKey;
      
      // If no direct API key, try to get one from API key ID
      if (!apiKey && options.apiKeyId) {
        try {
          const apiKeyService = ApiKeyService.getInstance();
          const keys = await apiKeyService.list();
          const selectedKey = keys.find(key => key.id.toString() === options.apiKeyId);
          
          if (!selectedKey) {
            console.log(chalk.yellow(`API key with ID ${options.apiKeyId} not found. Using default authentication.`));
          } else {
            console.log(chalk.dim(`Using API key: ${selectedKey.name}`));
            
            // We need to rotate the key to get the actual key value
            if (await confirm(chalk.yellow(`To use API key "${selectedKey.name}", it needs to be rotated. This will invalidate the current key. Continue? (y/n)`))) {
              const rotatedKey = await apiKeyService.rotate(options.apiKeyId);
              apiKey = rotatedKey.key;
              console.log(chalk.green(`API key "${selectedKey.name}" rotated successfully.`));
            } else {
              console.log(chalk.yellow('Using default authentication instead.'));
            }
          }
        } catch (error) {
          console.error(chalk.red('Error fetching API key:'));
          console.error(error);
          console.log(chalk.yellow('Using default authentication instead.'));
        }
      }
      
      // Verify we have authentication before starting chat
      if (!apiKey) {
        // Try to check if user is authenticated
        try {
          const authService = AuthService.getInstance();
          const isAuthenticated = await authService.isAuthenticated();
          
          if (!isAuthenticated) {
            console.log(chalk.red('Error: Authentication required for chat'));
            console.log(chalk.yellow('Please either:'));
            console.log(chalk.yellow('1. Log in with `berget auth login`'));
            console.log(chalk.yellow('2. Provide an API key with `--api-key`'));
            console.log(chalk.yellow('3. Provide an API key ID with `--api-key-id`'));
            return;
          }
        } catch (error) {
          console.log(chalk.red('Error: Authentication required for chat'));
          console.log(chalk.yellow('Please either:'));
          console.log(chalk.yellow('1. Log in with `berget auth login`'));
          console.log(chalk.yellow('2. Provide an API key with `--api-key`'));
          console.log(chalk.yellow('3. Provide an API key ID with `--api-key-id`'));
          return;
        }
      }
      
      // Set up readline interface for user input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })
      
      // Prepare messages array
      const messages: ChatMessage[] = []
      
      // Add system message if provided
      if (options.system) {
        messages.push({
          role: 'system',
          content: options.system
        })
      }
      
      console.log(chalk.cyan('Chat with Berget AI (type "exit" to quit)'))
      console.log(chalk.cyan('----------------------------------------'))
      
      // Start the conversation loop
      const askQuestion = () => {
        rl.question(chalk.green('You: '), async (input) => {
          // Check if user wants to exit
          if (input.toLowerCase() === 'exit') {
            console.log(chalk.cyan('Goodbye!'))
            rl.close()
            return
          }
          
          // Add user message
          messages.push({
            role: 'user',
            content: input
          })
          
          try {
            // Call the API
            const response = await chatService.createCompletion({
              model: options.args?.[0] || 'berget-70b-instruct',
              messages: messages,
              temperature: options.temperature !== undefined ? options.temperature : 0.7,
              max_tokens: options.maxTokens || 4096,
              apiKey: apiKey
            })
            
            // Debug output
            if (program.opts().debug) {
              console.log(chalk.yellow('DEBUG: Full response:'))
              console.log(chalk.yellow(JSON.stringify(response, null, 2)))
            }
            
            // Check if response has the expected structure
            if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
              console.error(chalk.red('Error: Unexpected response format from API'))
              console.error(chalk.red('Response:', JSON.stringify(response, null, 2)))
              throw new Error('Unexpected response format from API')
            }
            
            // Get assistant's response
            const assistantMessage = response.choices[0].message.content
            
            // Add to messages array
            messages.push({
              role: 'assistant',
              content: assistantMessage
            })
            
            // Display the response
            console.log(chalk.blue('Assistant: ') + assistantMessage)
            console.log() // Empty line for better readability
            
            // Continue the conversation
            askQuestion()
          } catch (error) {
            console.error(chalk.red('Error: Failed to get response'))
            if (error instanceof Error) {
              console.error(chalk.red(error.message))
            }
            // Continue despite error
            askQuestion()
          }
        })
      }
      
      // Start the conversation
      askQuestion()
    } catch (error) {
      handleError('Failed to create chat completion', error)
    }
  })

chat
  .command(SUBCOMMANDS.CHAT.LIST)
  .description('List available chat models')
  .option('-k, --api-key <key>', 'API key to use for this request')
  .option('--api-key-id <id>', 'ID of the API key to use from your saved keys')
  .action(async (options) => {
    try {
      // If API key ID is provided, fetch the actual key
      let apiKey = options.apiKey;
      if (options.apiKeyId && !options.apiKey) {
        try {
          const apiKeyService = ApiKeyService.getInstance();
          const keys = await apiKeyService.list();
          const selectedKey = keys.find(key => key.id.toString() === options.apiKeyId);
          
          if (!selectedKey) {
            console.log(chalk.yellow(`API key with ID ${options.apiKeyId} not found. Using default authentication.`));
          } else {
            console.log(chalk.dim(`Using API key: ${selectedKey.name}`));
            
            // We need to rotate the key to get the actual key value
            if (await confirm(chalk.yellow(`To use API key "${selectedKey.name}", it needs to be rotated. This will invalidate the current key. Continue? (y/n)`))) {
              const rotatedKey = await apiKeyService.rotate(options.apiKeyId);
              apiKey = rotatedKey.key;
              console.log(chalk.green(`API key "${selectedKey.name}" rotated successfully.`));
            } else {
              console.log(chalk.yellow('Using default authentication instead.'));
            }
          }
        } catch (error) {
          console.error(chalk.red('Error fetching API key:'));
          console.error(error);
          console.log(chalk.yellow('Using default authentication instead.'));
        }
      }
      
      const chatService = ChatService.getInstance()
      const models = await chatService.listModels(apiKey)
      
      console.log(chalk.bold('Available Chat Models:'))
      console.log(chalk.dim('─'.repeat(70)))
      console.log(
        chalk.dim('MODEL ID'.padEnd(30)) +
        chalk.dim('OWNER'.padEnd(25)) +
        chalk.dim('CAPABILITIES')
      )
      console.log(chalk.dim('─'.repeat(70)))
      
      models.data.forEach((model: any) => {
        const capabilities = []
        if (model.capabilities.vision) capabilities.push('vision')
        if (model.capabilities.function_calling) capabilities.push('function_calling')
        if (model.capabilities.json_mode) capabilities.push('json_mode')
        
        console.log(
          model.id.padEnd(30) +
          model.owned_by.padEnd(25) +
          capabilities.join(', ')
        )
      })
    } catch (error) {
      handleError('Failed to list chat models', error)
    }
  })


// Auto-detect .bergetconfig and switch clusters
const checkBergetConfig = () => {
  const configPath = path.join(process.cwd(), '.bergetconfig')
  if (fs.existsSync(configPath)) {
    try {
      const config = fs.readFileSync(configPath, 'utf8')
      const match = config.match(/cluster:\s*(.+)/)
      if (match && match[1]) {
        const clusterName = match[1].trim()
        console.log(`🔄 Berget: Switched to cluster "${clusterName}"`)
        console.log('✓ kubectl config updated')
        console.log('')
      }
    } catch (error) {
      // Silently ignore errors reading config
    }
  }
}

// Check for .bergetconfig if not running a command
if (process.argv.length <= 2) {
  checkBergetConfig()
}

program.parse(process.argv)
