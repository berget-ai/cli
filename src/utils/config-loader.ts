import * as fs from 'fs'
import * as path from 'path'
import { logger } from './logger'

/**
 * Centralized agent configuration loader
 * Loads all agent configurations from opencode.json as the single source of truth
 */

export interface AgentConfig {
  model: string
  temperature: number
  top_p: number
  mode: 'primary' | 'subagent'
  permission: {
    edit: 'allow' | 'deny'
    bash: 'allow' | 'deny'
    webfetch: 'allow' | 'deny'
  }
  description?: string
  prompt?: string
  note?: string
}

export interface ModelConfig {
  primary: string
  small: string
}

export interface ProviderModelConfig {
  name: string
  limit: {
    output: number
    context: number
  }
}

export interface OpenCodeConfig {
  $schema?: string
  username?: string
  theme?: string
  share?: string
  autoupdate?: boolean
  model?: string
  small_model?: string
  agent?: Record<string, AgentConfig>
  command?: Record<string, any>
  watcher?: Record<string, any>
  provider?: Record<string, any>
}

export class ConfigLoader {
  private static instance: ConfigLoader
  private config: OpenCodeConfig | null = null
  private configPath: string

  private constructor(configPath?: string) {
    // Default to opencode.json in current working directory
    this.configPath = configPath || path.join(process.cwd(), 'opencode.json')
  }

  public static getInstance(configPath?: string): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader(configPath)
    }
    return ConfigLoader.instance
  }

  /**
   * Load configuration from opencode.json
   */
  public loadConfig(): OpenCodeConfig {
    if (this.config) {
      return this.config
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`)
      }

      const configContent = fs.readFileSync(this.configPath, 'utf8')
      this.config = JSON.parse(configContent) as OpenCodeConfig
      
      logger.debug(`Loaded configuration from ${this.configPath}`)
      return this.config
    } catch (error) {
      logger.error(`Failed to load configuration from ${this.configPath}:`, error)
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Get agent configuration by name
   */
  public getAgentConfig(agentName: string): AgentConfig | null {
    const config = this.loadConfig()
    return config.agent?.[agentName] || null
  }

  /**
   * Get all agent configurations
   */
  public getAllAgentConfigs(): Record<string, AgentConfig> {
    const config = this.loadConfig()
    return config.agent || {}
  }

  /**
   * Get model configuration
   */
  public getModelConfig(): ModelConfig {
    const config = this.loadConfig()
    
    // Extract from config or fall back to defaults
    const primary = config.model || 'berget/deepseek-r1'
    const small = config.small_model || 'berget/gpt-oss'
    
    return { primary, small }
  }

  /**
   * Get provider model configuration
   */
  public getProviderModels(): Record<string, ProviderModelConfig> {
    const config = this.loadConfig()
    
    // Extract from provider configuration
    if (config.provider?.berget?.models) {
      return config.provider.berget.models as Record<string, ProviderModelConfig>
    }
    
    // Fallback to defaults
    return {
      'deepseek-r1': {
        name: 'GLM-4.6',
        limit: { output: 4000, context: 90000 }
      },
      'gpt-oss': {
        name: 'GPT-OSS',
        limit: { output: 4000, context: 128000 }
      },
      'llama-8b': {
        name: 'llama-3.1-8b',
        limit: { output: 4000, context: 128000 }
      }
    }
  }

  /**
   * Get command configurations
   */
  public getCommandConfigs(): Record<string, any> {
    const config = this.loadConfig()
    return config.command || {}
  }

  /**
   * Get watcher configuration
   */
  public getWatcherConfig(): Record<string, any> {
    const config = this.loadConfig()
    return config.watcher || { ignore: ['node_modules', 'dist', '.git', 'coverage'] }
  }

  /**
   * Get provider configuration
   */
  public getProviderConfig(): Record<string, any> {
    const config = this.loadConfig()
    return config.provider || {}
  }

  /**
   * Check if an agent exists
   */
  public hasAgent(agentName: string): boolean {
    return agentName in this.getAllAgentConfigs()
  }

  /**
   * Get list of all available agent names
   */
  public getAgentNames(): string[] {
    return Object.keys(this.getAllAgentConfigs())
  }

  /**
   * Get list of primary agents (mode: 'primary')
   */
  public getPrimaryAgentNames(): string[] {
    const agents = this.getAllAgentConfigs()
    return Object.keys(agents).filter(name => agents[name].mode === 'primary')
  }

  /**
   * Get list of subagents (mode: 'subagent')
   */
  public getSubagentNames(): string[] {
    const agents = this.getAllAgentConfigs()
    return Object.keys(agents).filter(name => agents[name].mode === 'subagent')
  }

  /**
   * Reload configuration from file
   */
  public reloadConfig(): OpenCodeConfig {
    this.config = null
    return this.loadConfig()
  }

  /**
   * Set custom configuration path (for testing or different environments)
   */
  public setConfigPath(configPath: string): void {
    this.configPath = configPath
    this.config = null // Force reload
  }

  /**
   * Get the current configuration path
   */
  public getConfigPath(): string {
    return this.configPath
  }
}

/**
 * Convenience function to get the config loader instance
 */
export function getConfigLoader(configPath?: string): ConfigLoader {
  return ConfigLoader.getInstance(configPath)
}

/**
 * Convenience function to get agent configuration
 */
export function getAgentConfig(agentName: string, configPath?: string): AgentConfig | null {
  return getConfigLoader(configPath).getAgentConfig(agentName)
}

/**
 * Convenience function to get all agent configurations
 */
export function getAllAgentConfigs(configPath?: string): Record<string, AgentConfig> {
  return getConfigLoader(configPath).getAllAgentConfigs()
}

/**
 * Convenience function to get model configuration
 */
export function getModelConfig(configPath?: string): ModelConfig {
  return getConfigLoader(configPath).getModelConfig()
}

/**
 * Convenience function to get provider models
 */
export function getProviderModels(configPath?: string): Record<string, ProviderModelConfig> {
  return getConfigLoader(configPath).getProviderModels()
}