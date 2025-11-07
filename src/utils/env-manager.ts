import fs from 'fs'
import path from 'path'
import { writeFile } from 'fs/promises'
import chalk from 'chalk'
import dotenv from 'dotenv'

export interface EnvUpdateOptions {
  envPath?: string
  key: string
  value: string
  comment?: string
  force?: boolean
}

/**
 * Safely updates .env file without overwriting existing keys
 * Uses dotenv for proper parsing and formatting
 */
export async function updateEnvFile(options: EnvUpdateOptions): Promise<boolean> {
  const {
    envPath = path.join(process.cwd(), '.env'),
    key,
    value,
    comment,
    force = false
  } = options

  try {
    let existingContent = ''
    let parsed: Record<string, string> = {}

    // Read existing .env file if it exists
    if (fs.existsSync(envPath)) {
      existingContent = fs.readFileSync(envPath, 'utf8')
      parsed = dotenv.parse(existingContent)
    }

    // Check if key already exists and we're not forcing
    if (parsed[key] && !force) {
      console.log(chalk.yellow(`⚠ ${key} already exists in .env - leaving unchanged`))
      return false
    }

    // Update the parsed object
    parsed[key] = value

    // Generate new .env content
    let newContent = ''
    
    // Add comment at the top if this is a new file
    if (!existingContent && comment) {
      newContent += `# ${comment}\n`
    }

    // Convert parsed object back to .env format
    for (const [envKey, envValue] of Object.entries(parsed)) {
      newContent += `${envKey}=${envValue}\n`
    }

    // Write the updated content
    await writeFile(envPath, newContent.trim() + '\n')

    if (existingContent) {
      console.log(chalk.green(`✓ Updated .env with ${key}`))
    } else {
      console.log(chalk.green(`✓ Created .env with ${key}`))
    }

    return true

  } catch (error) {
    console.error(chalk.red(`Failed to update .env file:`))
    throw error
  }
}

/**
 * Checks if a .env file exists and contains a specific key
 */
export function hasEnvKey(envPath: string = path.join(process.cwd(), '.env'), key: string): boolean {
  if (!fs.existsSync(envPath)) {
    return false
  }

  try {
    const content = fs.readFileSync(envPath, 'utf8')
    const parsed = dotenv.parse(content)
    return key in parsed
  } catch {
    return false
  }
}