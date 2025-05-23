import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'readline'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import { ChatService, ChatMessage, ChatCompletionOptions } from '../services/chat-service'
import { ApiKeyService } from '../services/api-key-service'
import { AuthService } from '../services/auth-service'
import { handleError } from '../utils/error-handler'
import { DefaultApiKeyManager } from '../utils/default-api-key'
import { renderMarkdown, containsMarkdown } from '../utils/markdown-renderer'

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
    .option('--stream', 'Stream the response')
    .action(async (options) => {
      try {
        const chatService = ChatService.getInstance()

        // Check if we have an API key or need to get one
        let apiKey = options.apiKey
        let apiKeyId = options.apiKeyId
        
        // Check for environment variable first
        const envApiKey = process.env.BERGET_API_KEY;
        if (envApiKey) {
          console.log(
            chalk.dim(`Using API key from BERGET_API_KEY environment variable`)
          )
          apiKey = envApiKey;
          
          // Debug the API key (first few characters only)
          if (process.argv.includes('--debug')) {
            console.log(
              chalk.yellow(`DEBUG: API key from env starts with: ${envApiKey.substring(0, 4)}...`)
            )
          }
        }
        // If API key is already provided via command line, use it
        else if (options.apiKey) {
          console.log(
            chalk.dim(`Using API key from command line argument`)
          )
          apiKey = options.apiKey;
        }
        // If no API key or API key ID provided and no env var, check for default API key
        else if (!apiKey && !apiKeyId) {
          try {
            const defaultApiKeyManager = DefaultApiKeyManager.getInstance()
            const defaultApiKeyData = defaultApiKeyManager.getDefaultApiKeyData()

            if (defaultApiKeyData) {
              apiKeyId = defaultApiKeyData.id
              apiKey = defaultApiKeyData.key
              
              if (apiKey) {
                console.log(
                  chalk.dim(`Using default API key: ${defaultApiKeyData.name}`)
                )
              } else {
                console.log(
                  chalk.yellow(`Default API key "${defaultApiKeyData.name}" exists but the key value is missing.`)
                )
                console.log(
                  chalk.yellow(`Try rotating the key with: berget api-keys rotate ${defaultApiKeyData.id}`)
                )
              }
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
            // Check if this is an authentication error
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isAuthError = errorMessage.includes('Unauthorized') || 
                               errorMessage.includes('Authentication failed') ||
                               errorMessage.includes('AUTH_FAILED');
            
            if (isAuthError) {
              console.log(chalk.yellow('Authentication required. Please run `berget auth login` first.'));
            } else {
              console.error(chalk.red('Error fetching API key:'));
              console.error(error);
            }
            console.log(chalk.yellow('Using default authentication instead.'));
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
              const completionOptions: ChatCompletionOptions = {
                model: options.args?.[0] || 'google/gemma-3-27b-it',
                messages: messages,
                temperature:
                  options.temperature !== undefined ? options.temperature : 0.7,
                max_tokens: options.maxTokens || 4096,
                stream: options.stream || false
              }

              // Only add apiKey if it actually exists
              if (apiKey) {
                completionOptions.apiKey = apiKey
              }
              
              // Add streaming support
              if (options.stream) {
                let assistantResponse = ''
                console.log(chalk.blue('Assistant: '))
                
                // For streaming, we'll collect the response and render it at the end
                // since markdown needs the complete text to render properly
                completionOptions.onChunk = (chunk: any) => {
                  if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                    const content = chunk.choices[0].delta.content
                    process.stdout.write(content)
                    assistantResponse += content
                  }
                }
                
                await chatService.createCompletion(completionOptions)
                console.log('\n')
                
                // Add assistant response to messages
                messages.push({
                  role: 'assistant',
                  content: assistantResponse
                })
                
                // Continue the conversation
                askQuestion()
                return
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
              console.log(chalk.blue('Assistant: '))
              
              // Check if the response contains markdown and render it if it does
              if (containsMarkdown(assistantMessage)) {
                console.log(renderMarkdown(assistantMessage))
              } else {
                console.log(assistantMessage)
              }
              
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
          chalk.dim('MODEL ID'.padEnd(40)) +
            chalk.dim('CAPABILITIES')
        )
        console.log(chalk.dim('─'.repeat(70)))

        // Filter to only show active models
        const activeModels = models.data.filter((model: any) => model.active === true);
        
        activeModels.forEach((model: any) => {
          const capabilities = []
          if (model.capabilities.vision) capabilities.push('vision')
          if (model.capabilities.function_calling)
            capabilities.push('function_calling')
          if (model.capabilities.json_mode) capabilities.push('json_mode')

          // Format model ID in Huggingface compatible format (owner/model)
          const modelId = `${model.owned_by.toLowerCase()}/${model.id}`.padEnd(40)
          
          console.log(
            modelId +
            capabilities.join(', ')
          )
        })
      } catch (error) {
        handleError('Failed to list chat models', error)
      }
    })
}
