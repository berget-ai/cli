import { createAuthenticatedClient } from '../client'
import { handleError } from '../utils/error-handler'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'

export interface ApiKey {
  id: number
  name: string
  description: string | null
  created: string
  lastUsed: string | null
  prefix: string
  active: boolean
  modified: string
}

export interface CreateApiKeyOptions {
  name: string
  description?: string
}

export interface ApiKeyResponse {
  id: number
  name: string
  description: string | null
  key: string
  created: string
}

/**
 * Service for managing API keys
 * Command group: api-keys
 */
export class ApiKeyService {
  private static instance: ApiKeyService
  private client = createAuthenticatedClient()
  
  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.API_KEYS
  
  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.API_KEYS

  private constructor() {}

  public static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService()
    }
    return ApiKeyService.instance
  }

  /**
   * List all API keys
   * Command: berget api-keys list
   */
  public async list(): Promise<ApiKey[]> {
    try {
      const { data, error } = await this.client.GET('/v1/api-keys')
      if (error) {
        // Check if this is an authentication error
        const errorObj = typeof error === 'string' ? JSON.parse(error) : error;
        if (errorObj.status === 401) {
          throw new Error(JSON.stringify({
            error: "Authentication failed. Your session may have expired.",
            code: "AUTH_FAILED",
            details: "Please run 'berget login' to authenticate again."
          }))
        }
        throw new Error(JSON.stringify(error))
      }
      return data || []
    } catch (error) {
      handleError('Failed to list API keys', error)
      throw error
    }
  }

  /**
   * Create a new API key
   * Command: berget api-keys create
   */
  public async create(options: CreateApiKeyOptions): Promise<ApiKeyResponse> {
    try {
      const { data, error } = await this.client.POST('/v1/api-keys', {
        body: options
      })
      if (error) throw new Error(JSON.stringify(error))
      return data!
    } catch (error) {
      console.error('Failed to create API key:', error)
      throw error
    }
  }

  /**
   * Delete an API key
   * Command: berget api-keys delete
   */
  public async delete(id: string): Promise<boolean> {
    try {
      const { error } = await this.client.DELETE('/v1/api-keys/{id}', {
        params: { path: { id } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return true
    } catch (error) {
      console.error('Failed to delete API key:', error)
      throw error
    }
  }

  /**
   * Rotate an API key
   * Command: berget api-keys rotate
   */
  public async rotate(id: string): Promise<ApiKeyResponse> {
    try {
      const { data, error } = await this.client.PUT('/v1/api-keys/{id}/rotate', {
        params: { path: { id } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data!
    } catch (error) {
      console.error('Failed to rotate API key:', error)
      throw error
    }
  }

  /**
   * Get usage statistics for an API key
   * Command: berget api-keys describe
   */
  public async describe(id: string): Promise<any> {
    try {
      const { data, error } = await this.client.GET('/v1/api-keys/{id}/usage', {
        params: { path: { id } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      console.error('Failed to get API key usage:', error)
      throw error
    }
  }
}
