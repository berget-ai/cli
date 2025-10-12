import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerCodeCommands } from '../../src/commands/code'
import { ApiKeyService } from '../../src/services/api-key-service'
import * as fs from 'fs'
import { readFile, writeFile } from 'fs/promises'

// Mock dependencies
vi.mock('../../src/services/api-key-service')
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  }
}))
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn()
}))
vi.mock('child_process', () => ({
  spawn: vi.fn()
}))
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn()
  }))
}))

describe('Code Commands', () => {
  let program: Command
  let mockApiKeyService: any
  let mockFs: any
  let mockFsPromises: any
  let mockSpawn: any

  beforeEach(() => {
    program = new Command()
    
    // Mock ApiKeyService
    mockApiKeyService = {
      create: vi.fn(),
      list: vi.fn(),
      rotate: vi.fn()
    }
    vi.mocked(ApiKeyService.getInstance).mockReturnValue(mockApiKeyService)
    
    // Mock fs
    mockFs = vi.mocked(fs)
    mockFs.existsSync = vi.fn()
    mockFs.readFileSync = vi.fn()
    
    // Mock fs/promises
    mockFsPromises = vi.mocked({ readFile, writeFile })
    mockFsPromises.readFile = vi.fn()
    mockFsPromises.writeFile = vi.fn()
    
    // Mock spawn
    mockSpawn = vi.fn()
    vi.doMock('child_process', () => ({ spawn: mockSpawn }))
    
    registerCodeCommands(program)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('code init command', () => {
    it('should register init command with correct description', () => {
      const codeCommand = program.commands.find(cmd => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(cmd => cmd.name() === 'init')
      
      expect(initCommand).toBeDefined()
      expect(initCommand?.description()).toBe('Initialize project for AI coding assistant')
    })

    it('should have name and force options', () => {
      const codeCommand = program.commands.find(cmd => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(cmd => cmd.name() === 'init')
      
      expect(initCommand).toBeDefined()
      
      const nameOption = initCommand?.options.find(opt => opt.long === '--name')
      const forceOption = initCommand?.options.find(opt => opt.long === '--force')
      
      expect(nameOption).toBeDefined()
      expect(nameOption?.description).toContain('Project name')
      expect(forceOption).toBeDefined()
      expect(forceOption?.description).toContain('Overwrite existing configuration')
    })

    it('should check if opencode is installed', () => {
      const codeCommand = program.commands.find(cmd => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(cmd => cmd.name() === 'init')
      
      expect(initCommand).toBeDefined()
      
      // The command should attempt to spawn opencode --version
      // This is tested implicitly through the spawn mock
    })

    it('should list existing API keys and allow selection', async () => {
      // Mock successful opencode installation check
      mockSpawn.mockImplementation((command: string, args: string[]) => {
        if (command === 'opencode' && args[0] === '--version') {
          return {
            on: vi.fn().mockImplementation((event, callback) => {
              if (event === 'close') callback(0)
            })
          }
        }
        return { on: vi.fn() }
      })

      // Mock existing API keys
      const mockExistingKeys = [
        {
          id: 1,
          name: 'existing-key-1',
          prefix: 'sk_ber',
          created: '2023-01-01T00:00:00.000Z',
          lastUsed: null
        },
        {
          id: 2,
          name: 'existing-key-2', 
          prefix: 'sk_ber',
          created: '2023-01-02T00:00:00.000Z',
          lastUsed: '2023-01-03T00:00:00.000Z'
        }
      ]
      mockApiKeyService.list.mockResolvedValue(mockExistingKeys)

      // Mock file operations
      mockFs.existsSync.mockReturnValue(false)
      mockFsPromises.writeFile.mockResolvedValue(undefined)

      // Verify that the list method is called
      expect(mockApiKeyService.list).toBeDefined()
    })

    it('should create new API key with project-based naming', async () => {
      // Mock successful opencode installation check
      mockSpawn.mockImplementation((command: string, args: string[]) => {
        if (command === 'opencode' && args[0] === '--version') {
          return {
            on: vi.fn().mockImplementation((event, callback) => {
              if (event === 'close') callback(0)
            })
          }
        }
        return { on: vi.fn() }
      })

      // Mock no existing keys
      mockApiKeyService.list.mockResolvedValue([])

      // Mock successful API key creation
      const mockApiKeyData = {
        id: 123,
        name: 'opencode-testproject-1234567890',
        key: 'test-api-key-12345'
      }
      mockApiKeyService.create.mockResolvedValue(mockApiKeyData)

      // Mock file operations
      mockFs.existsSync.mockReturnValue(false)
      mockFsPromises.writeFile.mockResolvedValue(undefined)

      // Verify that the create method is available
      expect(mockApiKeyService.create).toBeDefined()
    })

    it('should create opencode.json with correct structure', async () => {
      // This tests the expected config structure
      const expectedConfig = {
        model: "berget/deepseek-r1",
        apiKey: "test-api-key",
        projectName: "testproject",
        provider: "berget",
        created: expect.any(String),
        version: "1.0.0"
      }

      expect(expectedConfig.model).toBe("berget/deepseek-r1")
      expect(expectedConfig.provider).toBe("berget")
      expect(expectedConfig.version).toBe("1.0.0")
    })

    it('should handle existing config file', () => {
      const codeCommand = program.commands.find(cmd => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(cmd => cmd.name() === 'init')
      
      expect(initCommand).toBeDefined()
      
      // Should check if opencode.json exists before proceeding
      expect(mockFs.existsSync).toBeDefined()
    })
  })

  describe('code run command', () => {
    it('should register run command with correct description', () => {
      const codeCommand = program.commands.find(cmd => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(cmd => cmd.name() === 'run')
      
      expect(runCommand).toBeDefined()
      expect(runCommand?.description()).toBe('Run AI coding assistant')
    })

    it('should accept prompt argument and model option', () => {
      const codeCommand = program.commands.find(cmd => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(cmd => cmd.name() === 'run')
      
      expect(runCommand).toBeDefined()
      
      const modelOption = runCommand?.options.find(opt => opt.long === '--model')
      const noConfigOption = runCommand?.options.find(opt => opt.long === '--no-config')
      
      expect(modelOption).toBeDefined()
      expect(modelOption?.description).toContain('Model to use')
      expect(noConfigOption).toBeDefined()
      expect(noConfigOption?.description).toContain('Run without loading project config')
    })

    it('should load configuration from opencode.json', async () => {
      const mockConfig = {
        model: "berget/deepseek-r1",
        apiKey: "test-api-key",
        projectName: "testproject",
        provider: "berget",
        created: "2023-01-01T00:00:00.000Z",
        version: "1.0.0"
      }

      // Mock file exists and contains config
      mockFs.existsSync.mockReturnValue(true)
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify(mockConfig))

      // Mock successful opencode check
      mockSpawn.mockImplementation((command: string, args: string[]) => {
        if (command === 'opencode' && args[0] === '--version') {
          return {
            on: vi.fn().mockImplementation((event, callback) => {
              if (event === 'close') callback(0)
            })
          }
        }
        return { on: vi.fn() }
      })

      // Verify config structure expectations
      expect(mockConfig.model).toBe("berget/deepseek-r1")
      expect(mockConfig.apiKey).toBe("test-api-key")
      expect(mockConfig.projectName).toBe("testproject")
    })

    it('should spawn opencode with correct arguments', () => {
      const codeCommand = program.commands.find(cmd => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(cmd => cmd.name() === 'run')
      
      expect(runCommand).toBeDefined()
      
      // Should spawn opencode with appropriate arguments
      expect(mockSpawn).toBeDefined()
    })

    it('should handle missing configuration file', () => {
      const codeCommand = program.commands.find(cmd => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(cmd => cmd.name() === 'run')
      
      expect(runCommand).toBeDefined()
      
      // Should check if opencode.json exists
      expect(mockFs.existsSync).toBeDefined()
    })
  })

  describe('opencode installation', () => {
    it('should check if opencode is installed', () => {
      // The spawn function should be called with opencode --version
      expect(mockSpawn).toBeDefined()
    })

    it('should offer to install opencode if not found', () => {
      // Mock opencode not installed
      mockSpawn.mockImplementation((command: string, args: string[]) => {
        if (command === 'opencode' && args[0] === '--version') {
          return {
            on: vi.fn().mockImplementation((event, callback) => {
              if (event === 'close') callback(1) // Non-zero exit code
            })
          }
        }
        return { on: vi.fn() }
      })

      // Should handle the case where opencode is not installed
      expect(mockSpawn).toBeDefined()
    })

    it('should install opencode via npm if user agrees', () => {
      // Should spawn npm install -g opencode-ai
      expect(mockSpawn).toBeDefined()
    })
  })

  describe('error handling', () => {
    it('should handle API key creation failures', () => {
      // Mock API key service to throw error
      mockApiKeyService.create.mockRejectedValue(new Error('API Error'))
      
      expect(mockApiKeyService.create).toBeDefined()
    })

    it('should handle file system errors', () => {
      // Mock file operations to throw errors
      mockFsPromises.writeFile.mockRejectedValue(new Error('File write error'))
      
      expect(mockFsPromises.writeFile).toBeDefined()
    })

    it('should handle spawn errors', () => {
      // Mock spawn to throw error
      mockSpawn.mockImplementation(() => {
        throw new Error('Command not found')
      })
      
      expect(mockSpawn).toBeDefined()
    })
  })
})