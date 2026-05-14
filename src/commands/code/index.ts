/**
 * Code command module exports
 */

// Types
export type {
  CodeCommandOptions,
  MergeableConfig,
  ApiKeyResult,
} from './types'

// Handlers
export {
  handleInitCommand,
  handleRunCommand,
  handleUpdateCommand,
} from './handlers'

// Utilities
export { createOpenCodeConfig } from './config-builder'
export { mergeConfigurations, fallbackMerge } from './config-merger'
export { writeAgentsMd, ensureGitignoreHasEnv } from './documentation-generator'
export { ensureOpencodeInstalled, checkOpencodeInstalled } from './opencode-installer'
export { handleApiKeySelection, checkAuthentication } from './api-key-handler'
export { confirm, askChoice, getInput, getProjectName, hasGit } from './helpers'
