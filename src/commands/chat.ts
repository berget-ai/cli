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
 * Clean AI response by removing internal reasoning text
 */
function cleanAIResponse(response: string): string {
  // Remove text between "analysis" and "assistantfinal" (case insensitive)
  const cleanedResponse = response.replace(/analysis.*?assistantfinal/gis, '')
  
  // Also remove standalone "analysis" or "assistantfinal" words
  return cleanedResponse
    .replace(/^analysis.*$/gim, '')
    .replace(/^assistantfinal.*$/gim, '')
    .trim()
}

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
    .argument('[model]', 'Model to use (default: openai/gpt-oss)')
    .argument('[message]', 'Message to send directly (skips interactive mode)')
    .option('-s, --system <message>', 'System message')
    .option('-t, --temperature <temp>', 'Temperature (0-1)', parseFloat)
    .option('-m, --max-tokens <tokens>', 'Maximum tokens to generate', parseInt)
    .option('-k, --api-key <key>', 'API key to use for this chat session')
    .option(
      '--api-key-id <id>',
      'ID of the API key to use from your saved keys'
    )
    .option('--no-stream', 'Disable streaming (streaming is enabled by default)')
    .action(async (model, message, options) => {
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

        // Prepare messages array
        const messages: ChatMessage[] = []

        // Add system message if provided
        if (options.system) {
          messages.push({
            role: 'system',
            content: options.system,
          })
        }

        // Check if input is being piped in
        let inputMessage = message
        let stdinContent = ''
        
        if (!process.stdin.isTTY) {
          // Read from stdin (piped input)
          const chunks = []
          for await (const chunk of process.stdin) {
            chunks.push(chunk)
          }
          stdinContent = Buffer.concat(chunks).toString('utf8').trim()
        }

        // Combine stdin content with message if both exist
        if (stdinContent && message) {
          inputMessage = `${stdinContent}\n\n${message}`
        } else if (stdinContent && !message) {
          inputMessage = stdinContent
        }

        // If a message is provided (either as argument, from stdin, or both), send it directly and exit
        if (inputMessage) {
          // Add user message
          messages.push({
            role: 'user',
            content: inputMessage,
          })

          try {
            // Call the API
            const completionOptions: ChatCompletionOptions = {
              model: model || 'openai/gpt-oss',
              messages: messages,
              temperature:
                options.temperature !== undefined ? options.temperature : 0.7,
              max_tokens: options.maxTokens || 4096,
              stream: options.stream !== false
            }

            // Only add apiKey if it actually exists
            if (apiKey) {
              completionOptions.apiKey = apiKey
            }
            
            // Add streaming support (now default)
            if (completionOptions.stream) {
              let assistantResponse = ''
              
              // Stream the response in real-time
              completionOptions.onChunk = (chunk: any) => {
                if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                  const content = chunk.choices[0].delta.content
                  try {
                    process.stdout.write(content)
                  } catch (error: any) {
                    // Handle EPIPE errors gracefully (when pipe is closed)
                    if (error.code === 'EPIPE') {
                      // Stop streaming if the pipe is closed
                      return
                    }
                    throw error
                  }
                  assistantResponse += content
                }
              }
              
              try {
                await chatService.createCompletion(completionOptions)
              } catch (streamError) {
                console.error(chalk.red('\nStreaming error:'), streamError)
                
                // Fallback to non-streaming if streaming fails
                console.log(chalk.yellow('Falling back to non-streaming mode...'))
                completionOptions.stream = false
                delete completionOptions.onChunk
                
                const response = await chatService.createCompletion(completionOptions)
                
                if (response && response.choices && response.choices[0] && response.choices[0].message) {
                  assistantResponse = response.choices[0].message.content
                  console.log(assistantResponse)
                }
              }
              
              // Clean the response by removing analysis/reasoning text
              assistantResponse = cleanAIResponse(assistantResponse)
              
              // Clear stdout and write the clean response
              process.stdout.write('\r\x1b[K') // Clear current line
              process.stdout.write(assistantResponse)
              console.log() // Add newline at the end
              return
            }
            
            const response = await chatService.createCompletion(
              completionOptions
            )

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

            // Clean and display the response
            const cleanedMessage = cleanAIResponse(assistantMessage)
            
            if (containsMarkdown(cleanedMessage)) {
              console.log(renderMarkdown(cleanedMessage))
            } else {
              console.log(cleanedMessage)
            }
            
            return
          } catch (error) {
            console.error(chalk.red('Error: Failed to get response'))
            if (error instanceof Error) {
              console.error(chalk.red(error.message))
            }
            process.exit(1)
          }
        }

        // Set up readline interface for user input (only for interactive mode)
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        })

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
                model: model || 'openai/gpt-oss',
                messages: messages,
                temperature:
                  options.temperature !== undefined ? options.temperature : 0.7,
                max_tokens: options.maxTokens || 4096,
                stream: options.stream !== false
              }

              // Only add apiKey if it actually exists
              if (apiKey) {
                completionOptions.apiKey = apiKey
              }
              
              // Add streaming support (now default)
              if (completionOptions.stream) {
                let assistantResponse = ''
                console.log(chalk.blue('Assistant: '))
                
                // Stream the response in real-time
                completionOptions.onChunk = (chunk: any) => {
                  if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                    const content = chunk.choices[0].delta.content
                    try {
                      process.stdout.write(content)
                    } catch (error: any) {
                      // Handle EPIPE errors gracefully (when pipe is closed)
                      if (error.code === 'EPIPE') {
                        // Stop streaming if the pipe is closed
                        return
                      }
                      throw error
                    }
                    assistantResponse += content
                  }
                }
                
                try {
                  await chatService.createCompletion(completionOptions)
                } catch (streamError) {
                  console.error(chalk.red('\nStreaming error:'), streamError)
                  
                  // Fallback to non-streaming if streaming fails
                  console.log(chalk.yellow('Falling back to non-streaming mode...'))
                  completionOptions.stream = false
                  delete completionOptions.onChunk
                  
                  const response = await chatService.createCompletion(completionOptions)
                  
                  if (response && response.choices && response.choices[0] && response.choices[0].message) {
                    assistantResponse = response.choices[0].message.content
                    console.log(assistantResponse)
                  }
                }
                console.log('\n')
                
                // Clean the response by removing analysis/reasoning text
                const cleanedResponse = cleanAIResponse(assistantResponse)
                
                // Add assistant response to messages
                messages.push({
                  role: 'assistant',
                  content: cleanedResponse
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

              // Clean and add to messages array
              const cleanedMessage = cleanAIResponse(assistantMessage)
              messages.push({
                role: 'assistant',
                content: cleanedMessage,
              })

              // Clean and display the response
              const cleanedMessage = cleanAIResponse(assistantMessage)
              
              console.log(chalk.blue('Assistant: '))
              
              // Check if the response contains markdown and render it if it does
              if (containsMarkdown(cleanedMessage)) {
                console.log(renderMarkdown(cleanedMessage))
              } else {
                console.log(cleanedMessage)
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
