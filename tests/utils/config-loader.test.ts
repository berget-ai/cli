import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConfigLoader } from '../../src/utils/config-loader'
import * as path from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'

describe('ConfigLoader Singleton Pattern', () => {
  const testConfigPath = path.join(process.cwd(), 'test-config.json')
  const testConfigPath2 = path.join(process.cwd(), 'test-config2.json')
  
  const testConfig = {
    $schema: 'https://opencode.ai/config.json',
    username: 'test-user',
    model: 'test-model',
    agent: {
      test: {
        model: 'test-model',
        temperature: 0.5,
        mode: 'primary' as const,
        permission: { edit: 'allow' as const, bash: 'allow' as const, webfetch: 'allow' as const },
        description: 'Test agent',
        prompt: 'Test prompt'
      }
    }
  }

  beforeEach(() => {
    // Clean up any existing test files
    if (existsSync(testConfigPath)) unlinkSync(testConfigPath)
    if (existsSync(testConfigPath2)) unlinkSync(testConfigPath2)
    
    // Reset singleton instance
    ;(ConfigLoader as any).instance = null
  })

  afterEach(() => {
    // Clean up test files
    if (existsSync(testConfigPath)) unlinkSync(testConfigPath)
    if (existsSync(testConfigPath2)) unlinkSync(testConfigPath2)
    
    // Reset singleton instance
    ;(ConfigLoader as any).instance = null
  })

  it('should create singleton instance on first call', () => {
    const instance1 = ConfigLoader.getInstance(testConfigPath)
    const instance2 = ConfigLoader.getInstance()
    
    expect(instance1).toBe(instance2)
    expect(instance1.getConfigPath()).toBe(testConfigPath)
  })

  it('should ignore configPath parameter after first instantiation', () => {
    const instance1 = ConfigLoader.getInstance(testConfigPath)
    const instance2 = ConfigLoader.getInstance(testConfigPath2) // Should be ignored
    
    expect(instance1).toBe(instance2)
    expect(instance1.getConfigPath()).toBe(testConfigPath) // Still uses first path
  })

  it('should load and cache configuration', () => {
    writeFileSync(testConfigPath, JSON.stringify(testConfig))
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    const config1 = loader.loadConfig()
    const config2 = loader.loadConfig()
    
    expect(config1).toBe(config2) // Same object reference (cached)
    expect(config1.username).toBe('test-user')
  })

  it('should reload configuration when reloadConfig is called', () => {
    writeFileSync(testConfigPath, JSON.stringify(testConfig))
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    const config1 = loader.loadConfig()
    
    // Modify file
    const modifiedConfig = { ...testConfig, username: 'modified-user' }
    writeFileSync(testConfigPath, JSON.stringify(modifiedConfig))
    
    const config2 = loader.loadConfig() // Should still be cached
    expect(config2).toBe(config1)
    expect(config2.username).toBe('test-user')
    
    const config3 = loader.reloadConfig() // Should reload
    expect(config3).not.toBe(config1)
    expect(config3.username).toBe('modified-user')
  })

  it('should change config path and clear cache with setConfigPath', () => {
    writeFileSync(testConfigPath, JSON.stringify(testConfig))
    writeFileSync(testConfigPath2, JSON.stringify({ ...testConfig, username: 'user2' }))
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    const config1 = loader.loadConfig()
    expect(config1.username).toBe('test-user')
    
    loader.setConfigPath(testConfigPath2)
    const config2 = loader.loadConfig()
    expect(config2.username).toBe('user2')
    expect(loader.getConfigPath()).toBe(testConfigPath2)
  })

  it('should throw error when config file does not exist', () => {
    const loader = ConfigLoader.getInstance('/nonexistent/config.json')
    
    expect(() => loader.loadConfig()).toThrow('Configuration file not found')
  })

  it('should throw error when config file has invalid JSON', () => {
    writeFileSync(testConfigPath, 'invalid json content')
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    
    expect(() => loader.loadConfig()).toThrow('Invalid JSON in configuration file')
  })

  it('should provide fallback model configuration with warning', () => {
    const minimalConfig = { username: 'test' } // No model settings
    writeFileSync(testConfigPath, JSON.stringify(minimalConfig))
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    const modelConfig = loader.getModelConfig()
    
    expect(modelConfig.primary).toBe('berget/deepseek-r1')
    expect(modelConfig.small).toBe('berget/gpt-oss')
  })

  it('should provide fallback provider models with warning', () => {
    const minimalConfig = { username: 'test' } // No provider settings
    writeFileSync(testConfigPath, JSON.stringify(minimalConfig))
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    const providerModels = loader.getProviderModels()
    
    expect(providerModels['deepseek-r1']).toBeDefined()
    expect(providerModels['gpt-oss']).toBeDefined()
    expect(providerModels['llama-8b']).toBeDefined()
  })

  it('should provide fallback watcher configuration with warning', () => {
    const minimalConfig = { username: 'test' } // No watcher settings
    writeFileSync(testConfigPath, JSON.stringify(minimalConfig))
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    const watcherConfig = loader.getWatcherConfig()
    
    expect(watcherConfig.ignore).toContain('node_modules')
    expect(watcherConfig.ignore).toContain('dist')
    expect(watcherConfig.ignore).toContain('.git')
    expect(watcherConfig.ignore).toContain('coverage')
  })

  it('should use actual configuration when provided', () => {
    const fullConfig = {
      ...testConfig,
      model: 'custom-primary-model',
      small_model: 'custom-small-model',
      provider: {
        berget: {
          models: {
            'custom-model': {
              name: 'Custom Model',
              limit: { output: 2000, context: 4000 }
            }
          }
        }
      },
      watcher: {
        ignore: ['custom-ignore']
      }
    }
    writeFileSync(testConfigPath, JSON.stringify(fullConfig))
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    
    const modelConfig = loader.getModelConfig()
    expect(modelConfig.primary).toBe('custom-primary-model')
    expect(modelConfig.small).toBe('custom-small-model')
    
    const providerModels = loader.getProviderModels()
    expect(providerModels['custom-model']).toBeDefined()
    expect(providerModels['custom-model'].name).toBe('Custom Model')
    
    const watcherConfig = loader.getWatcherConfig()
    expect(watcherConfig.ignore).toEqual(['custom-ignore'])
  })

  it('should maintain consistent getter method behavior', () => {
    writeFileSync(testConfigPath, JSON.stringify(testConfig))
    
    const loader = ConfigLoader.getInstance(testConfigPath)
    
    // All getter methods should use the same cached config
    const agentConfig = loader.getAgentConfig('test')
    const allAgents = loader.getAllAgentConfigs()
    const commandConfigs = loader.getCommandConfigs()
    const providerConfig = loader.getProviderConfig()
    
    expect(agentConfig).toBeDefined()
    expect(allAgents.test).toBeDefined()
    expect(commandConfigs).toEqual({})
    expect(providerConfig).toEqual({})
  })
})