import { createAuthenticatedClient } from '../client'

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

export class ApiKeyService {
  private static instance: ApiKeyService
  private client = createAuthenticatedClient()

  private constructor() {}

  public static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService()
    }
    return ApiKeyService.instance
  }

  public async listApiKeys(): Promise<ApiKey[]> {
    try {
      const { data, error } = await this.client.GET('/v1/api-keys')
      if (error) throw new Error(JSON.stringify(error))
      return data || []
    } catch (error) {
      console.error('Failed to list API keys:', error)
      throw error
    }
  }

  public async createApiKey(options: CreateApiKeyOptions): Promise<ApiKeyResponse> {
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

  public async deleteApiKey(id: string): Promise<boolean> {
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

  public async rotateApiKey(id: string): Promise<ApiKeyResponse> {
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

  public async getApiKeyUsage(id: string): Promise<any> {
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
