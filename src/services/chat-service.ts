import { createAuthenticatedClient, API_BASE_URL } from '../client'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import chalk from 'chalk'
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
    LIST: 'list'
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
      
      // Check if options is defined
      if (!options) {
        logger.error('options is undefined')
        throw new Error('Chat completion options are undefined')
      }
      
      // Log the raw options object
      logger.debug('Raw options: ' + (typeof options) + ' ' + (options ? 'defined' : 'undefined'))
      
      const headers: Record<string, string> = {}
      
      logger.debug('Starting createCompletion with options:')
      try {
        logger.debug(JSON.stringify({
          ...options,
          apiKey: options.apiKey ? '***' : undefined,
          messages: options.messages ? `${options.messages.length} messages` : undefined
        }, null, 2))
      } catch (error) {
        logger.error('Failed to stringify options:', error)
      }
      
      // Create a copy of options to avoid modifying the original
      const optionsCopy = { ...options }
      
      logger.debug('Checking for API key')
      logger.debug(`optionsCopy.apiKey exists: ${!!optionsCopy.apiKey}`)
      
      
      // Check for environment variables first - prioritize this over everything else
      const envApiKey = process.env.BERGET_API_KEY;
      if (envApiKey) {
        logger.debug('Using API key from BERGET_API_KEY environment variable');
        optionsCopy.apiKey = envApiKey;
      } 
      // Only try to get the default API key if no API key is provided and no env var is set
      else if (!optionsCopy.apiKey) {
        logger.debug('No API key provided, trying to get default')
        
        try {
          // Import the DefaultApiKeyManager directly
          logger.debug('Importing DefaultApiKeyManager')
          
          const DefaultApiKeyManager = (await import('../utils/default-api-key')).DefaultApiKeyManager;
          const defaultApiKeyManager = DefaultApiKeyManager.getInstance();
          
          logger.debug('Got DefaultApiKeyManager instance')
          
          // Try to get the default API key
          logger.debug('Calling promptForDefaultApiKey')
          
          const defaultApiKeyData = defaultApiKeyManager.getDefaultApiKeyData();
          const apiKey = defaultApiKeyData?.key || await defaultApiKeyManager.promptForDefaultApiKey();
          
          logger.debug(`Default API key data exists: ${!!defaultApiKeyData}`)
          logger.debug(`promptForDefaultApiKey returned: ${apiKey ? 'a key' : 'null'}`)
          
          if (apiKey) {
            logger.debug('Using API key from default API key manager');
            optionsCopy.apiKey = apiKey;
          } else {
            logger.warn('No API key available. You need to either:');
            logger.warn('1. Create an API key with: berget api-keys create --name "My Key"');
            logger.warn('2. Set a default API key with: berget api-keys set-default <id>');
            logger.warn('3. Provide an API key with the --api-key option');
            logger.warn('4. Set the BERGET_API_KEY environment variable');
            logger.warn('\nExample:');
            logger.warn('  export BERGET_API_KEY=your_api_key_here');
            logger.warn('  # or for a single command:');
            logger.warn('  BERGET_API_KEY=your_api_key_here berget chat run google/gemma-3-27b-it');
            throw new Error('No API key provided and no default API key set');
          }
          
          // Set the API key in the options
          logger.debug('Setting API key in options')
          
          // Only set the API key if it's not null
          if (apiKey) {
            optionsCopy.apiKey = apiKey;
          }
        } catch (error) {
          logger.error('Error getting API key:')
          if (error instanceof Error) {
            logger.error(error.message)
          }
          logger.warn('Please create an API key with: berget api-keys create --name "My Key"')
          throw new Error('Failed to get API key')
        }
      }
      
      // Set default model if not provided
      if (!optionsCopy.model) {
        logger.debug('No model specified, using default: google/gemma-3-27b-it')
        optionsCopy.model = 'google/gemma-3-27b-it'
      }
      
      logger.debug('Chat completion options:')
      logger.debug(JSON.stringify({
        ...optionsCopy,
        apiKey: optionsCopy.apiKey ? '***' : undefined // Hide the actual API key in debug output
      }, null, 2))
      
      // If an API key is provided, use it for this request
      if (optionsCopy.apiKey) {
        headers['Authorization'] = `Bearer ${optionsCopy.apiKey}`
        // Remove apiKey from options before sending to API
        const { apiKey, ...requestOptions } = optionsCopy
        
        logger.debug('Using provided API key')
        logger.debug('Request options:')
        logger.debug(JSON.stringify(requestOptions, null, 2))
        
        try {
          // Handle streaming responses differently
          if (requestOptions.stream && requestOptions.onChunk) {
            return await this.handleStreamingResponse(requestOptions, headers);
          } else {
            // Ensure model is always defined for the API call
            const requestBody = {
              ...requestOptions,
              model: requestOptions.model || 'google/gemma-3-27b-it'
            };
            
            const response = await this.client.POST('/v1/chat/completions', {
              body: requestBody,
              headers
            })
            
            // Check if response has an error property
            const responseAny = response as any;
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
          logger.debug(`Request error: ${requestError instanceof Error ? requestError.message : String(requestError)}`)
          throw requestError
        }
      } else {
        // We've exhausted all options for getting an API key
        logger.warn('No API key available. You need to either:');
        logger.warn('1. Create an API key with: berget api-keys create --name "My Key"');
        logger.warn('2. Set a default API key with: berget api-keys set-default <id>');
        logger.warn('3. Provide an API key with the --api-key option');
        logger.warn('4. Set the BERGET_API_KEY environment variable');
        logger.warn('\nExample:');
        logger.warn('  export BERGET_API_KEY=your_api_key_here');
        logger.warn('  # or for a single command:');
        logger.warn('  BERGET_API_KEY=your_api_key_here berget chat run google/gemma-3-27b-it');
        throw new Error('No API key available. Please provide an API key or set a default API key.');
      }
    } catch (error) {
      // Improved error handling
      let errorMessage = 'Failed to create chat completion';
      
      if (error instanceof Error) {
        try {
          // Try to parse the error message as JSON
          const parsedError = JSON.parse(error.message);
          if (parsedError.error && parsedError.error.message) {
            errorMessage = `Chat error: ${parsedError.error.message}`;
          }
        } catch (e) {
          // If parsing fails, use the original error message
          errorMessage = `Chat error: ${error.message}`;
        }
      }
      
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
  
  /**
   * Handle streaming response from the API
   * @param options Request options
   * @param headers Request headers
   * @returns A promise that resolves when the stream is complete
   */
  private async handleStreamingResponse(options: any, headers: Record<string, string>): Promise<any> {
    logger.debug('Handling streaming response')
    
    // Create URL with query parameters
    const url = new URL(`${API_BASE_URL}/v1/chat/completions`);
    
    try {
      // Make fetch request directly to handle streaming
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify(options)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Stream request failed: ${response.status} ${response.statusText}`);
        logger.debug(`Error response: ${errorText}`);
        throw new Error(`Stream request failed: ${response.status} ${response.statusText}`);
      }
      
      if (!response.body) {
        throw new Error('No response body received');
      }
      
      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let fullResponse: any = null;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        logger.debug(`Received chunk: ${chunk.length} bytes`);
        
        // Process the chunk - it may contain multiple SSE events
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonData = line.slice(5).trim();
            
            // Skip empty data or [DONE] marker
            if (jsonData === '' || jsonData === '[DONE]') continue;
            
            try {
              const parsedData = JSON.parse(jsonData);
              
              // Call the onChunk callback with the parsed data
              if (options.onChunk) {
                options.onChunk(parsedData);
              }
              
              // Keep track of the full response
              if (!fullResponse) {
                fullResponse = parsedData;
              } else if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].delta) {
                // Accumulate content for the full response
                if (parsedData.choices[0].delta.content) {
                  fullContent += parsedData.choices[0].delta.content;
                }
              }
            } catch (e) {
              logger.error(`Error parsing chunk: ${e}`);
              logger.debug(`Problematic chunk: ${jsonData}`);
            }
          }
        }
      }
      
      // Construct the final response object similar to non-streaming response
      if (fullResponse) {
        if (fullContent) {
          fullResponse.choices[0].message = {
            role: 'assistant',
            content: fullContent
          };
        }
        return fullResponse;
      }
      
      return { choices: [{ message: { role: 'assistant', content: fullContent } }] };
    } catch (error) {
      logger.error(`Streaming error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * List available models
   * Command: berget chat list
   */
  public async listModels(apiKey?: string): Promise<any> {
    try {
      // Check for environment variable first, then fallback to provided API key
      const envApiKey = process.env.BERGET_API_KEY;
      const effectiveApiKey = envApiKey || apiKey;
      
      if (effectiveApiKey) {
        const headers = {
          'Authorization': `Bearer ${effectiveApiKey}`
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
      let errorMessage = 'Failed to list models';
      
      if (error instanceof Error) {
        try {
          // Try to parse the error message as JSON
          const parsedError = JSON.parse(error.message);
          if (parsedError.error) {
            errorMessage = `Models error: ${typeof parsedError.error === 'string' ? 
              parsedError.error : 
              (parsedError.error.message || JSON.stringify(parsedError.error))}`;
          }
        } catch (e) {
          // If parsing fails, use the original error message
          errorMessage = `Models error: ${error.message}`;
        }
      }
      
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }
  
}
