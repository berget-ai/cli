import { createAuthenticatedClient } from '../client.js';
import { logger } from '../utils/logger.js';

export interface ChatCompletionOptions {
  apiKey?: string;
  max_tokens?: number;
  messages: ChatMessage[];
  model?: string;
  onChunk?: (chunk: any) => void;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
}

export interface ChatMessage {
  content: string;
  role: 'assistant' | 'system' | 'user';
}

/**
 * Service for interacting with the chat API
 * Command group: chat
 */
export class ChatService {
  // Command group name for this service
  public static readonly COMMAND_GROUP = 'chat';
  // Subcommands for this service
  public static readonly COMMANDS = {
    LIST: 'list',
    RUN: 'run',
  };

  private static instance: ChatService;

  private client = createAuthenticatedClient();

  private constructor() {}

  public static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  /**
   * Create a chat completion
   * Command: berget chat completion
   */
  public async createCompletion(options: ChatCompletionOptions): Promise<any> {
    try {
      logger.debug('Starting createCompletion method');

      const optionsCopy = options ? { ...options } : { messages: [] };

      if (!optionsCopy.messages || !Array.isArray(optionsCopy.messages)) {
        logger.error('messages is undefined or not an array');
        optionsCopy.messages = [];
      }

      logger.debug('Starting createCompletion with options:');
      try {
        logger.debug(
          JSON.stringify(
            {
              ...optionsCopy,
              apiKey: optionsCopy.apiKey ? '***' : undefined,
              messages: optionsCopy.messages
                ? `${optionsCopy.messages.length} messages`
                : '0 messages',
            },
            null,
            2,
          ),
        );
      } catch (error) {
        logger.error('Failed to stringify options:', error);
      }

      const headers: Record<string, string> = {};

      if (optionsCopy.apiKey) {
        headers['Authorization'] = optionsCopy.apiKey;
      }

      // Set default model if not provided
      if (!optionsCopy.model) {
        logger.debug('No model specified, using default: google/gemma-3-27b-it');
        optionsCopy.model = 'google/gemma-3-27b-it';
      }

      logger.debug('Chat completion options:');
      logger.debug(
        JSON.stringify(
          {
            ...optionsCopy,
            apiKey: optionsCopy.apiKey ? '***' : undefined,
          },
          null,
          2,
        ),
      );

      return this.executeCompletion(optionsCopy, headers);
    } catch (error) {
      let errorMessage = 'Failed to create chat completion';

      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          if (parsedError.error && parsedError.error.message) {
            errorMessage = `Chat error: ${parsedError.error.message}`;
          }
        } catch {
          errorMessage = `Chat error: ${error.message}`;
        }
      }

      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * List available models
   * Command: berget chat list
   */
  public async listModels(apiKey?: string): Promise<any> {
    try {
      const headers = apiKey ? { Authorization: apiKey } : {};

      if (apiKey) {
        const { data, error } = await this.client.GET('/v1/models', { headers });
        if (error) throw new Error(JSON.stringify(error));
        return data;
      } else {
        const { data, error } = await this.client.GET('/v1/models');
        if (error) throw new Error(JSON.stringify(error));
        return data;
      }
    } catch (error) {
      let errorMessage = 'Failed to list models';

      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          if (parsedError.error) {
            errorMessage = `Models error: ${
              typeof parsedError.error === 'string'
                ? parsedError.error
                : parsedError.error.message || JSON.stringify(parsedError.error)
            }`;
          }
        } catch {
          errorMessage = `Models error: ${error.message}`;
        }
      }

      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Execute the completion request with the provided options
   * @param options The completion options
   * @param headers Additional headers to include
   * @returns The completion response
   */
  private async executeCompletion(
    options: ChatCompletionOptions,
    headers: Record<string, string> = {},
  ): Promise<any> {
    try {
      // If an API key is provided, use it for this request
      if (options.apiKey) {
        // API keys should be sent directly, not with Bearer prefix
        headers['Authorization'] = options.apiKey;
      }

      // Remove apiKey and onChunk from options before sending to API
      const { apiKey: _, onChunk, ...requestOptions } = options;

      logger.debug('Request options:');
      logger.debug(
        JSON.stringify(
          {
            ...requestOptions,
            messages: requestOptions.messages
              ? `${requestOptions.messages.length} messages`
              : '0 messages',
          },
          null,
          2,
        ),
      );

      // Handle streaming responses differently
      if (requestOptions.stream && onChunk) {
        return await this.handleStreamingResponse({ ...requestOptions, onChunk }, headers);
      } else {
        // Ensure model is always defined for the API call
        const requestBody = {
          ...requestOptions,
          model: requestOptions.model || 'google/gemma-3-27b-it',
        };

        // Debug the headers being sent
        logger.debug('Headers being sent:');
        logger.debug(JSON.stringify(headers, null, 2));

        const response = await this.client.POST('/v1/chat/completions', {
          body: requestBody,
          headers,
        });

        // Check if response has an error property
        const responseAny = response as any;
        if (responseAny && responseAny.error) throw new Error(JSON.stringify(responseAny.error));

        logger.debug('API response:');
        logger.debug(JSON.stringify(response, null, 2));

        // Output the complete response data for debugging
        logger.debug('Complete response data:');
        logger.debug(JSON.stringify(response.data, null, 2));

        return response.data;
      }
    } catch (requestError) {
      logger.debug(
        `Request error: ${
          requestError instanceof Error ? requestError.message : String(requestError)
        }`,
      );
      throw requestError;
    }
  }

  /**
   * Handle streaming response from the API
   * @param options Request options
   * @param headers Request headers
   * @returns A promise that resolves when the stream is complete
   */
  private async handleStreamingResponse(
    options: any,
    headers: Record<string, string>,
  ): Promise<any> {
    // Use the same base URL as the client
    const baseUrl = process.env.API_BASE_URL || 'https://api.berget.ai';
    const url = new URL(`${baseUrl}/v1/chat/completions`);

    try {
      logger.debug(`Making streaming request to: ${url.toString()}`);
      logger.debug(`Headers:`, JSON.stringify(headers, null, 2));
      logger.debug(`Body:`, JSON.stringify(options, null, 2));

      // Make fetch request directly to handle streaming
      const response = await fetch(url.toString(), {
        body: JSON.stringify(options),
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          ...headers,
        },
        method: 'POST',
      });

      logger.debug(`Response status: ${response.status}`);
      logger.debug(
        `Response headers:`,
        JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2),
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Stream request failed: ${response.status} ${response.statusText}`);
        logger.error(`Error response: ${errorText}`);
        throw new Error(
          `Stream request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      // Process the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let fullResponse: any = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        logger.debug(`Received chunk: ${chunk.length} bytes`);

        buffer += chunk;
        logger.debug(`Added chunk to buffer. Buffer length: ${buffer.length}`);

        const lines = buffer.split('\n');
        logger.debug(`Processing ${lines.length} lines from buffer`);

        let processedLines = 0;

        for (const [index, line] of lines.entries()) {
          logger.debug(`Line ${index}: "${line}"`);

          if (line.startsWith('data:')) {
            const jsonData = line.slice(5).trim();
            logger.debug(`Extracted JSON data: "${jsonData}"`);

            if (jsonData === '' || jsonData === '[DONE]') {
              logger.debug(`Skipping empty data or [DONE] marker`);
              processedLines = index + 1;
              continue;
            }

            if (!jsonData.startsWith('{')) {
              logger.warn(
                `JSON data doesn't start with '{', might be partial: "${jsonData.slice(0, 50)}..."`,
              );
              break;
            }

            let braceCount = 0;
            let inString = false;
            let escaped = false;

            for (const char of jsonData) {
              if (escaped) {
                escaped = false;
                continue;
              }
              if (char === '\\') {
                escaped = true;
                continue;
              }
              if (char === '"') {
                inString = !inString;
                continue;
              }
              if (!inString && char === '{') {
                braceCount++;
              } else if (!inString && char === '}') {
                braceCount--;
              }
            }

            if (braceCount !== 0) {
              logger.warn(
                `JSON braces don't balance (${braceCount}), treating as partial: "${jsonData.slice(0, 50)}..."`,
              );
              break;
            }

            try {
              logger.debug(`Attempting to parse JSON of length: ${jsonData.length}`);
              const parsedData = JSON.parse(jsonData);
              logger.debug(`Successfully parsed JSON: ${JSON.stringify(parsedData, null, 2)}`);
              processedLines = index + 1;

              if (options.onChunk) {
                options.onChunk(parsedData);
              }

              if (!fullResponse) {
                fullResponse = parsedData;
              } else if (
                parsedData.choices &&
                parsedData.choices[0] &&
                parsedData.choices[0].delta &&
                parsedData.choices[0].delta.content
              ) {
                fullContent += parsedData.choices[0].delta.content;
              }
            } catch (error) {
              logger.error(`Error parsing chunk: ${error}`);
              const errorMsg = (error as any).message || '';
              const errorPos = Number.parseInt(errorMsg.match(/position (\d+)/)?.[1] || '0');
              if (errorPos > 0) {
                const start = Math.max(0, errorPos - 20);
                const end = Math.min(jsonData.length, errorPos + 20);
                logger.error(`Context around error position ${errorPos}:`);
                logger.error(`"${jsonData.substring(start, end)}"`);
                logger.error(
                  `Character codes: ${[...jsonData.substring(start, end)]
                    .map((c) => c.charCodeAt(0))
                    .join(' ')}`,
                );
              }
            }
          }
        }

        if (processedLines > 0) {
          const remainingLines = lines.slice(processedLines);
          buffer = remainingLines.join('\n');
          logger.debug(
            `Updated buffer. Remaining lines: ${remainingLines.length}, Buffer length: ${buffer.length}`,
          );
        }
      }

      // Construct the final response object similar to non-streaming response
      if (fullResponse) {
        if (fullContent) {
          fullResponse.choices[0].message = {
            content: fullContent,
            role: 'assistant',
          };
        }
        return fullResponse;
      }

      return {
        choices: [{ message: { content: fullContent, role: 'assistant' } }],
      };
    } catch (error) {
      logger.error(`Streaming error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
