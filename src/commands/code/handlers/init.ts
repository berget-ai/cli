/**
 * Handler for the 'berget code init' command
 */

import chalk from 'chalk'
import * as fs from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../../../constants/command-structure'
import { handleError } from '../../../utils/error-handler'
import { updateEnvFile } from '../../../utils/env-manager'
import { getModelConfig, getProviderModels, getConfigLoader } from '../../../utils/config-loader'
import type { CodeCommandOptions, AgentConfig } from '../types'
import { confirm, getProjectName } from '../helpers'
import { ensureOpencodeInstalled } from '../opencode-installer'
import {
  checkAuthentication,
  printAuthenticationError,
  handleApiKeySelection,
} from '../api-key-handler'
import { createOpenCodeConfig } from '../config-builder'
import { writeAgentsMd, ensureGitignoreHasEnv } from '../documentation-generator'

/**
 * Handle the init command
 */
export async function handleInitCommand(options: CodeCommandOptions): Promise<void> {
  try {
    const projectName = options.name || getProjectName()
    const configPath = path.join(process.cwd(), 'opencode.json')

    // Check if already initialized
    if (fs.existsSync(configPath) && !options.force) {
      if (!options.yes) {
        console.log(chalk.yellow('Project already initialized for OpenCode.'))
        console.log(chalk.dim(`Config file: ${configPath}`))
      }

      if (!(await confirm('Do you want to reinitialize? (Y/n): ', options.yes))) {
        return
      }
    }

    // Ensure opencode is installed
    if (!(await ensureOpencodeInstalled(options.yes))) {
      return
    }

    // Check authentication
    const authStatus = await checkAuthentication()
    if (!authStatus.authenticated) {
      printAuthenticationError()
      return
    }

    if (authStatus.hasEnvKey) {
      console.log(
        chalk.blue('🔑 Using BERGET_API_KEY from environment - no authentication required')
      )
    }

    console.log(chalk.cyan(`Initializing OpenCode for project: ${projectName}`))

    // Handle API key selection or creation
    const apiKeyResult = await handleApiKeySelection(options, projectName)
    if (!apiKeyResult) {
      return
    }

    const { apiKey } = apiKeyResult

    // Prepare paths
    const envPath = path.join(process.cwd(), '.env')

    // Load latest agent configuration to ensure consistency
    const latestAgentConfig = await loadLatestAgentConfig()
    const modelConfig = getModelConfig()
    const providerModels = getProviderModels()

    // Create opencode.json config
    const config = createOpenCodeConfig(modelConfig, providerModels, latestAgentConfig)

    // Ask for permission to create config files
    if (!options.yes) {
      printConfigurationSummary(configPath, envPath, config)
    }

    if (!(await confirm('\nCreate configuration files? (Y/n): ', options.yes))) {
      console.log(chalk.yellow('Configuration file creation cancelled.'))
      return
    }

    // Write configuration files
    await writeConfigurationFiles(envPath, configPath, apiKey, projectName, config)

    // Create AGENTS.md
    await writeAgentsMd(process.cwd(), projectName)

    // Ensure .gitignore has .env
    await ensureGitignoreHasEnv(process.cwd())

    console.log(chalk.green('\n✅ Project initialized successfully!'))
    console.log(chalk.blue('Next steps:'))
    console.log(
      chalk.blue(`  berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.RUN}`)
    )
    console.log(chalk.blue('  Or run: opencode'))
  } catch (error) {
    handleError('Failed to initialize project', error)
  }
}

/**
 * Load the latest agent configuration from opencode.json
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
 * Print configuration summary before creation
 */
function printConfigurationSummary(
  configPath: string,
  envPath: string,
  config: Record<string, unknown>
): void {
  console.log(chalk.blue('\nAbout to create configuration files:'))
  console.log(chalk.dim(`Config: ${configPath}`))
  console.log(chalk.dim(`Environment: ${envPath}`))
  console.log(
    chalk.dim(
      `Documentation: ${path.join(process.cwd(), 'AGENTS.md')} (if not exists)`
    )
  )
  console.log(
    chalk.dim(`Environment: ${path.join(process.cwd(), '.env')} will be updated`)
  )
  console.log(chalk.dim('This will configure OpenCode to use Berget AI models.'))
  console.log(chalk.cyan('\n💡 Benefits:'))
  console.log(
    chalk.cyan('  • API key stored separately in .env file (not committed to Git)')
  )
  console.log(chalk.cyan('  • Easy cost separation per project/customer'))
  console.log(chalk.cyan('  • Secure key management with environment variables'))
  console.log(
    chalk.cyan("  • Project-specific agent documentation (won't overwrite existing)")
  )
}

/**
 * Write configuration files
 */
async function writeConfigurationFiles(
  envPath: string,
  configPath: string,
  apiKey: string,
  projectName: string,
  config: Record<string, unknown>
): Promise<void> {
  try {
    // Safely update .env file using dotenv
    await updateEnvFile({
      envPath,
      key: 'BERGET_API_KEY',
      value: apiKey,
      comment: `Berget AI Configuration for ${projectName} - Generated by berget code init - Do not commit to version control`,
    })

    // Create opencode.json
    await writeFile(configPath, JSON.stringify(config, null, 2))
    console.log(chalk.green('✓ Created opencode.json'))
    console.log(chalk.dim(`  Model: ${config.model}`))
    console.log(chalk.dim(`  Small Model: ${config.small_model}`))
    console.log(chalk.dim(`  Theme: ${config.theme}`))
    console.log(chalk.dim('  API Key: Stored in .env as BERGET_API_KEY'))
  } catch (error) {
    console.error(chalk.red('Failed to create config files:'))
    handleError('Config file creation failed', error)
    throw error
  }
}
