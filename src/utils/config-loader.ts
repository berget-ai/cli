import * as fs from 'node:fs';
import * as path from 'node:path';

import { logger } from './logger';

/**
 * Centralized agent configuration loader
 * Loads all agent configurations from opencode.json as the single source of truth
 */

export interface AgentConfig {
  description?: string;
  mode: 'primary' | 'subagent';
  model: string;
  note?: string;
  permission: {
    bash: 'allow' | 'deny';
    edit: 'allow' | 'deny';
    webfetch: 'allow' | 'deny';
  };
  prompt?: string;
  temperature: number;
  top_p: number;
}

export interface ModelConfig {
  primary: string;
  small: string;
}

export interface OpenCodeConfig {
  $schema?: string;
  agent?: Record<string, AgentConfig>;
  autoupdate?: boolean;
  command?: Record<string, any>;
  model?: string;
  provider?: Record<string, any>;
  share?: string;
  small_model?: string;
  theme?: string;
  username?: string;
  watcher?: Record<string, any>;
}

export interface ProviderModelConfig {
  limit: {
    context: number;
    output: number;
  };
  modalities?: {
    input: string[];
    output: string[];
  };
  name: string;
}

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: null | OpenCodeConfig = null;
  private configPath: string;

  private constructor(configPath?: string) {
    // Default to opencode.json in current working directory
    this.configPath = configPath || path.join(process.cwd(), 'opencode.json');
  }

  /**
   * Clear the singleton instance (for testing purposes)
   */
  public static clearInstance(): void {
    ConfigLoader.instance = null as any;
  }

  public static getInstance(configPath?: string): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader(configPath);
    }
    return ConfigLoader.instance;
  }

  /**
   * Get agent configuration by name
   */
  public getAgentConfig(agentName: string): AgentConfig | null {
    try {
      const config = this.loadConfig();
      return config.agent?.[agentName] || null;
    } catch {
      // Config file doesn't exist, return null
      return null;
    }
  }

  /**
   * Get list of all available agent names
   */
  public getAgentNames(): string[] {
    return Object.keys(this.getAllAgentConfigs());
  }

  /**
   * Get all agent configurations
   */
  public getAllAgentConfigs(): Record<string, AgentConfig> {
    try {
      const config = this.loadConfig();
      return config.agent || {};
    } catch {
      // Config file doesn't exist, return empty object
      return {};
    }
  }

  /**
   * Get command configurations
   */
  public getCommandConfigs(): Record<string, any> {
    try {
      const config = this.loadConfig();
      return config.command || {};
    } catch {
      // Config file doesn't exist, return empty object
      return {};
    }
  }

  /**
   * Get the current configuration path
   */
  public getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get model configuration
   */
  public getModelConfig(): ModelConfig {
    try {
      const config = this.loadConfig();

      // Extract from config or fall back to defaults
      const primary = config.model || 'berget/glm-4.7';
      const small = config.small_model || 'berget/gpt-oss';

      return { primary, small };
    } catch {
      // Fallback to defaults when no config exists (init scenario)
      return {
        primary: 'berget/glm-4.7',
        small: 'berget/gpt-oss',
      };
    }
  }

  /**
   * Get list of primary agents (mode: 'primary')
   */
  public getPrimaryAgentNames(): string[] {
    const agents = this.getAllAgentConfigs();
    return Object.keys(agents).filter((name) => agents[name].mode === 'primary');
  }

  /**
   * Get provider configuration
   */
  public getProviderConfig(): Record<string, any> {
    try {
      const config = this.loadConfig();
      return config.provider || {};
    } catch {
      // Config file doesn't exist, return empty object
      return {};
    }
  }

  /**
   * Get provider model configuration
   */
  public getProviderModels(): Record<string, ProviderModelConfig> {
    try {
      const config = this.loadConfig();

      // Extract from provider configuration
      if (config.provider?.berget?.models) {
        return config.provider.berget.models as Record<string, ProviderModelConfig>;
      }
    } catch {
      // Config file doesn't exist, use fallback defaults
    }

    // Fallback to defaults
    return {
      'glm-4.7': {
        limit: { context: 90_000, output: 4000 },
        name: 'GLM-4.7',
      },
      'gpt-oss': {
        limit: { context: 128_000, output: 4000 },
        modalities: {
          input: ['text', 'image'],
          output: ['text'],
        },
        name: 'GPT-OSS',
      },
      'llama-8b': {
        limit: { context: 128_000, output: 4000 },
        name: 'llama-3.1-8b',
      },
    };
  }

  /**
   * Get list of subagents (mode: 'subagent')
   */
  public getSubagentNames(): string[] {
    const agents = this.getAllAgentConfigs();
    return Object.keys(agents).filter((name) => agents[name].mode === 'subagent');
  }

  /**
   * Get watcher configuration
   */
  public getWatcherConfig(): Record<string, any> {
    try {
      const config = this.loadConfig();
      return (
        config.watcher || {
          ignore: ['node_modules', 'dist', '.git', 'coverage'],
        }
      );
    } catch {
      // Config file doesn't exist, return default watcher config
      return { ignore: ['node_modules', 'dist', '.git', 'coverage'] };
    }
  }

  /**
   * Check if an agent exists
   */
  public hasAgent(agentName: string): boolean {
    return agentName in this.getAllAgentConfigs();
  }

  /**
   * Load configuration from opencode.json
   */
  public loadConfig(): OpenCodeConfig {
    if (this.config) {
      return this.config;
    }

    try {
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configContent) as OpenCodeConfig;

      logger.debug(`Loaded configuration from ${this.configPath}`);
      return this.config;
    } catch (error) {
      logger.error(`Failed to load configuration from ${this.configPath}:`, error);
      throw new Error(
        `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Reload configuration from file
   */
  public reloadConfig(): OpenCodeConfig {
    this.config = null;
    return this.loadConfig();
  }

  /**
   * Set custom configuration path (for testing or different environments)
   */
  public setConfigPath(configPath: string): void {
    this.configPath = configPath;
    this.config = null; // Force reload
  }
}

/**
 * Convenience function to get agent configuration
 */
export function getAgentConfig(agentName: string, configPath?: string): AgentConfig | null {
  return getConfigLoader(configPath).getAgentConfig(agentName);
}

/**
 * Convenience function to get all agent configurations
 */
export function getAllAgentConfigs(configPath?: string): Record<string, AgentConfig> {
  return getConfigLoader(configPath).getAllAgentConfigs();
}

/**
 * Convenience function to get the config loader instance
 */
export function getConfigLoader(configPath?: string): ConfigLoader {
  return ConfigLoader.getInstance(configPath);
}

/**
 * Convenience function to get model configuration
 */
export function getModelConfig(configPath?: string): ModelConfig {
  return getConfigLoader(configPath).getModelConfig();
}

/**
 * Convenience function to get provider models
 */
export function getProviderModels(configPath?: string): Record<string, ProviderModelConfig> {
  return getConfigLoader(configPath).getProviderModels();
}
