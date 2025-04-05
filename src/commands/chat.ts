import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'readline'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import { ChatService, ChatMessage } from '../services/chat-service'
import { ApiKeyService } from '../services/api-key-service'
import { AuthService } from '../services/auth-service'
import { handleError } from '../utils/error-handler'
import { DefaultApiKeyManager } from '../utils/default-api-key'

/**
 * Helper function to get user confirmation
 */
async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise<boolean>((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
    })
  })
}

/**
 * Register chat commands
 */
export function registerChatCommands(program: Command): void {
  const chat = program
    .command(COMMAND_GROUPS.CHAT)
    .description('Interact with AI chat models')

  chat
    .command(SUBCOMMANDS.CHAT.RUN)
    .description('Run a chat session with a specified model')
    .argument('[model]', 'Model to use (default: google/gemma-3-27b-it)')
    .option('-s, --system <message>', 'System message')
    .option('-t, --temperature <temp>', 'Temperature (0-1)', parseFloat)
    .option('-m, --max-tokens <tokens>', 'Maximum tokens to generate', parseInt)
    .option('-k, --api-key <key>', 'API key to use for this chat session')
    .option(
      '--api-key-id <id>',
      'ID of the API key to use from your saved keys'
    )
    .action(async (options) => {
      try {
        const chatService = ChatService.getInstance()

        // Check if we have an API key or need to get one
        let apiKey = options.apiKey
        let apiKeyId = options.apiKeyId

        // If no API key or API key ID provided, check for default API key
        if (!apiKey && !apiKeyId) {
          try {
            const defaultApiKeyManager = DefaultApiKeyManager.getInstance()
            const defaultApiKeyData =
              defaultApiKeyManager.getDefaultApiKeyData()

            if (defaultApiKeyData) {
              apiKeyId = defaultApiKeyData.id
              apiKey = defaultApiKeyData.key
              console.log(
                chalk.dim(`Using default API key: ${defaultApiKeyData.name}`)
              )
            } else {
              // No default API key, prompt the user to create one
              console.log(chalk.yellow('No default API key set.'))

              // Try to prompt for a default API key
              apiKey = await defaultApiKeyManager.promptForDefaultApiKey()

              if (!apiKey) {
                console.log(
                  chalk.red(
                    'Error: An API key is required to use the chat command.'
                  )
                )
                console.log(chalk.yellow('You can:'))
                console.log(
                  chalk.yellow(
                    '1. Create an API key with: berget api-keys create --name "My Key"'
                  )
                )
                console.log(
                  chalk.yellow(
                    '2. Set a default API key with: berget api-keys set-default <id>'
                  )
                )
                console.log(
                  chalk.yellow(
                    '3. Provide an API key with the --api-key option'
                  )
                )
                return
              }
            }
          } catch (error) {
            if (process.argv.includes('--debug')) {
              console.log(
                chalk.yellow('DEBUG: Error checking default API key:')
              )
              console.log(chalk.yellow(String(error)))
            }
          }
        }

        // If no direct API key, try to get one from API key ID
        if (!apiKey && apiKeyId) {
          try {
            const apiKeyService = ApiKeyService.getInstance()
            const keys = await apiKeyService.list()
            const selectedKey = keys.find(
              (key) => key.id.toString() === options.apiKeyId
            )

            if (!selectedKey) {
              console.log(
                chalk.yellow(
                  `API key with ID ${options.apiKeyId} not found. Using default authentication.`
                )
              )
            } else {
              console.log(chalk.dim(`Using API key: ${selectedKey.name}`))

              // We need to rotate the key to get the actual key value
              if (
                await confirm(
                  chalk.yellow(
                    `To use API key "${selectedKey.name}", it needs to be rotated. This will invalidate the current key. Continue? (y/n)`
                  )
                )
              ) {
                const rotatedKey = await apiKeyService.rotate(options.apiKeyId)
                apiKey = rotatedKey.key
                console.log(
                  chalk.green(
                    `API key "${selectedKey.name}" rotated successfully.`
                  )
                )
              } else {
                console.log(
                  chalk.yellow('Using default authentication instead.')
                )
              }
            }
          } catch (error) {
            console.error(chalk.red('Error fetching API key:'))
            console.error(error)
            console.log(chalk.yellow('Using default authentication instead.'))
          }
        }

        // Verify we have authentication before starting chat
        if (!apiKey) {
          try {
            AuthService.getInstance()
          } catch (error) {
            console.log(chalk.red('Error: Authentication required for chat'))
            console.log(chalk.yellow('Please either:'))
            console.log(chalk.yellow('1. Log in with `berget auth login`'))
            console.log(chalk.yellow('2. Provide an API key with `--api-key`'))
            console.log(
              chalk.yellow('3. Provide an API key ID with `--api-key-id`')
            )
            console.log(
              chalk.yellow(
                '4. Set a default API key with `berget api-keys set-default <id>`'
              )
            )
            return
          }
        }

        // Set up readline interface for user input
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })

        // Prepare messages array
        const messages: ChatMessage[] = []

        // Add system message if provided
        if (options.system) {
          messages.push({
            role: 'system',
            content: options.system,
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
              content: input,
            })

            try {
              // Call the API
              const completionOptions: any = {
                model: options.args?.[0] || 'google/gemma-3-27b-it',
                messages: messages,
                temperature:
                  options.temperature !== undefined ? options.temperature : 0.7,
                max_tokens: options.maxTokens || 4096,
              }

              // Only add apiKey if it actually exists
              if (apiKey) {
                completionOptions.apiKey = apiKey
              }

              // Debug output
              if (process.argv.includes('--debug')) {
                console.log(chalk.yellow('DEBUG: Completion options:'))
                console.log(chalk.yellow(JSON.stringify({
                  ...completionOptions,
                  apiKey: completionOptions.apiKey ? '***' : undefined,
                  messages: completionOptions.messages.map((m: any) => ({
                    role: m.role,
                    content: m.content.length > 50 ? m.content.substring(0, 50) + '...' : m.content
                  }))
                }, null, 2)))
              }

              const response = await chatService.createCompletion(
                completionOptions
              )

              // Debug output
              if (program.opts().debug) {
                console.log(chalk.yellow('DEBUG: Full response:'))
                console.log(chalk.yellow(JSON.stringify(response, null, 2)))
              }

              // Check if response has the expected structure
              if (
                !response ||
                !response.choices ||
                !response.choices[0] ||
                !response.choices[0].message
              ) {
                console.error(
                  chalk.red('Error: Unexpected response format from API')
                )
                console.error(
                  chalk.red('Response:', JSON.stringify(response, null, 2))
                )
                throw new Error('Unexpected response format from API')
              }

              // Get assistant's response
              const assistantMessage = response.choices[0].message.content

              // Add to messages array
              messages.push({
                role: 'assistant',
                content: assistantMessage,
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
    .option(
      '--api-key-id <id>',
      'ID of the API key to use from your saved keys'
    )
    .action(async (options) => {
      try {
        // If API key ID is provided, fetch the actual key
        let apiKey = options.apiKey
        let apiKeyId = options.apiKeyId

        // If no API key or API key ID provided, check for default API key
        if (!apiKey && !apiKeyId) {
          const defaultApiKeyManager = DefaultApiKeyManager.getInstance()
          const defaultApiKeyData = defaultApiKeyManager.getDefaultApiKeyData()

          if (defaultApiKeyData) {
            apiKeyId = defaultApiKeyData.id
            console.log(
              chalk.dim(`Using default API key: ${defaultApiKeyData.name}`)
            )
          }
        }

        if (apiKeyId && !apiKey) {
          try {
            const apiKeyService = ApiKeyService.getInstance()
            const keys = await apiKeyService.list()
            const selectedKey = keys.find(
              (key) => key.id.toString() === options.apiKeyId
            )

            if (!selectedKey) {
              console.log(
                chalk.yellow(
                  `API key with ID ${options.apiKeyId} not found. Using default authentication.`
                )
              )
            } else {
              console.log(chalk.dim(`Using API key: ${selectedKey.name}`))

              // We need to rotate the key to get the actual key value
              if (
                await confirm(
                  chalk.yellow(
                    `To use API key "${selectedKey.name}", it needs to be rotated. This will invalidate the current key. Continue? (y/n)`
                  )
                )
              ) {
                const rotatedKey = await apiKeyService.rotate(options.apiKeyId)
                apiKey = rotatedKey.key
                console.log(
                  chalk.green(
                    `API key "${selectedKey.name}" rotated successfully.`
                  )
                )
              } else {
                console.log(
                  chalk.yellow('Using default authentication instead.')
                )
              }
            }
          } catch (error) {
            console.error(chalk.red('Error fetching API key:'))
            console.error(error)
            console.log(chalk.yellow('Using default authentication instead.'))
          }
        }

        const chatService = ChatService.getInstance()
        const models = await chatService.listModels(apiKey)

        // Debug output
        if (program.opts().debug) {
          console.log(chalk.yellow('DEBUG: Models response:'))
          console.log(chalk.yellow(JSON.stringify(models, null, 2)))
        }

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
          if (model.capabilities.function_calling)
            capabilities.push('function_calling')
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
}
