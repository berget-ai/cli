import { confirm as clackConfirm, isCancel } from '@clack/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import readline from 'node:readline';

import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure.js';
import { ApiKeyService } from '../services/api-key-service.js';
import { AuthService } from '../services/auth-service.js';
import { ChatCompletionOptions, ChatMessage, ChatService } from '../services/chat-service.js';
import { DefaultApiKeyManager } from '../utils/default-api-key.js';
import { handleError } from '../utils/error-handler.js';
import { containsMarkdown, renderMarkdown } from '../utils/markdown-renderer.js';

/**
 * Register chat commands
 */
export function registerChatCommands(program: Command): void {
  const chat = program.command(COMMAND_GROUPS.CHAT).description('Interact with AI chat models');

  chat
    .command(SUBCOMMANDS.CHAT.RUN)
    .description('Run a chat session with a specified model')
    .argument('[message]', 'Message to send directly (skips interactive mode)')
    .option('-m, --model <model>', 'Model to use (default: kimi-k2.6)')
    .option('-t, --temperature <temp>', 'Temperature (0-1)', Number.parseFloat)
    .option('--max-tokens <tokens>', 'Maximum tokens to generate', Number.parseInt)
    .option('-k, --api-key <key>', 'API key to use for this chat session')
    .option('--api-key-id <id>', 'ID of the API key to use from your saved keys')
    .option('--no-stream', 'Disable streaming (streaming is enabled by default)')
    .action(async (message, options) => {
      try {
        let apiKey = await resolveApiKey(options);

        if (!apiKey && options.apiKeyId) {
          apiKey = await resolveApiKeyFromId(options.apiKeyId);
        }

        if (!(await verifyAuthentication(apiKey))) {
          return;
        }

        const messages: ChatMessage[] = [];
        const inputMessage = await resolveInputMessage(message);

        if (inputMessage) {
          await runSingleShotChat(inputMessage, options, apiKey);
          return;
        }

        await runInteractiveChat(options, apiKey, messages);
      } catch (error) {
        handleError('Failed to create chat completion', error);
      }
    });

  chat
    .command(SUBCOMMANDS.CHAT.LIST)
    .description('List available chat models')
    .option('-k, --api-key <key>', 'API key to use for this request')
    .option('--api-key-id <id>', 'ID of the API key to use from your saved keys')
    .action(async (options) => {
      try {
        const apiKey = await resolveApiKeyForList(options);
        const chatService = ChatService.getInstance();
        const models = await chatService.listModels(apiKey);

        if (program.opts().debug) {
          console.log(chalk.yellow('DEBUG: Models response:'));
          console.log(chalk.yellow(JSON.stringify(models, null, 2)));
        }

        displayModels(models);
      } catch (error) {
        handleError('Failed to list chat models', error);
      }
    });
}

function buildCompletionOptions(
  options: any,
  messages: ChatMessage[],
  apiKey: string | undefined,
): ChatCompletionOptions {
  const completionOptions: ChatCompletionOptions = {
    max_tokens: options.maxTokens || 4096,
    messages: messages,
    model: options.model || 'openai/gpt-oss',
    stream: options.stream !== false,
    temperature: options.temperature === undefined ? 0.7 : options.temperature,
  };

  if (apiKey) {
    completionOptions.apiKey = apiKey;
  }

  return completionOptions;
}

function createAskQuestion(
  rl: readline.Interface,
  messages: ChatMessage[],
  apiKey: string | undefined,
  options: any,
  chatService: ChatService,
): () => void {
  return () => {
    rl.question(chalk.green('You: '), async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log(chalk.cyan('Goodbye!'));
        rl.close();
        return;
      }

      messages.push({ content: input, role: 'user' });

      try {
        const completionOptions = buildCompletionOptions(options, messages, apiKey);

        if (completionOptions.stream) {
          await runInteractiveStreaming(chatService, completionOptions, messages);
        } else {
          await runInteractiveNonStreaming(chatService, completionOptions, messages);
        }

        createAskQuestion(rl, messages, apiKey, options, chatService)();
      } catch (error) {
        console.error(chalk.red('Error: Failed to get response'));
        if (error instanceof Error) {
          console.error(chalk.red(error.message));
        }
        createAskQuestion(rl, messages, apiKey, options, chatService)();
      }
    });
  };
}

function displayModels(models: any): void {
  console.log(chalk.bold('Available Chat Models:'));
  console.log(chalk.dim('─'.repeat(70)));
  console.log(chalk.dim('MODEL ID'.padEnd(40)) + chalk.dim('CAPABILITIES'));
  console.log(chalk.dim('─'.repeat(70)));

  const activeModels = models.data.filter((model: any) => model.active === true);

  for (const model of activeModels) {
    const capabilities = [];
    if (model.capabilities.vision) capabilities.push('vision');
    if (model.capabilities.function_calling) capabilities.push('function_calling');
    if (model.capabilities.json_mode) capabilities.push('json_mode');

    const modelId = `${model.owned_by.toLowerCase()}/${model.id}`.padEnd(40);
    console.log(modelId + capabilities.join(', '));
  }
}

async function displayResponse(response: any): Promise<void> {
  if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
    console.error(chalk.red('Error: Unexpected response format from API'));
    console.error(chalk.red('Response:', JSON.stringify(response, null, 2)));
    throw new Error('Unexpected response format from API');
  }

  const assistantMessage = response.choices[0].message.content;
  if (containsMarkdown(assistantMessage)) {
    console.log(renderMarkdown(assistantMessage));
  } else {
    console.log(assistantMessage);
  }
}

async function handleNonStreamingCompletion(
  chatService: ChatService,
  completionOptions: ChatCompletionOptions,
): Promise<void> {
  const response = await chatService.createCompletion(completionOptions);
  await displayResponse(response);
}

async function handleStreamingCompletion(
  chatService: ChatService,
  completionOptions: ChatCompletionOptions,
): Promise<void> {
  let assistantResponse = '';

  completionOptions.onChunk = (chunk: any) => {
    if (
      chunk.choices &&
      chunk.choices[0] &&
      chunk.choices[0].delta &&
      chunk.choices[0].delta.content
    ) {
      const content = chunk.choices[0].delta.content;
      try {
        process.stdout.write(content);
      } catch (error: any) {
        if (error.code === 'EPIPE') {
          return;
        }
        throw error;
      }
      assistantResponse += content;
    }
  };

  try {
    await chatService.createCompletion(completionOptions);
  } catch (streamError) {
    console.error(chalk.red('\nStreaming error:'), streamError);
    console.log(chalk.yellow('Falling back to non-streaming mode...'));
    completionOptions.stream = false;
    delete completionOptions.onChunk;

    const response = await chatService.createCompletion(completionOptions);
    if (response && response.choices && response.choices[0] && response.choices[0].message) {
      assistantResponse = response.choices[0].message.content;
      console.log(assistantResponse);
    }
  }

  console.log();
}

async function resolveApiKey(options: any): Promise<string | undefined> {
  const environmentApiKey = process.env.BERGET_API_KEY;
  if (environmentApiKey) {
    console.log(chalk.dim('Using API key from BERGET_API_KEY environment variable'));

    if (process.argv.includes('--debug')) {
      console.log(
        chalk.yellow(`DEBUG: API key from env starts with: ${environmentApiKey.slice(0, 4)}...`),
      );
    }
    return environmentApiKey;
  }

  if (options.apiKey) {
    console.log(chalk.dim('Using API key from command line argument'));
    return options.apiKey;
  }

  if (!options.apiKeyId) {
    return resolveDefaultApiKey();
  }

  return undefined;
}

async function resolveApiKeyForList(options: any): Promise<string | undefined> {
  const apiKey = options.apiKey;
  let apiKeyId = options.apiKeyId;

  if (!apiKey && !apiKeyId) {
    const defaultApiKeyManager = DefaultApiKeyManager.getInstance();
    const defaultApiKeyData = defaultApiKeyManager.getDefaultApiKeyData();

    if (defaultApiKeyData) {
      apiKeyId = defaultApiKeyData.id;
      console.log(chalk.dim(`Using default API key: ${defaultApiKeyData.name}`));
    }
  }

  if (apiKeyId && !apiKey) {
    return resolveApiKeyFromId(apiKeyId);
  }

  return apiKey;
}

async function resolveApiKeyFromId(apiKeyId: string): Promise<string | undefined> {
  try {
    const apiKeyService = ApiKeyService.getInstance();
    const keys = await apiKeyService.list();
    const selectedKey = keys.find((key) => key.id.toString() === apiKeyId);

    if (!selectedKey) {
      console.log(
        chalk.yellow(`API key with ID ${apiKeyId} not found. Using default authentication.`),
      );
      return undefined;
    }

    console.log(chalk.dim(`Using API key: ${selectedKey.name}`));

    const shouldRotate = await clackConfirm({
      message: `To use API key "${selectedKey.name}", it needs to be rotated. This will invalidate the current key. Continue?`,
    });
    if (isCancel(shouldRotate)) {
      console.log(chalk.yellow('Operation cancelled.'));
      return undefined;
    }

    if (shouldRotate) {
      const rotatedKey = await apiKeyService.rotate(apiKeyId);
      console.log(chalk.green(`API key "${selectedKey.name}" rotated successfully.`));
      return rotatedKey.key;
    } else {
      console.log(chalk.yellow('Using default authentication instead.'));
      return undefined;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isAuthError =
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('Authentication failed') ||
      errorMessage.includes('AUTH_FAILED');

    if (isAuthError) {
      console.log(chalk.yellow('Authentication required. Please run `berget auth login` first.'));
    } else {
      console.error(chalk.red('Error fetching API key:'));
      console.error(error);
    }
    console.log(chalk.yellow('Using default authentication instead.'));
    return undefined;
  }
}

async function resolveDefaultApiKey(): Promise<string | undefined> {
  try {
    const defaultApiKeyManager = DefaultApiKeyManager.getInstance();
    const defaultApiKeyData = defaultApiKeyManager.getDefaultApiKeyData();

    if (defaultApiKeyData) {
      if (defaultApiKeyData.key) {
        console.log(chalk.dim(`Using default API key: ${defaultApiKeyData.name}`));
        return defaultApiKeyData.key;
      }

      console.log(
        chalk.yellow(
          `Default API key "${defaultApiKeyData.name}" exists but the key value is missing.`,
        ),
      );
      console.log(
        chalk.yellow(`Try rotating the key with: berget api-keys rotate ${defaultApiKeyData.id}`),
      );
      return undefined;
    }

    console.log(chalk.yellow('No default API key set.'));
    const apiKey = await defaultApiKeyManager.promptForDefaultApiKey();

    if (!apiKey) {
      console.log(chalk.red('Error: An API key is required to use the chat command.'));
      console.log(chalk.yellow('You can:'));
      console.log(
        chalk.yellow('1. Create an API key with: berget api-keys create --name "My Key"'),
      );
      console.log(chalk.yellow('2. Set a default API key with: berget api-keys set-default <id>'));
      console.log(chalk.yellow('3. Provide an API key with the --api-key option'));
      return undefined;
    }

    return apiKey;
  } catch (error) {
    if (process.argv.includes('--debug')) {
      console.log(chalk.yellow('DEBUG: Error checking default API key:'));
      console.log(chalk.yellow(String(error)));
    }
    return undefined;
  }
}

async function resolveInputMessage(message: string | undefined): Promise<string | undefined> {
  let inputMessage = message;
  let stdinContent = '';

  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    stdinContent = Buffer.concat(chunks).toString('utf8').trim();
  }

  if (stdinContent && message) {
    inputMessage = `${stdinContent}\n\n${message}`;
  } else if (stdinContent && !message) {
    inputMessage = stdinContent;
  }

  return inputMessage;
}

async function runInteractiveChat(
  options: any,
  apiKey: string | undefined,
  messages: ChatMessage[],
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.cyan('Chat with Berget AI (type "exit" to quit)'));
  console.log(chalk.cyan('----------------------------------------'));

  const chatService = ChatService.getInstance();
  const askQuestion = createAskQuestion(rl, messages, apiKey, options, chatService);
  askQuestion();
}

async function runInteractiveNonStreaming(
  chatService: ChatService,
  completionOptions: ChatCompletionOptions,
  messages: ChatMessage[],
): Promise<void> {
  const response = await chatService.createCompletion(completionOptions);

  if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
    console.error(chalk.red('Error: Unexpected response format from API'));
    console.error(chalk.red('Response:', JSON.stringify(response, null, 2)));
    throw new Error('Unexpected response format from API');
  }

  const assistantMessage = response.choices[0].message.content;
  messages.push({ content: assistantMessage, role: 'assistant' });

  console.log(chalk.blue('Assistant: '));
  if (containsMarkdown(assistantMessage)) {
    console.log(renderMarkdown(assistantMessage));
  } else {
    console.log(assistantMessage);
  }

  console.log();
}

async function runInteractiveStreaming(
  chatService: ChatService,
  completionOptions: ChatCompletionOptions,
  messages: ChatMessage[],
): Promise<void> {
  let assistantResponse = '';
  console.log(chalk.blue('Assistant: '));

  completionOptions.onChunk = (chunk: any) => {
    if (
      chunk.choices &&
      chunk.choices[0] &&
      chunk.choices[0].delta &&
      chunk.choices[0].delta.content
    ) {
      const content = chunk.choices[0].delta.content;
      try {
        process.stdout.write(content);
      } catch (error: any) {
        if (error.code === 'EPIPE') {
          return;
        }
        throw error;
      }
      assistantResponse += content;
    }
  };

  try {
    await chatService.createCompletion(completionOptions);
  } catch (streamError) {
    console.error(chalk.red('\nStreaming error:'), streamError);
    console.log(chalk.yellow('Falling back to non-streaming mode...'));
    completionOptions.stream = false;
    delete completionOptions.onChunk;

    const response = await chatService.createCompletion(completionOptions);
    if (response && response.choices && response.choices[0] && response.choices[0].message) {
      assistantResponse = response.choices[0].message.content;
      console.log(assistantResponse);
    }
  }

  console.log('\n');
  messages.push({ content: assistantResponse, role: 'assistant' });
}

async function runSingleShotChat(
  inputMessage: string,
  options: any,
  apiKey: string | undefined,
): Promise<void> {
  const messages: ChatMessage[] = [];

  if (options.system) {
    messages.push({ content: options.system, role: 'system' });
  }

  messages.push({ content: inputMessage, role: 'user' });

  try {
    const chatService = ChatService.getInstance();
    const completionOptions = buildCompletionOptions(options, messages, apiKey);

    if (completionOptions.stream) {
      await handleStreamingCompletion(chatService, completionOptions);
    } else {
      await handleNonStreamingCompletion(chatService, completionOptions);
    }
  } catch (error) {
    console.error(chalk.red('Error: Failed to get response'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exitCode = 1;
  }
}

async function verifyAuthentication(apiKey: string | undefined): Promise<boolean> {
  if (apiKey) {
    return true;
  }

  try {
    AuthService.getInstance();
    return true;
  } catch {
    console.log(chalk.red('Error: Authentication required for chat'));
    console.log(chalk.yellow('Please either:'));
    console.log(chalk.yellow('1. Log in with `berget auth login`'));
    console.log(chalk.yellow('2. Provide an API key with `--api-key`'));
    console.log(chalk.yellow('3. Provide an API key ID with `--api-key-id`'));
    console.log(chalk.yellow('4. Set a default API key with `berget api-keys set-default <id>`'));
    return false;
  }
}
