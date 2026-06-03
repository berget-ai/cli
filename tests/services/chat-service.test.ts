import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatService } from '../../src/services/chat-service.js';

const mockPost = vi.fn();
const mockGet = vi.fn();

let fetchMock: any;

vi.mock('../../src/client.js', () => ({
  createAuthenticatedClient: vi.fn(() => ({
    GET: mockGet,
    POST: mockPost,
  })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    (ChatService as any).instance = undefined;
    service = ChatService.getInstance();
    mockPost.mockReset();
    mockGet.mockReset();
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  describe('createCompletion', () => {
    it('returns data for non-streaming request', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hello', role: 'assistant' } }],
      };
      mockPost.mockResolvedValue({ data: mockResponse, error: null });

      const result = await service.createCompletion({
        messages: [{ content: 'Hi', role: 'user' }],
        stream: false,
      });

      expect(result).toEqual(mockResponse);
    });

    it('sets default model when not provided', async () => {
      mockPost.mockResolvedValue({
        data: { choices: [{ message: { content: 'Hi', role: 'assistant' } }] },
        error: null,
      });

      await service.createCompletion({ messages: [{ content: 'Hi', role: 'user' }] });

      expect(mockPost).toHaveBeenCalledWith(
        '/v1/chat/completions',
        expect.objectContaining({
          body: expect.objectContaining({ model: 'google/gemma-3-27b-it' }),
        }),
      );
    });

    it('uses provided model', async () => {
      mockPost.mockResolvedValue({
        data: { choices: [{ message: { content: 'Hi', role: 'assistant' } }] },
        error: null,
      });

      await service.createCompletion({
        messages: [{ content: 'Hi', role: 'user' }],
        model: 'custom-model',
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/v1/chat/completions',
        expect.objectContaining({
          body: expect.objectContaining({ model: 'custom-model' }),
        }),
      );
    });

    it('adds apiKey to headers', async () => {
      mockPost.mockResolvedValue({
        data: { choices: [{ message: { content: 'Hi', role: 'assistant' } }] },
        error: null,
      });

      await service.createCompletion({
        apiKey: 'test-key',
        messages: [{ content: 'Hi', role: 'user' }],
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/v1/chat/completions',
        expect.objectContaining({
          headers: { Authorization: 'test-key' },
        }),
      );
    });

    it('throws on API error response', async () => {
      mockPost.mockResolvedValue({ data: null, error: { message: 'Bad request' } });

      await expect(
        service.createCompletion({ messages: [{ content: 'Hi', role: 'user' }] }),
      ).rejects.toThrow('Bad request');
    });

    it('initializes empty messages array when missing', async () => {
      mockPost.mockResolvedValue({
        data: { choices: [{ message: { content: 'Hi', role: 'assistant' } }] },
        error: null,
      });

      await service.createCompletion({ messages: [] as any });

      expect(mockPost).toHaveBeenCalled();
    });

    it('propagates unexpected errors from executeCompletion', async () => {
      mockPost.mockRejectedValue(new Error('Unexpected failure'));

      await expect(
        service.createCompletion({ messages: [{ content: 'Hi', role: 'user' }] }),
      ).rejects.toThrow('Unexpected failure');
    });
  });

  describe('listModels', () => {
    it('returns models without apiKey', async () => {
      const mockData = { data: [{ id: 'model-1' }] };
      mockGet.mockResolvedValue({ data: mockData, error: null });

      const result = await service.listModels();

      expect(result).toEqual(mockData);
      expect(mockGet).toHaveBeenCalledWith('/v1/models');
    });

    it('returns models with apiKey', async () => {
      const mockData = { data: [{ id: 'model-1' }] };
      mockGet.mockResolvedValue({ data: mockData, error: null });

      const result = await service.listModels('test-key');

      expect(result).toEqual(mockData);
      expect(mockGet).toHaveBeenCalledWith('/v1/models', {
        headers: { Authorization: 'test-key' },
      });
    });

    it('throws on API error', async () => {
      mockGet.mockResolvedValue({ data: null, error: 'service unavailable' });

      await expect(service.listModels()).rejects.toThrow('Failed to list models');
    });
  });

  describe('handleStreamingResponse', () => {
    function createMockStream(chunks: string[]) {
      let index = 0;
      return {
        getReader: () => ({
          read: () => {
            if (index >= chunks.length) {
              return Promise.resolve({ done: true, value: undefined });
            }
            const chunk = new TextEncoder().encode(chunks[index++]);
            return Promise.resolve({ done: false, value: chunk });
          },
        }),
      };
    }

    it('streams chunks and returns full response', async () => {
      const chunks: string[] = [
        'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"1","choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      fetchMock.mockResolvedValue({
        body: createMockStream(chunks),
        headers: new Headers(),
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const receivedChunks: any[] = [];

      const result = await service.createCompletion({
        messages: [{ content: 'Hi', role: 'user' }],
        onChunk: (chunk: any) => receivedChunks.push(chunk),
        stream: true,
      });

      expect(receivedChunks).toHaveLength(2);
      expect(result.choices[0].message.content).toBe(' world');
    });

    it('handles first chunk as full response with no content', async () => {
      const chunks: string[] = ['data: {"id":"1","choices":[{"delta":{"content":"Test"}}]}\n\n'];

      fetchMock.mockResolvedValue({
        body: createMockStream(chunks),
        headers: new Headers(),
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await service.createCompletion({
        messages: [{ content: 'Hi', role: 'user' }],
        onChunk: vi.fn(),
        stream: true,
      });

      // First chunk sets fullResponse, but no content accumulated
      expect(result.id).toBe('1');
    });

    it('handles empty stream', async () => {
      fetchMock.mockResolvedValue({
        body: createMockStream([]),
        headers: new Headers(),
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await service.createCompletion({
        messages: [{ content: 'Hi', role: 'user' }],
        onChunk: vi.fn(),
        stream: true,
      });

      expect(result.choices[0].message.content).toBe('');
    });

    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        headers: new Headers(),
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      });

      await expect(
        service.createCompletion({
          messages: [{ content: 'Hi', role: 'user' }],
          onChunk: vi.fn(),
          stream: true,
        }),
      ).rejects.toThrow('Stream request failed: 401 Unauthorized');
    });

    it('throws when response body is missing', async () => {
      fetchMock.mockResolvedValue({
        body: null,
        headers: new Headers(),
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      await expect(
        service.createCompletion({
          messages: [{ content: 'Hi', role: 'user' }],
          onChunk: vi.fn(),
          stream: true,
        }),
      ).rejects.toThrow('No response body received');
    });

    it('handles partial JSON across chunks', async () => {
      const fullJson = '{"id":"1","choices":[{"delta":{"content":"Hello"}}]}';
      const chunks: string[] = [
        `data: ${fullJson.slice(0, 20)}\n\n`,
        `data: ${fullJson.slice(20)}\n\n`,
      ];

      fetchMock.mockResolvedValue({
        body: createMockStream(chunks),
        headers: new Headers(),
        ok: true,
        status: 200,
        statusText: 'OK',
      });

      const result = await service.createCompletion({
        messages: [{ content: 'Hi', role: 'user' }],
        onChunk: vi.fn(),
        stream: true,
      });

      expect(result).toBeDefined();
    });
  });
});
