/**
 * API key handling logic for code commands
 * Handles key selection, creation, and rotation
 */

import chalk from 'chalk'
import readline from 'readline'
import { ApiKeyService, CreateApiKeyOptions } from '../../services/api-key-service'
import { AuthService } from '../../services/auth-service'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../../constants/command-structure'
import { handleError } from '../../utils/error-handler'
import { confirm, getInput } from './helpers'
import type { ApiKeyResult, CodeCommandOptions } from './types'

/**
 * Check authentication status
 * Returns true if authenticated or has API key in env
 */
export async function checkAuthentication(): Promise<{
  authenticated: boolean
  hasEnvKey: boolean
}> {
  // Check if we have an API key in environment first
  if (process.env.BERGET_API_KEY) {
    return { authenticated: true, hasEnvKey: true }
  }

  // Only require authentication if we don't have an API key
  try {
    const authService = AuthService.getInstance()
    await authService.whoami()
    return { authenticated: true, hasEnvKey: false }
  } catch {
    return { authenticated: false, hasEnvKey: false }
  }
}

/**
 * Print authentication error and guidance
 */
export function printAuthenticationError(): void {
  console.log(chalk.red('❌ Not authenticated with Berget AI.'))
  console.log(chalk.blue('To get started, you have two options:'))
  console.log('')
  console.log(chalk.yellow('Option 1: Use an existing API key (recommended)'))
  console.log(chalk.cyan('  Set BERGET_API_KEY environment variable:'))
  console.log(chalk.dim('    export BERGET_API_KEY=your_api_key_here'))
  console.log(chalk.cyan('  Or create a .env file in your project:'))
  console.log(chalk.dim('    echo "BERGET_API_KEY=your_api_key_here" > .env'))
  console.log('')
  console.log(chalk.yellow('Option 2: Login and create a new API key'))
  console.log(chalk.cyan('  berget auth login'))
  console.log(chalk.cyan(`  berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`))
  console.log('')
  console.log(chalk.blue('Then try again.'))
}

/**
 * Handle API key selection or creation
 * Returns the API key and key name
 */
export async function handleApiKeySelection(
  options: CodeCommandOptions,
  projectName: string
): Promise<ApiKeyResult | null> {
  // Check for environment variable first (regardless of automation mode)
  if (process.env.BERGET_API_KEY) {
    console.log(chalk.blue('🔑 Using BERGET_API_KEY from environment'))
    return {
      apiKey: process.env.BERGET_API_KEY,
      keyName: `env-key-${projectName}`,
    }
  }

  try {
    const apiKeyService = ApiKeyService.getInstance()

    // List existing API keys
    if (!options.yes) {
      console.log(chalk.blue('\n📋 Checking existing API keys...'))
    }
    const existingKeys = await apiKeyService.list()

    if (existingKeys.length > 0 && !options.yes) {
      return await selectExistingOrCreateNew(
        apiKeyService,
        existingKeys,
        projectName,
        options
      )
    } else {
      // No existing keys or automation mode - create new one
      return await createNewKey(apiKeyService, projectName, options)
    }
  } catch (error) {
    if (process.env.BERGET_API_KEY) {
      console.log(
        chalk.yellow(
          '⚠️  Could not verify API key with Berget API, but continuing with environment key'
        )
      )
      console.log(
        chalk.dim('This might be due to network issues or an invalid key')
      )
      return {
        apiKey: process.env.BERGET_API_KEY,
        keyName: `env-key-${projectName}`,
      }
    }

    printApiKeyError(error)
    return null
  }
}

/**
 * Select an existing key or create a new one
 */
async function selectExistingOrCreateNew(
  apiKeyService: ApiKeyService,
  existingKeys: Array<{
    id: number
    name: string
    prefix: string
    created: string
    lastUsed: string | null
  }>,
  projectName: string,
  options: CodeCommandOptions
): Promise<ApiKeyResult | null> {
  console.log(chalk.blue('Found existing API keys:'))
  console.log(chalk.dim('─'.repeat(60)))

  existingKeys.forEach((key, index) => {
    console.log(
      `${chalk.cyan((index + 1).toString())}. ${chalk.bold(key.name)} (${key.prefix}...)`
    )
    console.log(
      chalk.dim(
        `   Created: ${new Date(key.created).toLocaleDateString('sv-SE')}`
      )
    )
    console.log(
      chalk.dim(
        `   Last used: ${key.lastUsed ? new Date(key.lastUsed).toLocaleDateString('sv-SE') : 'Never'}`
      )
    )
    if (index < existingKeys.length - 1) console.log()
  })

  console.log(chalk.dim('─'.repeat(60)))
  console.log(chalk.cyan(`${existingKeys.length + 1}. Create a new API key`))

  // Get user choice
  const choice = await getUserChoice(existingKeys.length + 1)
  const choiceIndex = parseInt(choice) - 1

  if (choiceIndex >= 0 && choiceIndex < existingKeys.length) {
    // Use existing key - need to rotate to get actual value
    return await rotateExistingKey(
      apiKeyService,
      existingKeys[choiceIndex],
      options
    )
  } else if (choiceIndex === existingKeys.length) {
    // Create new key
    return await createNewKey(apiKeyService, projectName, options)
  }

  console.log(chalk.red('Invalid selection.'))
  return null
}

/**
 * Get user choice from stdin
 */
async function getUserChoice(maxOption: number): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    rl.question(
      chalk.blue(`\nSelect an option (1-${maxOption}): `),
      (answer) => {
        rl.close()
        resolve(answer.trim())
      }
    )
  })
}

/**
 * Rotate an existing key to get the actual key value
 */
async function rotateExistingKey(
  apiKeyService: ApiKeyService,
  selectedKey: { id: number; name: string },
  options: CodeCommandOptions
): Promise<ApiKeyResult | null> {
  console.log(
    chalk.yellow(
      `\n🔄 Rotating API key "${selectedKey.name}" to get the key value...`
    )
  )

  if (
    await confirm(
      chalk.yellow('This will invalidate the current key. Continue? (Y/n): '),
      options.yes
    )
  ) {
    const rotatedKey = await apiKeyService.rotate(selectedKey.id.toString())
    console.log(chalk.green('✓ API key rotated successfully'))
    return {
      apiKey: rotatedKey.key,
      keyName: selectedKey.name,
    }
  }

  console.log(
    chalk.yellow(
      'Cancelled. Please select a different option or create a new key.'
    )
  )
  return null
}

/**
 * Create a new API key
 */
async function createNewKey(
  apiKeyService: ApiKeyService,
  projectName: string,
  options: CodeCommandOptions
): Promise<ApiKeyResult> {
  if (!options.yes) {
    console.log(chalk.yellow('No existing API keys found.'))
  }
  console.log(chalk.blue('Creating a new API key...'))

  const defaultKeyName = `opencode-${projectName}-${Date.now()}`
  const customName = await getInput(
    chalk.blue(`Enter key name (default: ${defaultKeyName}): `),
    defaultKeyName,
    options.yes
  )

  const createOptions: CreateApiKeyOptions = { name: customName }
  const keyData = await apiKeyService.create(createOptions)
  console.log(chalk.green(`✓ Created new API key: ${customName}`))

  return {
    apiKey: keyData.key,
    keyName: customName,
  }
}

/**
 * Print API key error and guidance
 */
function printApiKeyError(error: unknown): void {
  console.error(chalk.red('❌ Failed to handle API keys:'))
  console.log(chalk.blue('This could be due to:'))
  console.log(chalk.dim('  • Network connectivity issues'))
  console.log(chalk.dim('  • Invalid authentication credentials'))
  console.log(chalk.dim('  • API service temporarily unavailable'))
  console.log('')
  console.log(chalk.blue('Try using an API key directly:'))
  console.log(chalk.cyan('  export BERGET_API_KEY=your_api_key_here'))
  console.log(
    chalk.cyan(
      `  berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT} --yes`
    )
  )
  handleError('API key operation failed', error)
}
