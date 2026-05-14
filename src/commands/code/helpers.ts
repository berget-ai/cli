/**
 * User interaction helper functions for the code command module
 */

import readline from 'readline'
import * as fs from 'fs'
import path from 'path'

/**
 * Check if current directory has git
 */
export function hasGit(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), '.git'))
  } catch {
    return false
  }
}

/**
 * Helper function to get user confirmation
 */
export async function confirm(
  question: string,
  autoYes = false
): Promise<boolean> {
  if (autoYes) {
    return true
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question(question, (answer) => {
      rl.close()
      resolve(
        answer.toLowerCase() === 'y' ||
          answer.toLowerCase() === 'yes' ||
          answer === ''
      )
    })
  })
}

/**
 * Helper function to get user choice from options
 */
export async function askChoice(
  question: string,
  options: string[],
  defaultChoice?: string
): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question(question, (answer) => {
      rl.close()

      const trimmed = answer.trim().toLowerCase()

      // Handle numeric input (1, 2, etc.)
      const numericIndex = parseInt(trimmed) - 1
      if (numericIndex >= 0 && numericIndex < options.length) {
        resolve(options[numericIndex])
        return
      }

      // Handle text input
      const matchingOption = options.find((option) =>
        option.toLowerCase().startsWith(trimmed)
      )

      if (matchingOption) {
        resolve(matchingOption)
      } else if (defaultChoice) {
        resolve(defaultChoice)
      } else {
        resolve(options[0]) // Default to first option
      }
    })
  })
}

/**
 * Helper function to get user input
 */
export async function getInput(
  question: string,
  defaultValue: string,
  autoYes = false
): Promise<string> {
  if (autoYes) {
    return defaultValue
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue)
    })
  })
}

/**
 * Get project name from current directory or package.json
 */
export function getProjectName(): string {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
      const packageJson = JSON.parse(packageJsonContent)
      return packageJson.name || path.basename(process.cwd())
    }
  } catch {
    // Ignore error and fallback to directory name
  }
  return path.basename(process.cwd())
}
