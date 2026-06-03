import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiKeyService } from '../../src/services/api-key-service.js';

const mockPost = vi.fn();

vi.mock('../../src/client.js', () => ({
  createAuthenticatedClient: vi.fn(() => ({
    POST: mockPost,
  })),
}));

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(() => {
    // Reset the singleton instance so each test gets a fresh instance
    (ApiKeyService as any).instance = undefined;
    service = ApiKeyService.getInstance();
    mockPost.mockReset();
  });

  describe('create', () => {
    it('creates an API key successfully', async () => {
      const mockResponse = {
        created: '2024-01-01',
        description: null,
        id: 1,
        key: 'test-key',
        name: 'Test Key',
      };
      mockPost.mockResolvedValue({ data: mockResponse, error: null });

      const result = await service.create({ name: 'Test Key' });

      expect(result).toEqual(mockResponse);
      expect(mockPost).toHaveBeenCalledWith('/v1/api-keys', {
        body: { name: 'Test Key' },
      });
    });

    it('creates an API key with description', async () => {
      const mockResponse = {
        created: '2024-01-01',
        description: 'A test key',
        id: 1,
        key: 'test-key',
        name: 'Test Key',
      };
      mockPost.mockResolvedValue({ data: mockResponse, error: null });

      const result = await service.create({ description: 'A test key', name: 'Test Key' });

      expect(result).toEqual(mockResponse);
      expect(mockPost).toHaveBeenCalledWith('/v1/api-keys', {
        body: { description: 'A test key', name: 'Test Key' },
      });
    });

    it('throws when name is empty', async () => {
      await expect(service.create({ name: '' })).rejects.toThrow(
        'API key name is required and cannot be empty',
      );
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('throws when name is whitespace only', async () => {
      await expect(service.create({ name: '   ' })).rejects.toThrow(
        'API key name is required and cannot be empty',
      );
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('throws when name exceeds 100 characters', async () => {
      const longName = 'a'.repeat(101);
      await expect(service.create({ name: longName })).rejects.toThrow(
        'API key name must be 100 characters or less',
      );
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('allows name exactly 100 characters', async () => {
      const mockResponse = {
        created: '2024-01-01',
        description: null,
        id: 1,
        key: 'test-key',
        name: 'a'.repeat(100),
      };
      mockPost.mockResolvedValue({ data: mockResponse, error: null });

      const result = await service.create({ name: 'a'.repeat(100) });

      expect(result.name).toBe('a'.repeat(100));
    });

    it('throws when description exceeds 500 characters', async () => {
      const longDescription = 'a'.repeat(501);
      await expect(service.create({ description: longDescription, name: 'Test' })).rejects.toThrow(
        'API key description must be 500 characters or less',
      );
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('allows description exactly 500 characters', async () => {
      const mockResponse = {
        created: '2024-01-01',
        description: 'a'.repeat(500),
        id: 1,
        key: 'test-key',
        name: 'Test',
      };
      mockPost.mockResolvedValue({ data: mockResponse, error: null });

      const result = await service.create({ description: 'a'.repeat(500), name: 'Test' });

      expect(result.description).toBe('a'.repeat(500));
    });

    it('throws when data is null', async () => {
      mockPost.mockResolvedValue({ data: null, error: null });

      await expect(service.create({ name: 'Test' })).rejects.toThrow(
        'No data received from server',
      );
    });

    describe('error code handling', () => {
      it('throws detailed message for API_KEY_CREATION_FAILED', async () => {
        mockPost.mockResolvedValue({
          data: null,
          error: { error: { code: 'API_KEY_CREATION_FAILED' } },
        });

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'Failed to create API key. This could be due to:',
        );
      });

      it('throws account setup message for USER_NOT_FOUND', async () => {
        mockPost.mockResolvedValue({
          data: null,
          error: { error: { code: 'USER_NOT_FOUND' } },
        });

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'Before you can create API keys',
        );
      });

      it('throws quota message for QUOTA_EXCEEDED', async () => {
        mockPost.mockResolvedValue({
          data: null,
          error: { error: { code: 'QUOTA_EXCEEDED' } },
        });

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'You have reached your API key limit',
        );
      });

      it('throws permission message for INSUFFICIENT_PERMISSIONS', async () => {
        mockPost.mockResolvedValue({
          data: null,
          error: { error: { code: 'INSUFFICIENT_PERMISSIONS' } },
        });

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'Your account does not have permission to create API keys',
        );
      });

      it('throws billing message for BILLING_REQUIRED', async () => {
        mockPost.mockResolvedValue({
          data: null,
          error: { error: { code: 'BILLING_REQUIRED' } },
        });

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'A valid billing method is required',
        );
      });

      it('throws stringified error for unknown error object', async () => {
        mockPost.mockResolvedValue({
          data: null,
          error: { error: { code: 'UNKNOWN_ERROR' } },
        });

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          JSON.stringify({ error: { code: 'UNKNOWN_ERROR' } }),
        );
      });

      it('throws stringified error for non-object error', async () => {
        mockPost.mockResolvedValue({ data: null, error: 'network error' });

        await expect(service.create({ name: 'Test' })).rejects.toThrow('"network error"');
      });
    });

    describe('network error handling', () => {
      it('throws connection error for ECONNREFUSED', async () => {
        mockPost.mockRejectedValue(new Error('ECONNREFUSED'));

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'Cannot connect to Berget API',
        );
      });

      it('throws DNS error for ENOTFOUND', async () => {
        mockPost.mockRejectedValue(new Error('ENOTFOUND'));

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'Cannot resolve Berget API hostname',
        );
      });

      it('throws auth error for 401', async () => {
        mockPost.mockRejectedValue(new Error('HTTP 401 Unauthorized'));

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'Authentication failed. Please run `berget auth login`',
        );
      });

      it('throws auth error for Unauthorized', async () => {
        mockPost.mockRejectedValue(new Error('Request failed: Unauthorized'));

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'Authentication failed. Please run `berget auth login`',
        );
      });

      it('throws permission error for 403', async () => {
        mockPost.mockRejectedValue(new Error('HTTP 403 Forbidden'));

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'Access forbidden. Your account may not have permission to create API keys',
        );
      });

      it('re-throws unknown errors', async () => {
        mockPost.mockRejectedValue(new Error('Something unexpected'));

        await expect(service.create({ name: 'Test' })).rejects.toThrow('Something unexpected');
      });

      it('re-throws non-Error values', async () => {
        mockPost.mockRejectedValue('plain string error');

        await expect(service.create({ name: 'Test' })).rejects.toBe('plain string error');
      });
    });
  });
});
