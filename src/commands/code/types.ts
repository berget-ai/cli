/**
 * Type definitions for the code command module
 */

// Re-export shared types from config-loader
export type { AgentConfig, OpenCodeConfig } from '../../utils/config-loader'

/**
 * Options for code command actions
 */
export interface CodeCommandOptions {
  name?: string
  force?: boolean
  yes?: boolean
  model?: string
  analysis?: boolean
  noConfig?: boolean
  [key: string]: unknown
}

/**
 * Command configuration for opencode.json
 */
export interface CommandConfig {
  description: string
  template: string
  agent: string
  subtask?: boolean
}

/**
 * Watcher configuration for opencode.json
 */
export interface WatcherConfig {
  ignore: string[]
}

/**
 * Provider configuration for opencode.json
 */
export interface ProviderConfig {
  npm: string
  name: string
  options: {
    baseURL: string
    apiKey: string
  }
  models: ProviderModels
}

/**
 * Provider models configuration
 */
export type ProviderModels = Record<string, unknown>

/**
 * Extended type for merge operations (more flexible for merging)
 */
export interface MergeableConfig {
  [key: string]: unknown
  $schema?: string
  username?: string
  theme?: string
  share?: string
  autoupdate?: boolean
  model?: string
  small_model?: string
  projectName?: string
  apiKey?: string
  analysisModel?: string
  buildModel?: string
  agent?: Record<string, import('../../utils/config-loader').AgentConfig>
  command?: Record<string, CommandConfig>
  watcher?: WatcherConfig
  provider?: Record<string, ProviderConfig>
}

/**
 * Result of API key handling
 */
export interface ApiKeyResult {
  apiKey: string
  keyName: string
}
