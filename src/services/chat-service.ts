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
    COMPLETION: 'completion'
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
      console.error('Failed to create chat completion:', error)
      throw error
    }
  }
  
  /**
   * List available models
   * Command: berget chat models
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
      console.error('Failed to list models:', error)
      throw error
    }
  }
}
