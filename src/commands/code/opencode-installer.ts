/**
 * OpenCode installation and verification logic
 */

import chalk from 'chalk'
import { spawn } from 'child_process'
import { confirm } from './helpers'

/**
 * Check if opencode is installed
 */
export function checkOpencodeInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('opencode', ['--version'], {
      stdio: 'pipe',
      shell: true,
    })

    child.on('close', (code) => {
      resolve(code === 0)
    })

    child.on('error', () => {
      resolve(false)
    })
  })
}

/**
 * Install opencode via npm
 */
export async function installOpencode(): Promise<boolean> {
  console.log(chalk.cyan('Installing OpenCode via npm...'))

  try {
    await new Promise<void>((resolve, reject) => {
      const install = spawn('npm', ['install', '-g', 'opencode-ai'], {
        stdio: 'inherit',
        shell: true,
      })

      install.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green('✓ OpenCode installed successfully!'))
          resolve()
        } else {
          reject(new Error(`Installation failed with code ${code}`))
        }
      })

      install.on('error', reject)
    })

    // Verify installation
    const opencodeInstalled = await checkOpencodeInstalled()
    if (!opencodeInstalled) {
      console.log(
        chalk.yellow('Installation completed but opencode command not found.')
      )
      console.log(
        chalk.yellow(
          'You may need to restart your terminal or check your PATH.'
        )
      )
      return false
    }

    return true
  } catch (error) {
    console.error(chalk.red('Failed to install OpenCode:'))
    console.error(error instanceof Error ? error.message : String(error))
    console.log(chalk.blue('\nAlternative installation methods:'))
    console.log(chalk.blue('  curl -fsSL https://opencode.ai/install | bash'))
    console.log(chalk.blue('  Or visit: https://opencode.ai/docs'))
    return false
  }
}

/**
 * Ensure opencode is installed, offering to install if not
 */
export async function ensureOpencodeInstalled(
  autoYes = false
): Promise<boolean> {
  let opencodeInstalled = await checkOpencodeInstalled()
  if (!opencodeInstalled) {
    if (!autoYes) {
      console.log(chalk.red('OpenCode is not installed.'))
      console.log(
        chalk.blue('OpenCode is required for the AI coding assistant.')
      )
    }

    if (
      await confirm(
        'Would you like to install OpenCode automatically? (Y/n): ',
        autoYes
      )
    ) {
      opencodeInstalled = await installOpencode()
    } else {
      if (!autoYes) {
        console.log(chalk.blue('\nInstallation cancelled.'))
        console.log(
          chalk.blue(
            'To install manually: curl -fsSL https://opencode.ai/install | bash'
          )
        )
        console.log(chalk.blue('Or visit: https://opencode.ai/docs'))
      }
    }
  }

  return opencodeInstalled
}
