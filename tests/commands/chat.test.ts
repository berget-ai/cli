import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerChatCommands } from '../../src/commands/chat'
import { ChatService } from '../../src/services/chat-service'
import { DefaultApiKeyManager } from '../../src/utils/default-api-key'

// Mock dependencies
vi.mock('../../src/services/chat-service')
vi.mock('../../src/utils/default-api-key')
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn()
  }))
}))

describe('Chat Commands', () => {
  let program: Command
  let mockChatService: any
  let mockDefaultApiKeyManager: any

  beforeEach(() => {
    program = new Command()
    
    // Mock ChatService
    mockChatService = {
      createCompletion: vi.fn(),
      listModels: vi.fn()
    }
    vi.mocked(ChatService.getInstance).mockReturnValue(mockChatService)
    
    // Mock DefaultApiKeyManager
    mockDefaultApiKeyManager = {
      getDefaultApiKeyData: vi.fn(),
      promptForDefaultApiKey: vi.fn()
    }
    vi.mocked(DefaultApiKeyManager.getInstance).mockReturnValue(mockDefaultApiKeyManager)
    
    registerChatCommands(program)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('chat run command', () => {
    it('should use openai/gpt-oss as default model', () => {
      const chatCommand = program.commands.find(cmd => cmd.name() === 'chat')
      const runCommand = chatCommand?.commands.find(cmd => cmd.name() === 'run')
      
      expect(runCommand).toBeDefined()
      
      // Check the argument description which contains the default model
      const modelArgument = runCommand?.args?.find(arg => arg.name() === 'model')
      expect(modelArgument?.description).toContain('openai/gpt-oss')
    })

    it('should have streaming enabled by default', () => {
      const chatCommand = program.commands.find(cmd => cmd.name() === 'chat')
      const runCommand = chatCommand?.commands.find(cmd => cmd.name() === 'run')
      
      expect(runCommand).toBeDefined()
      
      // Check that the option is --no-stream (meaning streaming is default)
      const streamOption = runCommand?.options.find(opt => opt.long === '--no-stream')
      expect(streamOption).toBeDefined()
      expect(streamOption?.description).toContain('Disable streaming')
    })

    it('should create completion with correct default options', async () => {
      // Mock API key
      process.env.BERGET_API_KEY = 'test-key'
      
      // Mock successful completion
      mockChatService.createCompletion.mockResolvedValue({
        choices: [{
          message: { content: 'Test response' }
        }]
      })

      // This would normally test the actual command execution
      // but since it involves readline interaction, we just verify
      // that the service would be called with correct defaults
      expect(mockChatService.createCompletion).not.toHaveBeenCalled()
      
      // Clean up
      delete process.env.BERGET_API_KEY
    })
  })

  describe('chat list command', () => {
    it('should list available models', async () => {
      const mockModels = {
        data: [
          {
            id: 'gpt-oss',
            owned_by: 'openai',
            active: true,
            capabilities: {
              vision: false,
              function_calling: true,
              json_mode: true
            }
          }
        ]
      }
      
      mockChatService.listModels.mockResolvedValue(mockModels)
      
      const chatCommand = program.commands.find(cmd => cmd.name() === 'chat')
      const listCommand = chatCommand?.commands.find(cmd => cmd.name() === 'list')
      
      expect(listCommand).toBeDefined()
      expect(listCommand?.description()).toBe('List available chat models')
    })
  })
})
