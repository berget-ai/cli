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
    LIST: 'list',
    PULL: 'pull'
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
      
      // If an API key is provided, use it for this request
      if (options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`
        // Remove apiKey from options before sending to API
        const { apiKey, ...requestOptions } = options
        
        const { data, error } = await this.client.POST('/v1/chat/completions', {
          body: requestOptions,
          headers
        })
        
        if (error) throw new Error(JSON.stringify(error))
        return data
      } else {
        // Use the default authenticated client
        const { data, error } = await this.client.POST('/v1/chat/completions', {
          body: options
        })
        
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
  
  /**
   * Pull a model for use with chat
   * Command: berget chat pull <model>
   */
  public async pullModel(model: string, apiKey?: string): Promise<any> {
    try {
      if (apiKey) {
        const headers = {
          'Authorization': `Bearer ${apiKey}`
        }
        
        const { data, error } = await this.client.POST('/v1/models/pull', { 
          body: { model },
          headers
        })
        if (error) throw new Error(JSON.stringify(error))
        return data
      } else {
        const { data, error } = await this.client.POST('/v1/models/pull', {
          body: { model }
        })
        if (error) throw new Error(JSON.stringify(error))
        return data
      }
    } catch (error) {
      console.error('Failed to pull model:', error)
      throw error
    }
  }
}
