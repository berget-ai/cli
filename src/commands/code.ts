import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'readline'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import { handleError } from '../utils/error-handler'
import * as fs from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

/**
 * Check if current directory has git
 */
function hasGit(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), '.git'))
  } catch {
    return false
  }
}

/**
 * Helper function to get user confirmation
 */
async function confirm(question: string, autoYes = false): Promise<boolean> {
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
 * Helper function to get user input
 */
async function getInput(
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
function getProjectName(): string {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
      const packageJson = JSON.parse(packageJsonContent)
      return packageJson.name || path.basename(process.cwd())
    }
  } catch (error) {
    // Ignore error and fallback to directory name
  }
  return path.basename(process.cwd())
}

/**
 * Get the path to the bundled agent templates directory
 */
function getAgentTemplatesDir(): string {
  return path.resolve(__dirname, '../../templates/agents')
}

/**
 * Parse a markdown agent file with YAML frontmatter into an agent config object
 */
function parseAgentMarkdown(content: string): Record<string, any> {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!frontmatterMatch) {
    throw new Error('Invalid agent markdown: missing frontmatter')
  }

  const yamlStr = frontmatterMatch[1]
  const promptBody = frontmatterMatch[2].trim()

  const config: Record<string, any> = { prompt: promptBody }

  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue

    const key = trimmed.substring(0, colonIdx).trim()
    const value = trimmed.substring(colonIdx + 1).trim()

    if (key === 'permission') continue

    if (value === 'true') {
      config[key] = true
    } else if (value === 'false') {
      config[key] = false
    } else if (!isNaN(Number(value)) && value !== '') {
      config[key] = Number(value)
    } else {
      config[key] = value
    }
  }

  const permission: Record<string, string> = {}
  const permMatch = yamlStr.match(/permission:\s*\n((?:\s+\w+:.*\n?)*)/)
  if (permMatch) {
    for (const permLine of permMatch[1].split('\n')) {
      const permTrimmed = permLine.trim()
      if (!permTrimmed) continue
      const permColonIdx = permTrimmed.indexOf(':')
      if (permColonIdx === -1) continue
      const permKey = permTrimmed.substring(0, permColonIdx).trim()
      const permValue = permTrimmed.substring(permColonIdx + 1).trim()
      if (permKey && permValue) {
        permission[permKey] = permValue
      }
    }
  }
  if (Object.keys(permission).length > 0) {
    config.permission = permission
  }

  return config
}

/**
 * Load the latest agent configuration from bundled markdown templates
 */
async function loadLatestAgentConfig(): Promise<any> {
  const templatesDir = getAgentTemplatesDir()
  const agents: Record<string, any> = {}

  const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.md'))

  for (const file of files) {
    const agentName = path.basename(file, '.md')
    const filePath = path.join(templatesDir, file)
    const content = fs.readFileSync(filePath, 'utf8')

    try {
      agents[agentName] = parseAgentMarkdown(content)
    } catch (error) {
      console.warn(
        chalk.yellow(`Warning: Failed to parse agent template ${file}: ${error}`)
      )
    }
  }

  return agents
}

/**
 * Check if opencode is installed
 */
function checkOpencodeInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('which', ['opencode'], {
      stdio: 'pipe',
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
async function installOpencode(): Promise<boolean> {
  console.log(chalk.cyan('Installing OpenCode via npm...'))

  try {
    await new Promise<void>((resolve, reject) => {
      const install = spawn('npm', ['install', '-g', 'opencode-ai@1.3'], {
        stdio: 'inherit',
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
    console.log(chalk.blue('  curl -fsSL https://opencode.ai/install | sh'))
    console.log(chalk.blue('  Or visit: https://opencode.ai/docs'))
    return false
  }
}

/**
 * Ensure opencode is installed, offering to install if not
 */
async function ensureOpencodeInstalled(autoYes = false): Promise<boolean> {
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

/**
 * Register code commands
 */
export function registerCodeCommands(program: Command): void {
  const code = program
    .command(COMMAND_GROUPS.CODE)
    .description('AI-powered coding assistant with OpenCode')

  code
    .command(SUBCOMMANDS.CODE.INIT)
    .description('Initialize project for AI coding assistant')
    .option('-n, --name <name>', 'Project name (defaults to directory name)')
    .option('-f, --force', 'Overwrite existing configuration')
    .option(
      '-y, --yes',
      'Automatically answer yes to all prompts (for automation)'
    )
    .action(async (options) => {
      try {
        const projectName = options.name || getProjectName()
        const configPath = path.join(process.cwd(), 'opencode.json')

        // Check if already initialized
        if (fs.existsSync(configPath) && !options.force) {
          if (!options.yes) {
            console.log(
              chalk.yellow('Project already initialized for OpenCode.')
            )
            console.log(chalk.dim(`Config file: ${configPath}`))
          }

          if (
            await confirm('Do you want to reinitialize? (Y/n): ', options.yes)
          ) {
            // Continue with reinitialization
          } else {
            return
          }
        }

        // Ensure opencode is installed
        if (!(await ensureOpencodeInstalled(options.yes))) {
          return
        }

        console.log(
          chalk.cyan(`Initializing OpenCode for project: ${projectName}`)
        )

        const config = {
          $schema: 'https://opencode.ai/config.json',
          plugin: ['@bergetai/opencode-auth@1.0.16'],
        }

        const agentsDir = path.join(process.cwd(), '.opencode', 'agents')
        const templatesDir = getAgentTemplatesDir()

        if (!options.yes) {
          console.log(chalk.blue('\nAbout to create configuration files:'))
          console.log(chalk.dim(`Config: ${configPath}`))
          console.log(chalk.dim(`Agents: ${agentsDir}/`))
          console.log(
            chalk.dim('This will configure OpenCode with the Berget auth plugin.')
          )
        }

        if (
          await confirm('\nCreate configuration files? (Y/n): ', options.yes)
        ) {
          try {
            await writeFile(configPath, JSON.stringify(config, null, 2))
            console.log(chalk.green('✓ Created opencode.json'))
            console.log(chalk.dim('  Plugin: @bergetai/opencode-auth'))

            fs.mkdirSync(agentsDir, { recursive: true })
            const templateFiles = fs
              .readdirSync(templatesDir)
              .filter((f) => f.endsWith('.md'))
            for (const file of templateFiles) {
              const src = path.join(templatesDir, file)
              const dest = path.join(agentsDir, file)
              fs.copyFileSync(src, dest)
            }
            console.log(
              chalk.green(
                `✓ Created ${templateFiles.length} agent definitions in .opencode/agents/`
              )
            )
          } catch (error) {
            console.error(chalk.red('Failed to create config files:'))
            handleError('Config file creation failed', error)
            return
          }
        } else {
          console.log(chalk.yellow('Configuration file creation cancelled.'))
          return
        }

        console.log(chalk.green('\n✅ Project initialized successfully!'))
        console.log(chalk.blue('\nNext steps:'))
        console.log(chalk.cyan('  1. Run: opencode'))
        console.log(chalk.cyan('  2. Type: /connect'))
        console.log(chalk.cyan('  3. Choose your auth method:'))
        console.log(chalk.dim('     • "Login with Berget" — Berget Code team members (SSO)'))
        console.log(chalk.dim('     • "Enter API Key" — API key users (console.berget.ai)'))
      } catch (error) {
        handleError('Failed to initialize project', error)
      }
    })

  code
    .command(SUBCOMMANDS.CODE.RUN)
    .description('Run AI coding assistant')
    .argument('[prompt]', 'Prompt to send directly to OpenCode')
    .option('-m, --model <model>', 'Model to use (overrides config)')
    .option('-a, --analysis', 'Use fast analysis model for context building')
    .option('--no-config', 'Run without loading project config')
    .option(
      '-y, --yes',
      'Automatically answer yes to all prompts (for automation)'
    )
    .action(async (prompt: string, options: any) => {
      try {
        const configPath = path.join(process.cwd(), 'opencode.json')

        // Ensure opencode is installed
        if (!(await ensureOpencodeInstalled(options.yes))) {
          return
        }

        let config: any = null
        if (!options.noConfig && fs.existsSync(configPath)) {
          try {
            const configContent = await readFile(configPath, 'utf8')
            config = JSON.parse(configContent)
            console.log(
              chalk.dim(`Loaded config for project: ${config.projectName}`)
            )
            console.log(
              chalk.dim(
                `Models: Analysis=${config.analysisModel}, Build=${config.buildModel}`
              )
            )
          } catch (error) {
            console.log(chalk.yellow('Warning: Failed to load opencode.json'))
          }
        }

        if (!config) {
          console.log(chalk.yellow('No project configuration found.'))
          console.log(
            chalk.blue(
              `Run ${chalk.bold(
                `berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`
              )} first.`
            )
          )
          return
        }

        // Prepare opencode command
        const env = { ...process.env }
        const opencodeArgs: string[] = []

        // Read --stage and --local from root program options
        // (these flags are registered at program level, not subcommand level)
        const isStage = process.argv.includes('--stage')
        const isLocal = process.argv.includes('--local')

        if (isStage) {
          console.log(chalk.cyan('Using Berget stage environment'))
          env.BERGET_API_URL = 'https://api.stage.berget.ai'
          env.BERGET_INFERENCE_URL = 'https://api.stage.berget.ai/v1'
        } else if (isLocal) {
          console.log(chalk.cyan('Using local development environment'))
          env.BERGET_API_URL = 'http://localhost:3000'
          env.BERGET_INFERENCE_URL = 'http://localhost:3000/v1'
        }

        if (prompt) {
          opencodeArgs.push('run', prompt)
        }

        // Choose model based on analysis flag or override
        let selectedModel = options.model || config.buildModel
        if (options.analysis && !options.model) {
          selectedModel = config.analysisModel
        }

        if (selectedModel) {
          opencodeArgs.push('--model', selectedModel)
        }

        console.log(chalk.cyan('Starting OpenCode...'))

        // Spawn opencode process
        const opencode = spawn('opencode', opencodeArgs, {
          stdio: 'inherit',
          env: env,
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
      } catch (error) {
        handleError('Failed to run OpenCode', error)
      }
    })

  code
    .command(SUBCOMMANDS.CODE.SERVE)
    .description('Start OpenCode web server')
    .option('-p, --port <port>', 'Port to run the server on (default: 3000)')
    .option(
      '-h, --host <host>',
      'Host to bind the server to (default: localhost)'
    )
    .option(
      '-y, --yes',
      'Automatically answer yes to all prompts (for automation)'
    )
    .action(async (options) => {
      try {
        // Ensure opencode is installed
        if (!(await ensureOpencodeInstalled(options.yes))) {
          return
        }

        console.log(chalk.cyan('🚀 Starting OpenCode web server...'))

        // Prepare opencode serve command
        const serveArgs: string[] = ['serve']

        if (options.port) {
          serveArgs.push('--port', options.port)
        }

        if (options.host) {
          serveArgs.push('--host', options.host)
        }

        // Spawn opencode serve process
        const opencode = spawn('opencode', serveArgs, {
          stdio: 'inherit',
        })

        opencode.on('close', (code) => {
          if (code !== 0) {
            console.log(chalk.red(`OpenCode server exited with code ${code}`))
          }
        })

        opencode.on('error', (error) => {
          console.error(chalk.red('Failed to start OpenCode server:'))
          console.error(error.message)
        })
      } catch (error) {
        handleError('Failed to start OpenCode server', error)
      }
    })

  code
    .command(SUBCOMMANDS.CODE.UPDATE)
    .description('Update OpenCode and agents to latest versions')
    .option('-f, --force', 'Force update even if already latest')
    .option(
      '-y, --yes',
      'Automatically answer yes to all prompts (for automation)'
    )
    .action(async (options) => {
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
              `Run ${chalk.bold(
                `berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`
              )} first.`
            )
          )
          return
        }

        // Read current configuration
        let currentConfig: any
        try {
          const configContent = await readFile(configPath, 'utf8')
          currentConfig = JSON.parse(configContent)
        } catch (error) {
          console.error(chalk.red('Failed to read current opencode.json:'))
          handleError('Config read failed', error)
          return
        }

        console.log(chalk.blue('📋 Current configuration:'))
        if (currentConfig.model) {
          console.log(chalk.dim(`  Model: ${currentConfig.model}`))
        }

        const agentsDir = path.join(process.cwd(), '.opencode', 'agents')
        const templatesDir = getAgentTemplatesDir()
        const templateFiles = fs
          .readdirSync(templatesDir)
          .filter((f) => f.endsWith('.md'))

        const latestConfig = {
          $schema: 'https://opencode.ai/config.json',
          plugin: ['@bergetai/opencode-auth@1.0.16'],
        }

        // Check if agent definitions need updating
        let agentsNeedUpdate = false
        const existingAgentFiles = fs.existsSync(agentsDir)
          ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'))
          : []

        for (const file of templateFiles) {
          const src = path.join(templatesDir, file)
          const dest = path.join(agentsDir, file)
          if (!fs.existsSync(dest)) {
            agentsNeedUpdate = true
            break
          }
          const srcContent = fs.readFileSync(src, 'utf8')
          const destContent = fs.readFileSync(dest, 'utf8')
          if (srcContent !== destContent) {
            agentsNeedUpdate = true
            break
          }
        }

        // Check if opencode.json still has inline agent config (needs migration)
        const needsMigration = !!currentConfig.agent

        if (!agentsNeedUpdate && !needsMigration && !options.force) {
          console.log(chalk.green('✅ Already using the latest configuration!'))
          return
        }

        if (agentsNeedUpdate || needsMigration) {
          console.log(chalk.blue('\n🔄 Updates available:'))

          if (needsMigration) {
            console.log(
              chalk.cyan('  • Migrate agents from opencode.json to .opencode/agents/')
            )
          }

          if (agentsNeedUpdate) {
            console.log(chalk.cyan('  • Latest agent prompts and improvements'))
          }
        }

        if (options.force) {
          console.log(chalk.yellow('🔧 Force update requested'))
        }

        if (!options.yes) {
          console.log(
            chalk.blue(
              '\nThis will update your agent definitions and OpenCode configuration.'
            )
          )

          const hasGitRepo = hasGit()
          if (!hasGitRepo) {
            console.log(
              chalk.yellow(
                '⚠️  No .git repository detected - backup will be created'
              )
            )
          } else {
            console.log(
              chalk.green('✓ Git repository detected - changes are tracked')
            )
          }
        }

        if (
          await confirm('\nProceed with update? (Y/n): ', options.yes)
        ) {
          try {
            let backupPath: string | null = null

            if (!hasGit()) {
              backupPath = `${configPath}.backup.${Date.now()}`
              await writeFile(
                backupPath,
                JSON.stringify(currentConfig, null, 2)
              )
              console.log(
                chalk.green(
                  `✓ Backed up current config to ${path.basename(backupPath)}`
                )
              )
            }

            // Remove inline agent section from opencode.json if present
            if (currentConfig.agent) {
              delete currentConfig.agent
              await writeFile(configPath, JSON.stringify(currentConfig, null, 2))
              console.log(
                chalk.green('✓ Removed inline agent config from opencode.json')
              )
            }

            // Sync agent markdown files from templates
            fs.mkdirSync(agentsDir, { recursive: true })
            let updatedCount = 0
            for (const file of templateFiles) {
              const src = path.join(templatesDir, file)
              const dest = path.join(agentsDir, file)
              const agentName = path.basename(file, '.md')

              if (
                !fs.existsSync(dest) ||
                fs.readFileSync(src, 'utf8') !== fs.readFileSync(dest, 'utf8')
              ) {
                fs.copyFileSync(src, dest)
                updatedCount++
                console.log(chalk.cyan(`  • Updated agent: ${agentName}`))
              }
            }

            if (updatedCount > 0) {
              console.log(
                chalk.green(`✓ Updated ${updatedCount} agent definition(s)`)
              )
            }

            // Update AGENTS.md if it doesn't exist
            const agentsMdPath = path.join(process.cwd(), 'AGENTS.md')
            if (!fs.existsSync(agentsMdPath)) {
              const agentsMdContent = `# Berget Code Agents

This document describes the specialized agents available in this project for use with OpenCode.

Agents are defined as markdown files in \`.opencode/agents/\` with YAML frontmatter.

## Available Agents

### Primary Agents

| Agent | Description | Temperature |
|-------|-------------|-------------|
| fullstack | Router/coordinator for full-stack development | 0.3 |
| frontend | Scandinavian, type-safe UIs with React, Tailwind, Shadcn | 0.4 |
| backend | Functional, modular Koa + TypeScript services | 0.3 |
| devops | Declarative GitOps infra with FluxCD, Kustomize, Helm | 0.3 |
| app | Expo + React Native apps; props-first, offline-aware | 0.4 |

### Subagents

| Agent | Description | Temperature |
|-------|-------------|-------------|
| security | Security specialist for pentesting and OWASP compliance | 0.2 |
| quality | QA specialist for testing, building, and PR management | 0.1 |

## Usage

- **Tab** key to cycle between primary agents
- **@mention** to invoke subagents (e.g. \`@security review this code\`)
- \`/fullstack\`, \`/frontend\`, \`/backend\`, \`/devops\`, \`/app\` to switch agents

## Routing Rules

The fullstack agent automatically routes tasks based on file patterns:

- \`/apps/frontend\` or \`.tsx\` files → frontend
- \`/apps/app\` or Expo/React Native → app
- \`/infra\`, \`/k8s\`, FluxCD, Helm → devops
- \`/services\`, Koa routers → backend

## Customization

Edit the markdown files in \`.opencode/agents/\` to customize agent behavior.
See https://opencode.ai/docs/agents/ for available options.

---

*Updated by berget code update*
`

              await writeFile(agentsMdPath, agentsMdContent)
              console.log(chalk.green('✓ Created AGENTS.md documentation'))
            }

            console.log(chalk.green('\n✅ Update completed successfully!'))
          } catch (error) {
            console.error(chalk.red('Failed to update configuration:'))
            handleError('Update failed', error)

            try {
              await writeFile(
                configPath,
                JSON.stringify(currentConfig, null, 2)
              )
              console.log(
                chalk.yellow('📁 Restored original configuration from backup')
              )
            } catch (restoreError) {
              console.error(chalk.red('Failed to restore backup:'))
            }
          }
        } else {
          console.log(chalk.yellow('Update cancelled.'))
        }
      } catch (error) {
        handleError('Failed to update OpenCode configuration', error)
      }
    })
}

