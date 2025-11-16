import * as fs from 'fs'
import * as path from 'path'
import { logger } from './logger'

/**
 * Centralized agent configuration loader with singleton pattern
 * 
 * IMPORTANT SINGLETON BEHAVIOR:
 * - The first call to getInstance() establishes the configPath for the entire application
 * - Subsequent calls to getInstance() will ignore the configPath parameter and return the existing instance
 * - This ensures consistent configuration loading across the application
 * - To use a different configPath, you must call setConfigPath() on the existing instance
 * 
 * CACHING AND RELOAD:
 * - Configuration is cached after first load for performance
 * - Use reloadConfig() to force a reload from disk (e.g., after external changes)
 * - Use setConfigPath() to change the config file path and clear cache
 * 
 * CONFIG PATH LIMITATIONS:
 * - The configPath parameter only has effect on the very first getInstance() call
 * - This is by design to prevent configuration inconsistencies
 * - For testing or multiple configs, create new instances directly or use setConfigPath()
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

export interface CommandConfig {
  description?: string
  template?: string
  agent?: string
  subtask?: boolean
}

export interface WatcherConfig {
  ignore?: string[]
}

export interface ProviderConfig {
  npm?: string
  name?: string
  options?: Record<string, any>
  models?: Record<string, ProviderModelConfig>
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
  command?: Record<string, CommandConfig>
  watcher?: WatcherConfig
  provider?: Record<string, ProviderConfig>
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
      logger.debug(`Created new ConfigLoader instance with path: ${ConfigLoader.instance.configPath}`)
    } else if (configPath && configPath !== ConfigLoader.instance.configPath) {
      // Log warning but don't change the path - this maintains singleton consistency
      logger.warn(
        `ConfigLoader instance already exists with path "${ConfigLoader.instance.configPath}". ` +
        `Ignoring requested path "${configPath}". Use setConfigPath() to change the config path.`
      )
    }
    return ConfigLoader.instance
  }

  /**
   * Load configuration from opencode.json
   * 
   * @throws {Error} When configuration file is not found or invalid JSON
   * @returns {OpenCodeConfig} The loaded configuration object
   */
  public loadConfig(): OpenCodeConfig {
    if (this.config) {
      logger.debug(`Returning cached configuration from ${this.configPath}`)
      return this.config
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        const error = new Error(`Configuration file not found: ${this.configPath}`)
        logger.error(`Configuration file not found at path: ${this.configPath}`)
        throw error
      }

      const configContent = fs.readFileSync(this.configPath, 'utf8')
      
      let parsedConfig: OpenCodeConfig
      try {
        parsedConfig = JSON.parse(configContent) as OpenCodeConfig
      } catch (parseError) {
        const error = new Error(`Invalid JSON in configuration file: ${this.configPath}`)
        logger.error(`JSON parse error in ${this.configPath}:`, parseError)
        throw error
      }
      
      this.config = parsedConfig
      logger.debug(`Successfully loaded configuration from ${this.configPath}`)
      return this.config
    } catch (error) {
      // Re-throw with consistent error handling
      if (error instanceof Error) {
        logger.error(`Failed to load configuration from ${this.configPath}: ${error.message}`)
        throw error
      } else {
        const errorMessage = `Unexpected error loading configuration from ${this.configPath}: ${String(error)}`
        logger.error(errorMessage)
        throw new Error(errorMessage)
      }
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
   * 
   * Note: This method provides fallback values for backward compatibility,
   * but new configurations should specify these values in opencode.json
   * to maintain the "single source of truth" principle.
   */
  public getModelConfig(): ModelConfig {
    const config = this.loadConfig()
    
    // Extract from config with minimal fallbacks for backward compatibility
    const primary = config.model || 'berget/deepseek-r1'
    const small = config.small_model || 'berget/gpt-oss'
    
    if (!config.model || !config.small_model) {
      logger.warn(
        'Using fallback model values. Consider specifying model and small_model in opencode.json ' +
        `to maintain single source of truth. Using primary: ${primary}, small: ${small}`
      )
    }
    
    return { primary, small }
  }

  /**
   * Get provider model configuration
   * 
   * Note: This method provides fallback values for backward compatibility.
   * New configurations should specify provider models in opencode.json
   * to maintain the "single source of truth" principle.
   */
  public getProviderModels(): Record<string, ProviderModelConfig> {
    const config = this.loadConfig()
    
    // Extract from provider configuration
    if (config.provider?.berget?.models) {
      return config.provider.berget.models as Record<string, ProviderModelConfig>
    }
    
    // Fallback to defaults for backward compatibility
    logger.warn(
      'No provider models found in configuration. Using fallback defaults. ' +
      'Consider specifying provider.berget.models in opencode.json to maintain single source of truth.'
    )
    
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
  public getCommandConfigs(): Record<string, CommandConfig> {
    const config = this.loadConfig()
    return config.command || {}
  }

  /**
   * Get watcher configuration
   * 
   * Note: Provides sensible fallback defaults for backward compatibility.
   * New configurations should specify watcher settings in opencode.json.
   */
  public getWatcherConfig(): WatcherConfig {
    const config = this.loadConfig()
    
    if (config.watcher) {
      return config.watcher
    }
    
    // Fallback to defaults for backward compatibility
    logger.warn(
      'No watcher configuration found. Using fallback defaults. ' +
      'Consider specifying watcher settings in opencode.json to maintain single source of truth.'
    )
    
    return { ignore: ['node_modules', 'dist', '.git', 'coverage'] }
  }

  /**
   * Get provider configuration
   */
  public getProviderConfig(): Record<string, ProviderConfig> {
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
   * Set custom configuration path and clear cache
   * 
   * Use this method to change the configuration file path after instance creation.
   * This will invalidate the cached configuration and force a reload from the new path.
   * 
   * @param configPath Absolute path to the new configuration file
   */
  public setConfigPath(configPath: string): void {
    const oldPath = this.configPath
    this.configPath = configPath
    this.config = null // Force reload
    
    logger.debug(`Configuration path changed from ${oldPath} to ${configPath}`)
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