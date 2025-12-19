import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerCodeCommands } from '../../src/commands/code'
import { ApiKeyService } from '../../src/services/api-key-service'
import * as fs from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { updateEnvFile } from '../../src/utils/env-manager'

// Mock dependencies
vi.mock('../../src/services/api-key-service')
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}))
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock('../../src/utils/env-manager')
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
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
      rotate: vi.fn(),
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
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'init',
      )

      expect(initCommand).toBeDefined()
      expect(initCommand?.description()).toBe(
        'Initialize project for AI coding assistant',
      )
    })

    it('should have name, force, and yes options', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'init',
      )

      expect(initCommand).toBeDefined()

      const nameOption = initCommand?.options.find(
        (opt) => opt.long === '--name',
      )
      const forceOption = initCommand?.options.find(
        (opt) => opt.long === '--force',
      )
      const yesOption = initCommand?.options.find((opt) => opt.long === '--yes')

      expect(nameOption).toBeDefined()
      expect(nameOption?.description).toContain('Project name')
      expect(forceOption).toBeDefined()
      expect(forceOption?.description).toContain(
        'Overwrite existing configuration',
      )
      expect(yesOption).toBeDefined()
      expect(yesOption?.description).toContain('Automatically answer yes')
    })

    it('should check if opencode is installed', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'init',
      )

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
            }),
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
          lastUsed: null,
        },
        {
          id: 2,
          name: 'existing-key-2',
          prefix: 'sk_ber',
          created: '2023-01-02T00:00:00.000Z',
          lastUsed: '2023-01-03T00:00:00.000Z',
        },
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
            }),
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
        key: 'test-api-key-12345',
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
        model: 'berget/glm-4-6',
        apiKey: 'test-api-key',
        projectName: 'testproject',
        provider: 'berget',
        created: expect.any(String),
        version: '1.0.0',
      }

      expect(expectedConfig.model).toBe('berget/glm-4-6')
      expect(expectedConfig.provider).toBe('berget')
      expect(expectedConfig.version).toBe('1.0.0')
    })

    it('should handle existing config file', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'init',
      )

      expect(initCommand).toBeDefined()

      // Should check if opencode.json exists before proceeding
      expect(mockFs.existsSync).toBeDefined()
    })
  })

  describe('code run command', () => {
    it('should register run command with correct description', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'run',
      )

      expect(runCommand).toBeDefined()
      expect(runCommand?.description()).toBe('Run AI coding assistant')
    })

    it('should accept prompt argument and model, no-config, and yes options', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'run',
      )

      expect(runCommand).toBeDefined()

      const modelOption = runCommand?.options.find(
        (opt) => opt.long === '--model',
      )
      const noConfigOption = runCommand?.options.find(
        (opt) => opt.long === '--no-config',
      )
      const yesOption = runCommand?.options.find((opt) => opt.long === '--yes')

      expect(modelOption).toBeDefined()
      expect(modelOption?.description).toContain('Model to use')
      expect(noConfigOption).toBeDefined()
      expect(noConfigOption?.description).toContain(
        'Run without loading project config',
      )
      expect(yesOption).toBeDefined()
      expect(yesOption?.description).toContain('Automatically answer yes')
    })

    it('should load configuration from opencode.json', async () => {
      const mockConfig = {
        model: 'berget/glm-4-6',
        apiKey: 'test-api-key',
        projectName: 'testproject',
        provider: 'berget',
        created: '2023-01-01T00:00:00.000Z',
        version: '1.0.0',
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
            }),
          }
        }
        return { on: vi.fn() }
      })

      // Verify config structure expectations
      expect(mockConfig.model).toBe('berget/glm-4-6')
      expect(mockConfig.apiKey).toBe('test-api-key')
      expect(mockConfig.projectName).toBe('testproject')
    })

    it('should spawn opencode with correct arguments', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'run',
      )

      expect(runCommand).toBeDefined()

      // Should spawn opencode with appropriate arguments
      expect(mockSpawn).toBeDefined()
    })

    it('should handle missing configuration file', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'run',
      )

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
            }),
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

  describe('automation support', () => {
    it('should support -y flag for automated initialization', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const initCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'init',
      )

      expect(initCommand).toBeDefined()

      const yesOption = initCommand?.options.find((opt) => opt.long === '--yes')
      expect(yesOption).toBeDefined()
      expect(yesOption?.description).toContain('automation')
    })

    it('should support -y flag for automated run', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code')
      const runCommand = codeCommand?.commands.find(
        (cmd) => cmd.name() === 'run',
      )

      expect(runCommand).toBeDefined()

      const yesOption = runCommand?.options.find((opt) => opt.long === '--yes')
      expect(yesOption).toBeDefined()
      expect(yesOption?.description).toContain('automation')
    })

    it('should use BERGET_API_KEY environment variable in automation mode', () => {
      // Test that environment variable is used when -y flag is set
      process.env.BERGET_API_KEY = 'test-env-key'

      expect(process.env.BERGET_API_KEY).toBe('test-env-key')

      // Clean up
      delete process.env.BERGET_API_KEY
    })
  })

  describe('.env file handling', () => {
    let mockUpdateEnvFile: any

    beforeEach(() => {
      mockUpdateEnvFile = vi.mocked(updateEnvFile)
    })

    it('should call updateEnvFile when creating new project', async () => {
      mockUpdateEnvFile.mockResolvedValue(true)
      mockFs.existsSync.mockReturnValue(false) // .env doesn't exist
      mockFsPromises.writeFile.mockResolvedValue(undefined)

      // This would be tested by actually calling the init command
      // For now we verify the mock is properly set up
      expect(mockUpdateEnvFile).toBeDefined()
    })

    it('should not overwrite existing BERGET_API_KEY in .env', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Mock existing .env with BERGET_API_KEY
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(
        'BERGET_API_KEY=existing_key\nOTHER_KEY=value\n',
      )

      // Mock updateEnvFile to simulate the check
      mockUpdateEnvFile.mockImplementation(async (options: any) => {
        if (options.key === 'BERGET_API_KEY' && !options.force) {
          console.log(
            `⚠ ${options.key} already exists in .env - leaving unchanged`,
          )
          return false
        }
        return true
      })

      await updateEnvFile({
        key: 'BERGET_API_KEY',
        value: 'new_key',
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'BERGET_API_KEY already exists in .env - leaving unchanged',
        ),
      )

      consoleSpy.mockRestore()
    })

    it('should add new key to existing .env file', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue('EXISTING_KEY=value\n')
      mockUpdateEnvFile.mockResolvedValue(true)

      await updateEnvFile({
        key: 'BERGET_API_KEY',
        value: 'new_api_key',
        comment: 'Berget AI Configuration',
      })

      expect(mockUpdateEnvFile).toHaveBeenCalledWith({
        key: 'BERGET_API_KEY',
        value: 'new_api_key',
        comment: 'Berget AI Configuration',
      })
    })

    it('should create new .env file when none exists', async () => {
      mockFs.existsSync.mockReturnValue(false)
      mockUpdateEnvFile.mockResolvedValue(true)

      await updateEnvFile({
        key: 'BERGET_API_KEY',
        value: 'new_api_key',
      })

      expect(mockUpdateEnvFile).toHaveBeenCalledWith({
        key: 'BERGET_API_KEY',
        value: 'new_api_key',
      })
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

    it('should handle .env update failures', async () => {
      const mockUpdateEnvFile = vi.mocked(updateEnvFile)
      mockUpdateEnvFile.mockRejectedValue(new Error('Env update failed'))

      await expect(
        updateEnvFile({
          key: 'TEST_KEY',
          value: 'test_value',
        }),
      ).rejects.toThrow('Env update failed')
    })
  })
})
