/**
 * Handler for the 'berget code update' command
 */

import chalk from 'chalk'
import * as fs from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../../../constants/command-structure'
import { handleError } from '../../../utils/error-handler'
import { getModelConfig, getProviderModels, getConfigLoader } from '../../../utils/config-loader'
import type { CodeCommandOptions, MergeableConfig, AgentConfig } from '../types'
import { confirm, askChoice, hasGit } from '../helpers'
import { ensureOpencodeInstalled } from '../opencode-installer'
import { createOpenCodeConfig } from '../config-builder'
import { writeAgentsMd } from '../documentation-generator'
import { mergeConfigurations } from '../config-merger'

/**
 * Handle the update command
 */
export async function handleUpdateCommand(options: CodeCommandOptions): Promise<void> {
  try {
    console.log(chalk.cyan('🔄 Updating OpenCode configuration...'))

    // Ensure opencode is installed first
    if (!(await ensureOpencodeInstalled(options.yes))) {
      return
    }

    const configPath = path.join(process.cwd(), 'opencode.json')

    // Check if project is initialized
    if (!fs.existsSync(configPath)) {
      console.log(chalk.red('❌ No OpenCode configuration found.'))
      console.log(
        chalk.blue(
          `Run ${chalk.bold(`berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`)} first.`
        )
      )
      return
    }

    // Read current configuration
    const currentConfig = await readCurrentConfig(configPath)
    if (!currentConfig) {
      return
    }

    printCurrentConfig(currentConfig)

    // Load latest configuration
    const latestAgentConfig = await loadLatestAgentConfig()
    const modelConfig = getModelConfig()
    const providerModels = getProviderModels()
    const latestConfig = createOpenCodeConfig(modelConfig, providerModels, latestAgentConfig)

    // Check if update is needed
    const needsUpdate = JSON.stringify(currentConfig) !== JSON.stringify(latestConfig)

    if (!needsUpdate && !options.force) {
      console.log(chalk.green('✅ Already using the latest configuration!'))
      return
    }

    if (needsUpdate) {
      printAvailableUpdates(currentConfig, latestConfig, modelConfig)
    }

    if (options.force) {
      console.log(chalk.yellow('🔧 Force update requested'))
    }

    // Print git status info
    if (!options.yes) {
      printGitStatus()
    }

    // Get update strategy choice
    const mergeChoice = await getUpdateStrategyChoice(options)

    if (!(await confirm(`\nProceed with ${mergeChoice}? (Y/n): `, options.yes))) {
      console.log(chalk.yellow('Update cancelled.'))
      return
    }

    // Perform update
    await performUpdate(
      configPath,
      currentConfig,
      latestConfig,
      mergeChoice
    )

    // Update AGENTS.md if it doesn't exist
    await writeAgentsMd(process.cwd(), 'updated')

    printSuccessMessage()
  } catch (error) {
    handleError('Failed to update OpenCode configuration', error)
  }
}

/**
 * Read current configuration from file
 */
async function readCurrentConfig(configPath: string): Promise<MergeableConfig | null> {
  try {
    const configContent = await readFile(configPath, 'utf8')
    return JSON.parse(configContent) as MergeableConfig
  } catch (error) {
    console.error(chalk.red('Failed to read current opencode.json:'))
    handleError('Config read failed', error)
    return null
  }
}

/**
 * Load the latest agent configuration
 */
async function loadLatestAgentConfig(): Promise<Record<string, AgentConfig> | undefined> {
  try {
    const configLoader = getConfigLoader()
    const config = configLoader.loadConfig()
    return config.agent
  } catch {
    console.warn(chalk.yellow('⚠️  Could not load latest agent config, using fallback'))
    return undefined
  }
}

/**
 * Print current configuration summary
 */
function printCurrentConfig(config: MergeableConfig): void {
  console.log(chalk.blue('📋 Current configuration:'))
  console.log(chalk.dim(`  Model: ${config.model}`))
  console.log(chalk.dim(`  Theme: ${config.theme}`))
  console.log(
    chalk.dim(`  Agents: ${Object.keys(config.agent || {}).length} configured`)
  )
}

/**
 * Print available updates
 */
function printAvailableUpdates(
  currentConfig: MergeableConfig,
  latestConfig: MergeableConfig,
  modelConfig: { primary: string }
): void {
  console.log(chalk.blue('\n🔄 Updates available:'))

  // Compare agents
  const currentAgents = Object.keys(currentConfig.agent || {})
  const latestAgents = Object.keys(latestConfig.agent || {})
  const newAgents = latestAgents.filter((agent) => !currentAgents.includes(agent))

  if (newAgents.length > 0) {
    console.log(chalk.cyan(`  • New agents: ${newAgents.join(', ')}`))
  }

  // Check for quality agent specifically
  if (!currentConfig.agent?.quality && latestConfig.agent?.quality) {
    console.log(chalk.cyan('  • Quality subagent for testing and PR management'))
  }

  // Check for security subagent mode
  if (currentConfig.agent?.security?.mode !== 'subagent') {
    console.log(chalk.cyan('  • Security agent converted to subagent (read-only)'))
  }

  // Check for model optimizations
  const primaryModelKey = modelConfig.primary.replace('berget/', '')
  const bergetModels = currentConfig.provider?.berget?.models as Record<string, { limit?: { context?: number } }> | undefined
  if (!bergetModels?.[primaryModelKey]?.limit?.context) {
    console.log(chalk.cyan('  • GLM-4.6 token limits and auto-compaction'))
  }

  console.log(chalk.cyan('  • Latest agent prompts and improvements'))
}

/**
 * Print git status info
 */
function printGitStatus(): void {
  console.log(
    chalk.blue('\nThis will update your OpenCode configuration with the latest improvements.')
  )

  const hasGitRepo = hasGit()
  if (!hasGitRepo) {
    console.log(
      chalk.yellow('⚠️  No .git repository detected - backup will be created')
    )
  } else {
    console.log(chalk.green('✓ Git repository detected - changes are tracked'))
  }
}

/**
 * Get update strategy choice from user
 */
async function getUpdateStrategyChoice(
  options: CodeCommandOptions
): Promise<'replace' | 'merge'> {
  console.log(chalk.blue('\nChoose update strategy:'))
  console.log(
    chalk.cyan('1) Replace - Use latest configuration (your customizations will be lost)')
  )
  console.log(
    chalk.cyan('2) Merge  - Combine latest updates with your customizations (recommended)')
  )

  if (options.yes) {
    return 'merge'
  }

  const choice = await askChoice(
    '\nYour choice (1-2, default: 2): ',
    ['replace', 'merge'],
    'merge'
  )
  return choice as 'replace' | 'merge'
}

/**
 * Perform the configuration update
 */
async function performUpdate(
  configPath: string,
  currentConfig: MergeableConfig,
  latestConfig: MergeableConfig,
  mergeChoice: 'replace' | 'merge'
): Promise<void> {
  let backupPath: string | null = null

  // Create backup if no git
  if (!hasGit()) {
    backupPath = `${configPath}.backup.${Date.now()}`
    await writeFile(backupPath, JSON.stringify(currentConfig, null, 2))
    console.log(
      chalk.green(`✓ Backed up current config to ${path.basename(backupPath)}`)
    )
  }

  try {
    let finalConfig: MergeableConfig

    if (mergeChoice === 'merge') {
      finalConfig = await mergeConfigurations(currentConfig, latestConfig)
      console.log(chalk.green('✓ Merged configurations with latest updates'))
    } else {
      finalConfig = latestConfig
      console.log(chalk.green('✓ Replaced with latest configuration'))
    }

    // Write final configuration
    await writeFile(configPath, JSON.stringify(finalConfig, null, 2))
    console.log(chalk.green(`✓ Updated opencode.json with ${mergeChoice} strategy`))
  } catch (error) {
    console.error(chalk.red('Failed to update configuration:'))
    handleError('Update failed', error)

    // Restore from backup if update failed
    try {
      await writeFile(configPath, JSON.stringify(currentConfig, null, 2))
      console.log(chalk.yellow('📁 Restored original configuration from backup'))
    } catch {
      console.error(chalk.red('Failed to restore backup'))
    }
    throw error
  }
}

/**
 * Print success message with new features
 */
function printSuccessMessage(): void {
  console.log(chalk.green('\n✅ Update completed successfully!'))
  console.log(chalk.blue('New features available:'))
  console.log(chalk.cyan('  • @quality subagent for testing and PR management'))
  console.log(chalk.cyan('  • @security subagent for security reviews'))
  console.log(chalk.cyan('  • Improved agent prompts and routing'))
  console.log(chalk.cyan('  • GLM-4.6 token optimizations'))
  console.log(chalk.blue('\nTry these new commands:'))
  console.log(chalk.cyan('  @quality run tests and create PR'))
  console.log(chalk.cyan('  @security review this code'))
}
