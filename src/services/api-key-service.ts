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
      if (error) throw error
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
      // Validate input before sending request
      if (!options.name || options.name.trim().length === 0) {
        throw new Error('API key name is required and cannot be empty')
      }

      if (options.name.length > 100) {
        throw new Error('API key name must be 100 characters or less')
      }

      if (options.description && options.description.length > 500) {
        throw new Error('API key description must be 500 characters or less')
      }

      const { data, error } = await this.client.POST('/v1/api-keys', {
        body: options,
      })

      if (error) {
        // Enhanced error handling with specific troubleshooting

        // Handle specific error cases
        if (typeof error === 'object' && error !== null) {
          const errorObj = error as any

          if (errorObj.error?.code === 'API_KEY_CREATION_FAILED') {
            let detailedMessage =
              'Failed to create API key. This could be due to:\n'
            detailedMessage += '• Account limits or quota restrictions\n'
            detailedMessage +=
              '• Insufficient permissions for API key creation\n'
            detailedMessage += '• Temporary server issues\n'
            detailedMessage += '• Billing or subscription issues\n\n'
            detailedMessage += 'Troubleshooting steps:\n'
            detailedMessage +=
              '1. Check if you have reached your API key limit\n'
            detailedMessage +=
              '2. Verify your account has API key creation permissions\n'
            detailedMessage += '3. Check your billing status and subscription\n'
            detailedMessage +=
              '4. Try again in a few minutes if this is a temporary issue\n'
            detailedMessage += '5. Contact support if the problem persists'

            throw new Error(detailedMessage)
          }

          if (errorObj.error?.code === 'QUOTA_EXCEEDED') {
            throw new Error(
              'You have reached your API key limit. Please delete existing keys or contact support to increase your quota.',
            )
          }

          if (errorObj.error?.code === 'INSUFFICIENT_PERMISSIONS') {
            throw new Error(
              'Your account does not have permission to create API keys. Please contact your administrator.',
            )
          }

          if (errorObj.error?.code === 'BILLING_REQUIRED') {
            throw new Error(
              'A valid billing method is required to create API keys. Please add a payment method.',
            )
          }
        }

        throw new Error(JSON.stringify(error))
      }

      if (!data) {
        throw new Error('No data received from server')
      }

      return data
    } catch (error) {
      console.error('Failed to create API key:', error)

      // Add additional context for common issues
      if (error instanceof Error) {
        if (error.message.includes('ECONNREFUSED')) {
          throw new Error(
            'Cannot connect to Berget API. Please check your internet connection.',
          )
        }

        if (error.message.includes('ENOTFOUND')) {
          throw new Error(
            'Cannot resolve Berget API hostname. Please check your DNS settings.',
          )
        }

        if (
          error.message.includes('401') ||
          error.message.includes('Unauthorized')
        ) {
          throw new Error(
            'Authentication failed. Please run `berget auth login` to log in again.',
          )
        }

        if (error.message.includes('403')) {
          throw new Error(
            'Access forbidden. Your account may not have permission to create API keys.',
          )
        }
      }

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
        params: { path: { id } },
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
      const { data, error } = await this.client.PUT(
        '/v1/api-keys/{id}/rotate',
        {
          params: { path: { id } },
        },
      )
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
        params: { path: { id } },
      })
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      console.error('Failed to get API key usage:', error)
      throw error
    }
  }
}
