import { createAuthenticatedClient } from '../client.js';
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure.js';
import { handleError } from '../utils/error-handler.js';

export interface ApiKey {
  active: boolean;
  created: string;
  description: null | string;
  id: number;
  lastUsed: null | string;
  modified: string;
  name: string;
  prefix: string;
}

export interface ApiKeyResponse {
  created: string;
  description: null | string;
  id: number;
  key: string;
  name: string;
}

export interface CreateApiKeyOptions {
  description?: string;
  name: string;
}

/**
 * Service for managing API keys
 * Command group: api-keys
 */
export class ApiKeyService {
  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.API_KEYS;
  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.API_KEYS;

  private static instance: ApiKeyService;

  private client = createAuthenticatedClient();

  private constructor() {}

  public static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService();
    }
    return ApiKeyService.instance;
  }

  /**
   * Create a new API key
   * Command: berget api-keys create
   */
  public async create(options: CreateApiKeyOptions): Promise<ApiKeyResponse> {
    try {
      this.validateCreateOptions(options);

      const { data, error } = await this.client.POST('/v1/api-keys', {
        body: options,
      });

      if (error) {
        throw this.mapCreateError(error);
      }

      if (!data) {
        throw new Error('No data received from server');
      }

      return data;
    } catch (error) {
      throw this.enhanceNetworkError(error);
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
      });
      if (error) throw new Error(JSON.stringify(error));
      return true;
    } catch (error) {
      console.error('Failed to delete API key:', error);
      throw error;
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
      });
      if (error) throw new Error(JSON.stringify(error));
      return data;
    } catch (error) {
      console.error('Failed to get API key usage:', error);
      throw error;
    }
  }

  /**
   * List all API keys
   * Command: berget api-keys list
   */
  public async list(): Promise<ApiKey[]> {
    try {
      const { data, error } = await this.client.GET('/v1/api-keys');
      if (error) throw error;
      return data || [];
    } catch (error) {
      handleError('Failed to list API keys', error);
      throw error;
    }
  }

  /**
   * Rotate an API key
   * Command: berget api-keys rotate
   */
  public async rotate(id: string): Promise<ApiKeyResponse> {
    try {
      const { data, error } = await this.client.PUT('/v1/api-keys/{id}/rotate', {
        params: { path: { id } },
      });
      if (error) throw new Error(JSON.stringify(error));
      return data!;
    } catch (error) {
      console.error('Failed to rotate API key:', error);
      throw error;
    }
  }

  private buildCreationFailedMessage(): string {
    return (
      'Failed to create API key. This could be due to:\n' +
      '• Account limits or quota restrictions\n' +
      '• Insufficient permissions for API key creation\n' +
      '• Temporary server issues\n' +
      '• Billing or subscription issues\n\n' +
      'Troubleshooting steps:\n' +
      '1. Check if you have reached your API key limit\n' +
      '2. Verify your account has API key creation permissions\n' +
      '3. Check your billing status and subscription\n' +
      '4. Try again in a few minutes if this is a temporary issue\n' +
      '5. Contact support if the problem persists'
    );
  }

  private enhanceNetworkError(error: unknown): Error {
    if (!(error instanceof Error)) {
      throw error;
    }

    const message = error.message;

    if (message.includes('ECONNREFUSED')) {
      return new Error('Cannot connect to Berget API. Please check your internet connection.');
    }

    if (message.includes('ENOTFOUND')) {
      return new Error('Cannot resolve Berget API hostname. Please check your DNS settings.');
    }

    if (message.includes('401') || message.includes('Unauthorized')) {
      return new Error('Authentication failed. Please run `berget auth login` to log in again.');
    }

    if (message.includes('403')) {
      return new Error(
        'Access forbidden. Your account may not have permission to create API keys.',
      );
    }

    throw error;
  }

  private mapCreateError(error: unknown): Error {
    if (typeof error !== 'object' || error === null) {
      return new Error(JSON.stringify(error));
    }

    const errorObject = error as any;
    const code = errorObject.error?.code;

    switch (code) {
      case 'API_KEY_CREATION_FAILED': {
        return new Error(this.buildCreationFailedMessage());
      }
      case 'BILLING_REQUIRED': {
        return new Error(
          'A valid billing method is required to create API keys. Please add a payment method.',
        );
      }
      case 'INSUFFICIENT_PERMISSIONS': {
        return new Error(
          'Your account does not have permission to create API keys. Please contact your administrator.',
        );
      }
      case 'QUOTA_EXCEEDED': {
        return new Error(
          'You have reached your API key limit. Please delete existing keys or contact support to increase your quota.',
        );
      }
      case 'USER_NOT_FOUND': {
        return new Error(
          'Before you can create API keys, you need to finish setting up your account.\n\nCheck your inbox for a verification email from Berget AI and complete the account setup.',
        );
      }
      default: {
        return new Error(JSON.stringify(error));
      }
    }
  }

  private validateCreateOptions(options: CreateApiKeyOptions): void {
    if (!options.name || options.name.trim().length === 0) {
      throw new Error('API key name is required and cannot be empty');
    }

    if (options.name.length > 100) {
      throw new Error('API key name must be 100 characters or less');
    }

    if (options.description && options.description.length > 500) {
      throw new Error('API key description must be 500 characters or less');
    }
  }
}
