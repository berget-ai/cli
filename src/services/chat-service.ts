import { createAuthenticatedClient } from '../client'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import chalk from 'chalk'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  model: string
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  top_p?: number
  apiKey?: string
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
      const headers: Record<string, string> = {}
      
      // Check if debug is enabled
      const isDebug = process.argv.includes('--debug')
      
      // Create a copy of options to avoid modifying the original
      const optionsCopy = { ...options }
      
      // If no API key is provided, try to get the default one
      if (!optionsCopy.apiKey) {
        try {
          const { DefaultApiKeyManager } = await import('../utils/default-api-key')
          const defaultApiKeyManager = DefaultApiKeyManager.getInstance()
          const apiKey = await defaultApiKeyManager.promptForDefaultApiKey()
          
          if (!apiKey) {
            console.log(chalk.yellow('No API key available. You need to either:'))
            console.log(chalk.yellow('1. Create an API key with: berget api-keys create --name "My Key"'))
            console.log(chalk.yellow('2. Set a default API key with: berget api-keys set-default <id>'))
            console.log(chalk.yellow('3. Provide an API key with the --api-key option'))
            throw new Error('No API key provided and no default API key set')
          }
          
          optionsCopy.apiKey = apiKey
        } catch (error) {
          console.log(chalk.red('Error getting API key:'))
          if (error instanceof Error) {
            console.log(chalk.red(error.message))
          }
          console.log(chalk.yellow('Please create an API key with: berget api-keys create --name "My Key"'))
          throw new Error('Failed to get API key')
        }
      }
      
      if (isDebug) {
        console.log(chalk.yellow('DEBUG: Chat completion options:'))
        console.log(chalk.yellow(JSON.stringify({
          ...optionsCopy,
          apiKey: optionsCopy.apiKey ? '***' : undefined // Hide the actual API key in debug output
        }, null, 2)))
      }
      
      // If an API key is provided, use it for this request
      if (optionsCopy.apiKey) {
        headers['Authorization'] = `Bearer ${optionsCopy.apiKey}`
        // Remove apiKey from options before sending to API
        const { apiKey, ...requestOptions } = optionsCopy
        
        if (isDebug) {
          console.log(chalk.yellow('DEBUG: Using provided API key'))
          console.log(chalk.yellow('DEBUG: Request options:'))
          console.log(chalk.yellow(JSON.stringify(requestOptions, null, 2)))
        }
        
        try {
          const { data, error } = await this.client.POST('/v1/chat/completions', {
            body: requestOptions,
            headers
          })
                
          if (error) throw new Error(JSON.stringify(error))
          return data
        } catch (requestError) {
          if (process.argv.includes('--debug')) {
            console.log(chalk.red(`DEBUG: Request error: ${requestError instanceof Error ? requestError.message : String(requestError)}`))
          }
          throw requestError
        }
        
        if (isDebug) {
          console.log(chalk.yellow('DEBUG: API response:'))
          console.log(chalk.yellow(JSON.stringify({ data, error }, null, 2)))
          
          // Output the complete response data for debugging
          console.log(chalk.yellow('DEBUG: Complete response data:'))
          console.log(chalk.yellow(JSON.stringify(data, null, 2)))
        }
        
        if (error) throw new Error(JSON.stringify(error))
        return data
      } else {
        // Use the default authenticated client
        if (isDebug) {
          console.log(chalk.yellow('DEBUG: Using default authentication'))
        }
        
        const { data, error } = await this.client.POST('/v1/chat/completions', {
          body: options
        })
        
        if (isDebug) {
          console.log(chalk.yellow('DEBUG: API response:'))
          console.log(chalk.yellow(JSON.stringify({ data, error }, null, 2)))
          
          // Output the complete response data for debugging
          console.log(chalk.yellow('DEBUG: Complete response data:'))
          console.log(chalk.yellow(JSON.stringify(data, null, 2)))
        }
        
        if (error) throw new Error(JSON.stringify(error))
        return data
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
      
      console.error(chalk.red(errorMessage));
      throw new Error(errorMessage);
    }
  }
  
  /**
   * List available models
   * Command: berget chat list
   */
  public async listModels(apiKey?: string): Promise<any> {
    try {
      if (apiKey) {
        const headers = {
          'Authorization': `Bearer ${apiKey}`
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
      
      console.error(chalk.red(errorMessage));
      throw new Error(errorMessage);
    }
  }
  
}
