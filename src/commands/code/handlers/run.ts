/**
 * Handler for the 'berget code run' command
 */

import chalk from 'chalk'
import * as fs from 'fs'
import { readFile } from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../../../constants/command-structure'
import { handleError } from '../../../utils/error-handler'
import type { CodeCommandOptions, MergeableConfig } from '../types'
import { ensureOpencodeInstalled } from '../opencode-installer'

/**
 * Handle the run command
 */
export async function handleRunCommand(
  prompt: string | undefined,
  options: CodeCommandOptions
): Promise<void> {
  try {
    const configPath = path.join(process.cwd(), 'opencode.json')

    // Ensure opencode is installed
    if (!(await ensureOpencodeInstalled(options.yes))) {
      return
    }

    let config: MergeableConfig | null = null
    if (!options.noConfig && fs.existsSync(configPath)) {
      config = await loadProjectConfig(configPath)
    }

    if (!config) {
      console.log(chalk.yellow('No project configuration found.'))
      console.log(
        chalk.blue(
          `Run ${chalk.bold(`berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`)} first.`
        )
      )
      return
    }

    // Set environment variables for opencode
    const env = { ...process.env }
    if (config.apiKey) {
      env.OPENCODE_API_KEY = config.apiKey as string
    }

    // Prepare opencode command
    const opencodeArgs = buildOpencodeArgs(prompt, options, config)

    console.log(chalk.cyan('Starting OpenCode...'))

    // Spawn opencode process
    spawnOpencode(opencodeArgs, env)
  } catch (error) {
    handleError('Failed to run OpenCode', error)
  }
}

/**
 * Load project configuration from opencode.json
 */
async function loadProjectConfig(configPath: string): Promise<MergeableConfig | null> {
  try {
    const configContent = await readFile(configPath, 'utf8')
    const config = JSON.parse(configContent) as MergeableConfig
    console.log(chalk.dim(`Loaded config for project: ${config.projectName || 'unknown'}`))
    console.log(
      chalk.dim(
        `Models: Analysis=${config.analysisModel || 'default'}, Build=${config.buildModel || 'default'}`
      )
    )
    return config
  } catch {
    console.log(chalk.yellow('Warning: Failed to load opencode.json'))
    return null
  }
}

/**
 * Build opencode arguments based on options
 */
function buildOpencodeArgs(
  prompt: string | undefined,
  options: CodeCommandOptions,
  config: MergeableConfig
): string[] {
  const opencodeArgs: string[] = []

  if (prompt) {
    opencodeArgs.push('run', prompt)
  }

  // Choose model based on analysis flag or override
  let selectedModel = options.model || (config.buildModel as string | undefined)
  if (options.analysis && !options.model) {
    selectedModel = config.analysisModel as string | undefined
  }

  if (selectedModel) {
    opencodeArgs.push('--model', selectedModel)
  }

  return opencodeArgs
}

/**
 * Spawn the opencode process
 */
function spawnOpencode(args: string[], env: NodeJS.ProcessEnv): void {
  const opencode = spawn('opencode', args, {
    stdio: 'inherit',
    env: env,
    shell: true,
  })

  opencode.on('close', (code) => {
    if (code !== 0) {
      console.log(chalk.red(`OpenCode exited with code ${code}`))
    }
  })

  opencode.on('error', (error) => {
    console.error(chalk.red('Failed to start OpenCode:'))
    console.error(error.message)
  })
}
