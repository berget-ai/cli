import { createAuthenticatedClient } from '../client'
import { logger } from '../utils/logger'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  model?: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  top_p?: number
  apiKey?: string
  onChunk?: (chunk: any) => void
}

/**
 * Service for interacting with the chat API
 * Command group: chat
 */
export class ChatService {
  private static instance: ChatService
  private client = createAuthenticatedClient()

  // Command group name for this service
  public static readonly COMMAND_GROUP = 'chat'

  // Subcommands for this service
  public static readonly COMMANDS = {
    RUN: 'run',
    LIST: 'list',
  }

  private constructor() {}

  public static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService()
    }
    return ChatService.instance
  }

  /**
   * Create a chat completion
   * Command: berget chat completion
   */
  public async createCompletion(options: ChatCompletionOptions): Promise<any> {
    try {
      logger.debug('Starting createCompletion method')

      // Initialize options if undefined
      const optionsCopy = options ? { ...options } : { messages: [] }

      // Check if messages are defined
      if (!optionsCopy.messages || !Array.isArray(optionsCopy.messages)) {
        logger.error('messages is undefined or not an array')
        optionsCopy.messages = []
      }

      // Log the options object
      logger.debug('Starting createCompletion with options:')
      try {
        logger.debug(
          JSON.stringify(
            {
              ...optionsCopy,
              apiKey: optionsCopy.apiKey ? '***' : undefined,
              messages: optionsCopy.messages
                ? `${optionsCopy.messages.length} messages`
                : '0 messages',
            },
            null,
            2,
          ),
        )
      } catch (error) {
        logger.error('Failed to stringify options:', error)
      }

      const headers: Record<string, string> = {}

      // First try to use the authenticated client (with refresh token support)
      // Only fall back to API key flow if explicitly requested or no auth tokens available
      const { TokenManager } = await import('../utils/token-manager')
      const tokenManagerInstance = TokenManager.getInstance()
      const hasValidAuth = tokenManagerInstance.getAccessToken() && !tokenManagerInstance.isTokenExpired()
      
      const envApiKeyForAuth = process.env.BERGET_API_KEY
      const hasExplicitApiKey = !!optionsCopy.apiKey || !!envApiKeyForAuth

      // If we have valid auth tokens and no explicit API key, use authenticated client
      if (hasValidAuth && !hasExplicitApiKey) {
        logger.debug('Using authenticated client with refresh token support')
        // Create a copy without apiKey to let the authenticated client handle auth automatically
        const { apiKey, ...optionsWithoutKey } = optionsCopy
        return this.executeCompletion(optionsWithoutKey, {})
      }

      // Check for environment variables first - prioritize this over everything else
      const envApiKey = process.env.BERGET_API_KEY
      if (envApiKey) {
        logger.debug('Using API key from BERGET_API_KEY environment variable')
        optionsCopy.apiKey = envApiKey
        // Skip the default API key logic if we already have a key
        return this.executeCompletion(optionsCopy, headers)
      }
      // If API key is already provided, use it directly
      else if (optionsCopy.apiKey) {
        logger.debug('Using API key provided in options')
        // Skip the default API key logic if we already have a key
        return this.executeCompletion(optionsCopy, headers)
      }
      // Only try to get the default API key if no API key is provided and no env var is set
      else {
        logger.debug('No API key provided, trying to get default')

        try {
          // Import the DefaultApiKeyManager directly
          logger.debug('Importing DefaultApiKeyManager')

          const DefaultApiKeyManager = (
            await import('../utils/default-api-key')
          ).DefaultApiKeyManager
          const defaultApiKeyManager = DefaultApiKeyManager.getInstance()

          logger.debug('Got DefaultApiKeyManager instance')

          // Try to get the default API key
          logger.debug('Calling promptForDefaultApiKey')

          const defaultApiKeyData = defaultApiKeyManager.getDefaultApiKeyData()
          const apiKey =
            defaultApiKeyData?.key ||
            (await defaultApiKeyManager.promptForDefaultApiKey())

          logger.debug(`Default API key data exists: ${!!defaultApiKeyData}`)
          logger.debug(
            `promptForDefaultApiKey returned: ${apiKey ? 'a key' : 'null'}`,
          )

          if (apiKey) {
            logger.debug('Using API key from default API key manager')
            optionsCopy.apiKey = apiKey
          } else {
            logger.warn('No API key available. You need to either:')
            logger.warn(
              '1. Create an API key with: berget api-keys create --name "My Key"',
            )
            logger.warn(
              '2. Set a default API key with: berget api-keys set-default <id>',
            )
            logger.warn('3. Provide an API key with the --api-key option')
            logger.warn('4. Set the BERGET_API_KEY environment variable')
            logger.warn('\nExample:')
            logger.warn('  export BERGET_API_KEY=your_api_key_here')
            logger.warn('  # or for a single command:')
            logger.warn(
              '  BERGET_API_KEY=your_api_key_here berget chat run google/gemma-3-27b-it',
            )
            throw new Error('No API key provided and no default API key set')
          }

          // Set the API key in the options
          logger.debug('Setting API key in options')

          // Only set the API key if it's not null
          if (apiKey) {
            optionsCopy.apiKey = apiKey
          }
        } catch (error) {
          logger.error('Error getting API key:')
          if (error instanceof Error) {
            logger.error(error.message)
          }
          logger.warn(
            'Please create an API key with: berget api-keys create --name "My Key"',
          )
          throw new Error('Failed to get API key')
        }
      }

      // Set default model if not provided
      if (!optionsCopy.model) {
        logger.debug('No model specified, using default: google/gemma-3-27b-it')
        optionsCopy.model = 'google/gemma-3-27b-it'
      }

      logger.debug('Chat completion options:')
      logger.debug(
        JSON.stringify(
          {
            ...optionsCopy,
            apiKey: optionsCopy.apiKey ? '***' : undefined, // Hide the actual API key in debug output
          },
          null,
          2,
        ),
      )

      return this.executeCompletion(optionsCopy, headers)
    } catch (error) {
      // Improved error handling
      let errorMessage = 'Failed to create chat completion'

      if (error instanceof Error) {
        try {
          // Try to parse the error message as JSON
          const parsedError = JSON.parse(error.message)
          if (parsedError.error && parsedError.error.message) {
            errorMessage = `Chat error: ${parsedError.error.message}`
          }
        } catch (e) {
          // If parsing fails, use the original error message
          errorMessage = `Chat error: ${error.message}`
        }
      }

      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * Execute the completion request with the provided options
   * @param options The completion options
   * @param headers Additional headers to include
   * @returns The completion response
   */
  private async executeCompletion(
    options: ChatCompletionOptions,
    headers: Record<string, string> = {},
  ): Promise<any> {
    try {
      // If an API key is provided, use it for this request
      if (options.apiKey) {
        // API keys should be sent directly, not with Bearer prefix
        headers['Authorization'] = options.apiKey
      }

      // Remove apiKey and onChunk from options before sending to API
      const { apiKey, onChunk, ...requestOptions } = options

      logger.debug('Request options:')
      logger.debug(
        JSON.stringify(
          {
            ...requestOptions,
            messages: requestOptions.messages
              ? `${requestOptions.messages.length} messages`
              : '0 messages',
          },
          null,
          2,
        ),
      )

      // Handle streaming responses differently
      if (requestOptions.stream && onChunk) {
        return await this.handleStreamingResponse(
          { ...requestOptions, onChunk },
          headers,
        )
      } else {
        // Ensure model is always defined for the API call
        const requestBody = {
          ...requestOptions,
          model: requestOptions.model || 'google/gemma-3-27b-it',
        }

        // Debug the headers being sent
        logger.debug('Headers being sent:')
        logger.debug(JSON.stringify(headers, null, 2))

        const response = await this.client.POST('/v1/chat/completions', {
          body: requestBody,
          headers,
        })

        // Check if response has an error property
        const responseAny = response as any
        if (responseAny && responseAny.error)
          throw new Error(JSON.stringify(responseAny.error))

        logger.debug('API response:')
        logger.debug(JSON.stringify(response, null, 2))

        // Output the complete response data for debugging
        logger.debug('Complete response data:')
        logger.debug(JSON.stringify(response.data, null, 2))

        return response.data
      }
    } catch (requestError) {
      logger.debug(
        `Request error: ${
          requestError instanceof Error
            ? requestError.message
            : String(requestError)
        }`,
      )
      throw requestError
    }
  }

  /**
   * Handle the case when no API key is available
   */
  private handleNoApiKey(): never {
    // We've exhausted all options for getting an API key
    logger.warn('No API key available. You need to either:')
    logger.warn(
      '1. Create an API key with: berget api-keys create --name "My Key"',
    )
    logger.warn(
      '2. Set a default API key with: berget api-keys set-default <id>',
    )
    logger.warn('3. Provide an API key with the --api-key option')
    logger.warn('4. Set the BERGET_API_KEY environment variable')
    logger.warn('\nExample:')
    logger.warn('  export BERGET_API_KEY=your_api_key_here')
    logger.warn('  # or for a single command:')
    logger.warn(
      '  BERGET_API_KEY=your_api_key_here berget chat run google/gemma-3-27b-it',
    )
    throw new Error(
      'No API key available. Please provide an API key or set a default API key.',
    )
  }

  /**
   * Handle streaming response from the API
   * @param options Request options
   * @param headers Request headers
   * @returns A promise that resolves when the stream is complete
   */
  private async handleStreamingResponse(
    options: any,
    headers: Record<string, string>,
  ): Promise<any> {
    // Use the same base URL as the client
    const baseUrl = process.env.API_BASE_URL || 'https://api.berget.ai'
    const url = new URL(`${baseUrl}/v1/chat/completions`)

    try {
      logger.debug(`Making streaming request to: ${url.toString()}`)
      logger.debug(`Headers:`, JSON.stringify(headers, null, 2))
      logger.debug(`Body:`, JSON.stringify(options, null, 2))

      // Make fetch request directly to handle streaming
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...headers,
        },
        body: JSON.stringify(options),
      })

      logger.debug(`Response status: ${response.status}`)
      logger.debug(
        `Response headers:`,
        JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2),
      )

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(
          `Stream request failed: ${response.status} ${response.statusText}`,
        )
        logger.error(`Error response: ${errorText}`)
        throw new Error(
          `Stream request failed: ${response.status} ${response.statusText} - ${errorText}`,
        )
      }

      if (!response.body) {
        throw new Error('No response body received')
      }

      // Process the stream
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let fullResponse: any = null
      let buffer = '' // Buffer to accumulate partial JSON data

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        logger.debug(`Received chunk: ${chunk.length} bytes`)

        // Add chunk to buffer
        buffer += chunk
        logger.debug(`Added chunk to buffer. Buffer length: ${buffer.length}`)

        // Process the buffer - it may contain multiple SSE events
        const lines = buffer.split('\n')
        logger.debug(`Processing ${lines.length} lines from buffer`)
        
        // Keep track of processed lines to update buffer
        let processedLines = 0
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          logger.debug(`Line ${i}: "${line}"`)
          
          if (line.startsWith('data:')) {
            const jsonData = line.slice(5).trim()
            logger.debug(`Extracted JSON data: "${jsonData}"`)

            // Skip empty data or [DONE] marker
            if (jsonData === '' || jsonData === '[DONE]') {
              logger.debug(`Skipping empty data or [DONE] marker`)
              processedLines = i + 1
              continue
            }

            // Check if JSON looks complete (basic validation)
            if (!jsonData.startsWith('{')) {
              logger.warn(`JSON data doesn't start with '{', might be partial: "${jsonData.substring(0, 50)}..."`)
              // Don't process this line yet, keep it in buffer
              break
            }

            // Count braces to check if JSON is complete
            let braceCount = 0
            let inString = false
            let escaped = false
            
            for (let j = 0; j < jsonData.length; j++) {
              const char = jsonData[j]
              if (escaped) {
                escaped = false
                continue
              }
              if (char === '\\') {
                escaped = true
                continue
              }
              if (char === '"') {
                inString = !inString
                continue
              }
              if (!inString && char === '{') {
                braceCount++
              } else if (!inString && char === '}') {
                braceCount--
              }
            }
            
            if (braceCount !== 0) {
              logger.warn(`JSON braces don't balance (${braceCount}), treating as partial: "${jsonData.substring(0, 50)}..."`)
              // Don't process this line yet, keep it in buffer
              break
            }

            try {
              logger.debug(`Attempting to parse JSON of length: ${jsonData.length}`)
              const parsedData = JSON.parse(jsonData)
              logger.debug(`Successfully parsed JSON: ${JSON.stringify(parsedData, null, 2)}`)
              processedLines = i + 1 // Mark this line as processed

              // Call the onChunk callback with the parsed data
              if (options.onChunk) {
                options.onChunk(parsedData)
              }

              // Keep track of the full response
              if (!fullResponse) {
                fullResponse = parsedData
              } else if (
                parsedData.choices &&
                parsedData.choices[0] &&
                parsedData.choices[0].delta
              ) {
                // Accumulate content for the full response
                if (parsedData.choices[0].delta.content) {
                  fullContent += parsedData.choices[0].delta.content
                }
              }
            } catch (e) {
              logger.error(`Error parsing chunk: ${e}`)
              logger.error(`JSON parse error at position ${(e as any).message?.match(/position (\d+)/)?.[1] || 'unknown'}`)
              logger.error(`Problematic chunk length: ${jsonData.length}`)
              logger.error(`Problematic chunk content: "${jsonData}"`)
              logger.error(`Chunk starts with: "${jsonData.substring(0, 50)}..."`)
              logger.error(`Chunk ends with: "...${jsonData.substring(jsonData.length - 50)}"`)
              
              // Show character codes around the error position
              const errorPos = parseInt((e as any).message?.match(/position (\d+)/)?.[1] || '0')
              if (errorPos > 0) {
                const start = Math.max(0, errorPos - 20)
                const end = Math.min(jsonData.length, errorPos + 20)
                logger.error(`Context around error position ${errorPos}:`)
                logger.error(`"${jsonData.substring(start, end)}"`)
                logger.error(`Character codes: ${Array.from(jsonData.substring(start, end)).map(c => c.charCodeAt(0)).join(' ')}`)
              }
            }
          }
        }
        
        // Update buffer to only contain unprocessed lines
        if (processedLines > 0) {
          const remainingLines = lines.slice(processedLines)
          buffer = remainingLines.join('\n')
          logger.debug(`Updated buffer. Remaining lines: ${remainingLines.length}, Buffer length: ${buffer.length}`)
        }
      }

      // Construct the final response object similar to non-streaming response
      if (fullResponse) {
        if (fullContent) {
          fullResponse.choices[0].message = {
            role: 'assistant',
            content: fullContent,
          }
        }
        return fullResponse
      }

      return {
        choices: [{ message: { role: 'assistant', content: fullContent } }],
      }
    } catch (error) {
      logger.error(
        `Streaming error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      throw error
    }
  }

  /**
   * List available models
   * Command: berget chat list
   */
  public async listModels(apiKey?: string): Promise<any> {
    try {
      // Check for environment variable first, then fallback to provided API key
      const envApiKey = process.env.BERGET_API_KEY
      const effectiveApiKey = envApiKey || apiKey

      if (effectiveApiKey) {
        const headers = {
          Authorization: effectiveApiKey,
        }

        const { data, error } = await this.client.GET('/v1/models', { headers })
        if (error) throw new Error(JSON.stringify(error))
        return data
      } else {
        const { data, error } = await this.client.GET('/v1/models')
        if (error) throw new Error(JSON.stringify(error))
        return data
      }
    } catch (error) {
      // Improved error handling
      let errorMessage = 'Failed to list models'

      if (error instanceof Error) {
        try {
          // Try to parse the error message as JSON
          const parsedError = JSON.parse(error.message)
          if (parsedError.error) {
            errorMessage = `Models error: ${
              typeof parsedError.error === 'string'
                ? parsedError.error
                : parsedError.error.message || JSON.stringify(parsedError.error)
            }`
          }
        } catch (e) {
          // If parsing fails, use the original error message
          errorMessage = `Models error: ${error.message}`
        }
      }

      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }
}
