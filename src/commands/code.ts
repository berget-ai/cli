import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'readline'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import { ApiKeyService, CreateApiKeyOptions } from '../services/api-key-service'
import { AuthService } from '../services/auth-service'
import { handleError } from '../utils/error-handler'
import * as fs from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { updateEnvFile } from '../utils/env-manager'
import { createAuthenticatedClient } from '../client'
import { 
  getConfigLoader, 
  getModelConfig, 
  getProviderModels,
  type OpenCodeConfig,
  type AgentConfig 
} from '../utils/config-loader'

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
 * Merge opencode configurations using chat completions API
 */
async function mergeConfigurations(
  currentConfig: any,
  latestConfig: any,
): Promise<any> {
  try {
    const client = createAuthenticatedClient()
    const modelConfig = getModelConfig()

    console.log(chalk.blue('🤖 Using AI to merge configurations...'))

    const mergePrompt = `You are a configuration merge specialist. Merge these two OpenCode configurations:

CURRENT CONFIG (user's customizations):
${JSON.stringify(currentConfig, null, 2)}

LATEST CONFIG (new updates):
${JSON.stringify(latestConfig, null, 2)}

Merge rules:
1. Preserve ALL user customizations from current config
2. Add ALL new features and improvements from latest config  
3. For conflicts, prefer user's customizations but add new latest features
4. Maintain valid JSON structure
5. Keep the merged configuration complete and functional

Return ONLY the merged JSON configuration, no explanations.`

    const response = await client.POST('/v1/chat/completions', {
      body: {
        model: modelConfig.primary,
        messages: [
          {
            role: 'user',
            content: mergePrompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      },
    })

    if (response.error) {
      console.warn(chalk.yellow('⚠️  AI merge failed, using fallback merge'))
      return fallbackMerge(currentConfig, latestConfig)
    }

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) {
      console.warn(chalk.yellow('⚠️  No AI response, using fallback merge'))
      return fallbackMerge(currentConfig, latestConfig)
    }

    try {
      const mergedConfig = JSON.parse(content.trim())
      console.log(chalk.green('✓ AI merge completed successfully'))
      return mergedConfig
    } catch (parseError) {
      console.warn(
        chalk.yellow('⚠️  AI response invalid, using fallback merge'),
      )
      return fallbackMerge(currentConfig, latestConfig)
    }
  } catch (error) {
    console.warn(chalk.yellow('⚠️  AI merge unavailable, using fallback merge'))
    return fallbackMerge(currentConfig, latestConfig)
  }
}

/**
 * Fallback merge logic when AI merge is unavailable
 */
function fallbackMerge(currentConfig: any, latestConfig: any): any {
  console.log(chalk.blue('🔀 Using fallback merge logic...'))

  const merged = { ...latestConfig }

  // Preserve user customizations
  if (currentConfig.theme && currentConfig.theme !== latestConfig.theme) {
    merged.theme = currentConfig.theme
  }

  if (currentConfig.share && currentConfig.share !== latestConfig.share) {
    merged.share = currentConfig.share
  }

  // Merge custom agents while preserving new ones
  if (currentConfig.agent) {
    merged.agent = { ...latestConfig.agent }

    // Add any custom agents from current config
    Object.keys(currentConfig.agent).forEach((agentName) => {
      if (!latestConfig.agent[agentName]) {
        merged.agent[agentName] = currentConfig.agent[agentName]
        console.log(chalk.cyan(`  • Preserved custom agent: ${agentName}`))
      }
    })
  }

  // Merge custom commands while preserving new ones
  if (currentConfig.commands) {
    merged.commands = { ...latestConfig.commands }

    Object.keys(currentConfig.commands).forEach((commandName) => {
      if (!latestConfig.commands[commandName]) {
        merged.commands[commandName] = currentConfig.commands[commandName]
        console.log(chalk.cyan(`  • Preserved custom command: ${commandName}`))
      }
    })
  }

  // Preserve custom provider settings if user has modified them
  if (currentConfig.provider) {
    merged.provider = { ...latestConfig.provider }

    // Deep merge provider settings
    Object.keys(currentConfig.provider).forEach((providerName) => {
      if (merged.provider[providerName]) {
        merged.provider[providerName] = {
          ...merged.provider[providerName],
          ...currentConfig.provider[providerName],
        }
      } else {
        merged.provider[providerName] = currentConfig.provider[providerName]
      }
    })
  }

  return merged
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
          answer === '',
      )
    })
  })
}

/**
 * Helper function to get user choice from options
 */
async function askChoice(
  question: string,
  options: string[],
  defaultChoice?: string,
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
        option.toLowerCase().startsWith(trimmed),
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
async function getInput(
  question: string,
  defaultValue: string,
  autoYes = false,
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
 * Load the latest agent configuration from opencode.json
 */
async function loadLatestAgentConfig(): Promise<any> {
  try {
    const configPath = path.join(__dirname, '../../opencode.json')
    const configContent = await readFile(configPath, 'utf8')
    const config = JSON.parse(configContent)
    return config.agent || {}
  } catch (error) {
    console.warn(chalk.yellow('⚠️  Could not load latest agent config, using fallback'))
    return {}
  }
}

/**
 * Check if opencode is installed
 */
function checkOpencodeInstalled(): Promise<boolean> {
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
async function installOpencode(): Promise<boolean> {
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
        chalk.yellow('Installation completed but opencode command not found.'),
      )
      console.log(
        chalk.yellow(
          'You may need to restart your terminal or check your PATH.',
        ),
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
async function ensureOpencodeInstalled(autoYes = false): Promise<boolean> {
  let opencodeInstalled = await checkOpencodeInstalled()
  if (!opencodeInstalled) {
    if (!autoYes) {
      console.log(chalk.red('OpenCode is not installed.'))
      console.log(
        chalk.blue('OpenCode is required for the AI coding assistant.'),
      )
    }

    if (
      await confirm(
        'Would you like to install OpenCode automatically? (Y/n): ',
        autoYes,
      )
    ) {
      opencodeInstalled = await installOpencode()
    } else {
      if (!autoYes) {
        console.log(chalk.blue('\nInstallation cancelled.'))
        console.log(
          chalk.blue(
            'To install manually: curl -fsSL https://opencode.ai/install | bash',
          ),
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
      'Automatically answer yes to all prompts (for automation)',
    )
    .action(async (options) => {
      try {
        const projectName = options.name || getProjectName()
        const configPath = path.join(process.cwd(), 'opencode.json')

        // Check if already initialized
        if (fs.existsSync(configPath) && !options.force) {
          if (!options.yes) {
            console.log(
              chalk.yellow('Project already initialized for OpenCode.'),
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

        // Check if we have an API key in environment first
        if (process.env.BERGET_API_KEY) {
          console.log(chalk.blue('🔑 Using BERGET_API_KEY from environment - no authentication required'))
        } else {
          // Only require authentication if we don't have an API key
          try {
            const authService = AuthService.getInstance()
            // This will throw if not authenticated
            await authService.whoami()
          } catch (error) {
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
            return
          }
        }

        console.log(
          chalk.cyan(`Initializing OpenCode for project: ${projectName}`),
        )

        // Handle API key selection or creation
        let apiKey: string
        let keyName: string

        try {
          const apiKeyService = ApiKeyService.getInstance()

          // Check for environment variable first (regardless of automation mode)
          if (process.env.BERGET_API_KEY) {
            console.log(chalk.blue('🔑 Using BERGET_API_KEY from environment'))
            apiKey = process.env.BERGET_API_KEY
            keyName = `env-key-${projectName}`
          } else {
            // List existing API keys
            if (!options.yes) {
              console.log(chalk.blue('\n📋 Checking existing API keys...'))
            }
            const existingKeys = await apiKeyService.list()

            if (existingKeys.length > 0 && !options.yes) {
              console.log(chalk.blue('Found existing API keys:'))
              console.log(chalk.dim('─'.repeat(60)))
              existingKeys.forEach((key, index) => {
                console.log(
                  `${chalk.cyan((index + 1).toString())}. ${chalk.bold(key.name)} (${key.prefix}...)`,
                )
                console.log(
                  chalk.dim(
                    `   Created: ${new Date(key.created).toLocaleDateString('sv-SE')}`,
                  ),
                )
                console.log(
                  chalk.dim(
                    `   Last used: ${key.lastUsed ? new Date(key.lastUsed).toLocaleDateString('sv-SE') : 'Never'}`,
                  ),
                )
                if (index < existingKeys.length - 1) console.log()
              })
              console.log(chalk.dim('─'.repeat(60)))
              console.log(
                chalk.cyan(`${existingKeys.length + 1}. Create a new API key`),
              )

              // Get user choice
              const choice = await new Promise<string>((resolve) => {
                const rl = readline.createInterface({
                  input: process.stdin,
                  output: process.stdout,
                })
                rl.question(
                  chalk.blue(
                    '\nSelect an option (1-' +
                      (existingKeys.length + 1) +
                      '): ',
                  ),
                  (answer) => {
                    rl.close()
                    resolve(answer.trim())
                  },
                )
              })

              const choiceIndex = parseInt(choice) - 1

              if (choiceIndex >= 0 && choiceIndex < existingKeys.length) {
                // Use existing key
                const selectedKey = existingKeys[choiceIndex]
                keyName = selectedKey.name

                // We need to rotate the key to get the actual key value
                console.log(
                  chalk.yellow(
                    `\n🔄 Rotating API key "${selectedKey.name}" to get the key value...`,
                  ),
                )

                if (
                  await confirm(
                    chalk.yellow(
                      'This will invalidate the current key. Continue? (Y/n): ',
                    ),
                    options.yes,
                  )
                ) {
                  const rotatedKey = await apiKeyService.rotate(
                    selectedKey.id.toString(),
                  )
                  apiKey = rotatedKey.key
                  console.log(chalk.green(`✓ API key rotated successfully`))
                } else {
                  console.log(
                    chalk.yellow(
                      'Cancelled. Please select a different option or create a new key.',
                    ),
                  )
                  return
                }
              } else if (choiceIndex === existingKeys.length) {
                // Create new key
                console.log(chalk.blue('\n🔑 Creating new API key...'))

                const defaultKeyName = `opencode-${projectName}-${Date.now()}`
                const customName = await getInput(
                  chalk.blue(`Enter key name (default: ${defaultKeyName}): `),
                  defaultKeyName,
                  options.yes,
                )

                keyName = customName
                const createOptions: CreateApiKeyOptions = { name: keyName }
                const keyData = await apiKeyService.create(createOptions)
                apiKey = keyData.key
                console.log(chalk.green(`✓ Created new API key: ${keyName}`))
              } else {
                console.log(chalk.red('Invalid selection.'))
                return
              }
            } else {
              // No existing keys or automation mode - create new one
              if (!options.yes) {
                console.log(chalk.yellow('No existing API keys found.'))
                console.log(chalk.blue('Creating a new API key...'))
              }

              const defaultKeyName = `opencode-${projectName}-${Date.now()}`
              const customName = await getInput(
                chalk.blue(`Enter key name (default: ${defaultKeyName}): `),
                defaultKeyName,
                options.yes,
              )

              keyName = customName
              const createOptions: CreateApiKeyOptions = { name: keyName }
              const keyData = await apiKeyService.create(createOptions)
              apiKey = keyData.key
              console.log(chalk.green(`✓ Created new API key: ${keyName}`))
            }
          }
        } catch (error) {
          if (process.env.BERGET_API_KEY) {
            console.log(chalk.yellow('⚠️  Could not verify API key with Berget API, but continuing with environment key'))
            console.log(chalk.dim('This might be due to network issues or an invalid key'))
          } else {
            console.error(chalk.red('❌ Failed to handle API keys:'))
            console.log(chalk.blue('This could be due to:'))
            console.log(chalk.dim('  • Network connectivity issues'))
            console.log(chalk.dim('  • Invalid authentication credentials'))
            console.log(chalk.dim('  • API service temporarily unavailable'))
            console.log('')
            console.log(chalk.blue('Try using an API key directly:'))
            console.log(chalk.cyan('  export BERGET_API_KEY=your_api_key_here'))
            console.log(chalk.cyan(`  berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT} --yes`))
            handleError('API key operation failed', error)
          }
          return
        }

        // Prepare .env file path for safe update
        const envPath = path.join(process.cwd(), '.env')

        // Load latest agent configuration to ensure consistency
        const latestAgentConfig = await loadLatestAgentConfig()

        // Create opencode.json config with optimized agent-based format
        const config = {
          $schema: 'https://opencode.ai/config.json',
          username: 'berget-code',
          theme: 'berget-dark',
          share: 'manual',
          autoupdate: true,
          model: MODEL_CONFIG.AGENT_MODELS.primary,
          small_model: MODEL_CONFIG.AGENT_MODELS.small,
          agent: {
            fullstack: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.3,
              top_p: 0.9,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
              description:
                'Router/coordinator agent for full-stack development with schema-driven architecture',
              prompt:
                'Voice: Scandinavian calm—precise, concise, confident; no fluff. You are Berget Code Fullstack agent. Act as a router and coordinator in a monorepo. Bottom-up schema: database → OpenAPI → generated types. Top-down types: API → UI → components. Use openapi-fetch and Zod at every boundary; compile-time errors are desired when contracts change. Routing rules: if task/paths match /apps/frontend or React (.tsx) → use frontend; if /apps/app or Expo/React Native → app; if /infra, /k8s, flux-system, kustomization.yaml, Helm values → devops; if /services, Koa routers, services/adapters/domain → backend. If ambiguous, remain fullstack and outline the end-to-end plan, then delegate subtasks to the right persona. Security: validate inputs; secrets via FluxCD SOPS/Sealed Secrets. Documentation is generated from code—never duplicated. CRITICAL: When all implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
            },
            frontend: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.4,
              top_p: 0.9,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'deny', webfetch: 'allow' },
              note: 'Bash access is denied for frontend persona to prevent shell command execution in UI environments. This restriction enforces security and architectural boundaries.',
              description:
                'Builds Scandinavian, type-safe UIs with React, Tailwind, Shadcn.',
              prompt:
                'You are Berget Code Frontend agent. Voice: Scandinavian calm—precise, concise, confident. React 18 + TypeScript. Tailwind + Shadcn UI only via the design system (index.css, tailwind.config.ts). Use semantic tokens for color/spacing/typography/motion; never ad-hoc classes or inline colors. Components are pure and responsive; props-first data; minimal global state (Zustand/Jotai). Accessibility and keyboard navigation mandatory. Mock data only at init under /data via typed hooks (e.g., useProducts() reading /data/products.json). Design: minimal, balanced, quiet motion. CRITICAL: When all frontend implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
            },
            backend: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.3,
              top_p: 0.9,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
              description:
                'Functional, modular Koa + TypeScript services; schema-first with code quality focus.',
              prompt:
                'You are Berget Code Backend agent. Voice: Scandinavian calm—precise, concise, confident. TypeScript + Koa. Prefer many small pure functions; avoid big try/catch blocks. Routes thin; logic in services/adapters/domain. Validate with Zod; auto-generate OpenAPI. Adapters isolate external systems; domain never depends on framework. Test with supertest; idempotent and stateless by default. Each microservice emits an OpenAPI contract; changes propagate upward to types. Code Quality & Refactoring Principles: Apply Single Responsibility Principle, fail fast with explicit errors, eliminate code duplication, remove nested complexity, use descriptive error codes, keep functions under 30 lines. Always leave code cleaner and more readable than you found it. CRITICAL: When all backend implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
            },
            // Use centralized devops configuration with Helm guidelines
            devops: latestAgentConfig.devops || {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.3,
              top_p: 0.8,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
              description:
                'Declarative GitOps infra with FluxCD, Kustomize, Helm, operators.',
              prompt:
                'You are Berget Code DevOps agent. Voice: Scandinavian calm—precise, concise, confident. Start simple: k8s/{deployment,service,ingress}. Add FluxCD sync to repo and image automation. Use Kustomize bases/overlays (staging, production). Add dependencies via Helm from upstream sources; prefer native operators when available (CloudNativePG, cert-manager, external-dns). SemVer with -rc tags keeps CI environments current. Observability with Prometheus/Grafana. No manual kubectl in production—Git is the source of truth.',
            },
            app: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.4,
              top_p: 0.9,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'deny', webfetch: 'allow' },
              note: 'Bash access is denied for app persona to prevent shell command execution in mobile/Expo environments. This restriction enforces security and architectural boundaries.',
              description:
                'Expo + React Native apps; props-first, offline-aware, shared tokens.',
              prompt:
                'You are Berget Code App agent. Voice: Scandinavian calm—precise, concise, confident. Expo + React Native + TypeScript. Structure by components/hooks/services/navigation. Components are pure; data via props; refactor shared logic into hooks/stores. Share tokens with frontend. Mock data in /data via typed hooks; later replace with live APIs. Offline via SQLite/MMKV; notifications via Expo. Request permissions only when needed. Subtle, meaningful motion; light/dark parity.',
            },
            security: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.2,
              top_p: 0.8,
              mode: 'subagent',
              permission: { edit: 'deny', bash: 'allow', webfetch: 'allow' },
              description:
                'Security specialist for pentesting, OWASP compliance, and vulnerability assessments.',
              prompt:
                'Voice: Scandinavian calm—precise, concise, confident. You are Berget Code Security agent. Expert in application security, penetration testing, and OWASP standards. Core responsibilities: Conduct security assessments and penetration tests, Validate OWASP Top 10 compliance, Review code for security vulnerabilities, Implement security headers and Content Security Policy (CSP), Audit API security, Check for sensitive data exposure, Validate input sanitization and output encoding, Assess dependency security and supply chain risks. Tools and techniques: OWASP ZAP, Burp Suite, security linters, dependency scanners, manual code review. Always provide specific, actionable security recommendations with priority levels.',
            },
            quality: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.1,
              top_p: 0.9,
              mode: 'subagent',
              permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
              description:
                'Quality assurance specialist for testing, building, and PR management.',
              prompt:
                'Voice: Scandinavian calm—precise, concise, confident. You are Berget Code Quality agent. Specialist in code quality assurance, testing, building, and pull request management.\n\nCore responsibilities:\n  - Run comprehensive test suites (npm test, npm run test, jest, vitest)\n  - Execute build processes (npm run build, webpack, vite, tsc)\n  - Create and manage pull requests with proper descriptions\n  - Monitor GitHub for Copilot/reviewer comments\n  - Ensure code quality standards are met\n  - Validate linting and formatting (npm run lint, prettier)\n  - Check test coverage and performance benchmarks\n  - Handle CI/CD pipeline validation\n\nCommon CLI commands:\n  - npm test or npm run test (run test suite)\n  - npm run build (build project)\n  - npm run lint (run linting)\n  - npm run format (format code)\n  - npm run test:coverage (check coverage)\n  - gh pr create (create pull request)\n  - gh pr view --comments (check PR comments)\n  - git add . && git commit -m "message" && git push (commit and push)\n\nPR Workflow:\n  1. Ensure all tests pass: npm test\n  2. Build successfully: npm run build\n  3. Create/update PR with clear description\n  4. Monitor for reviewer comments\n  5. Address feedback promptly\n  6. Update PR with fixes\n  7. Ensure CI checks pass\n\nAlways provide specific command examples and wait for processes to complete before proceeding.',
            },
          },
          command: {
            fullstack: {
              description: 'Switch to Fullstack (router)',
              template: '{{input}}',
              agent: 'fullstack',
            },
            route: {
              description:
                'Let Fullstack auto-route to the right persona based on files/intent',
              template: 'ROUTE {{input}}',
              agent: 'fullstack',
              subtask: true,
            },
            frontend: {
              description: 'Switch to Frontend persona',
              template: '{{input}}',
              agent: 'frontend',
            },
            backend: {
              description: 'Switch to Backend persona',
              template: '{{input}}',
              agent: 'backend',
            },
            devops: {
              description: 'Switch to DevOps persona',
              template: '{{input}}',
              agent: 'devops',
            },
            app: {
              description: 'Switch to App persona',
              template: '{{input}}',
              agent: 'app',
            },
            quality: {
              description:
                'Switch to Quality agent for testing, building, and PR management',
              template: '{{input}}',
              agent: 'quality',
            },
          },
          watcher: {
            ignore: ['node_modules', 'dist', '.git', 'coverage'],
          },
          provider: {
            berget: {
              npm: '@ai-sdk/openai-compatible',
              name: 'Berget AI',
              options: { 
                baseURL: 'https://api.berget.ai/v1',
                apiKey: '{env:BERGET_API_KEY}',
              },
              models: MODEL_CONFIG.PROVIDER_MODELS,
            },
          },
        }

        // Ask for permission to create config files
        if (!options.yes) {
          console.log(chalk.blue('\nAbout to create configuration files:'))
          console.log(chalk.dim(`Config: ${configPath}`))
          console.log(chalk.dim(`Environment: ${envPath}`))
          console.log(
            chalk.dim(
              `Documentation: ${path.join(process.cwd(), 'AGENTS.md')} (if not exists)`,
            ),
          )
          console.log(
            chalk.dim(
              `Environment: ${path.join(process.cwd(), '.env')} will be updated`,
            ),
          )
          console.log(
            chalk.dim('This will configure OpenCode to use Berget AI models.'),
          )
          console.log(chalk.cyan('\n💡 Benefits:'))
          console.log(
            chalk.cyan(
              '  • API key stored separately in .env file (not committed to Git)',
            ),
          )
          console.log(
            chalk.cyan('  • Easy cost separation per project/customer'),
          )
          console.log(
            chalk.cyan('  • Secure key management with environment variables'),
          )
          console.log(
            chalk.cyan(
              "  • Project-specific agent documentation (won't overwrite existing)",
            ),
          )
        }

        if (
          await confirm('\nCreate configuration files? (Y/n): ', options.yes)
        ) {
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
            console.log(chalk.green(`✓ Created opencode.json`))
            console.log(chalk.dim(`  Model: ${config.model}`))
            console.log(chalk.dim(`  Small Model: ${config.small_model}`))
            console.log(chalk.dim(`  Theme: ${config.theme}`))
            console.log(
              chalk.dim(`  API Key: Stored in .env as BERGET_API_KEY`),
            )

            // Create AGENTS.md documentation only if it doesn't exist
            const agentsMdPath = path.join(process.cwd(), 'AGENTS.md')
            if (!fs.existsSync(agentsMdPath)) {
              const agentsMdContent = `# Berget Code Agents

This document describes the specialized agents available in this project for use with OpenCode.

## Available Agents

### Primary Agents

#### fullstack
Router/coordinator agent for full-stack development with schema-driven architecture. Handles routing between different personas based on file paths and task requirements.

**Use when:**
- Working across multiple parts of a monorepo
- Need to coordinate between frontend, backend, devops, and app
- Starting new projects and need to determine tech stack

**Key features:**
- Schema-driven development (database → OpenAPI → types)
- Automatic routing to appropriate persona
- Tech stack discovery and recommendations

#### frontend
Builds Scandinavian, type-safe UIs with React, Tailwind, and Shadcn.

**Use when:**
- Working with React components (.tsx files)
- Frontend development in /apps/frontend
- UI/UX implementation

**Key features:**
- Design system integration
- Semantic tokens and accessibility
- Props-first component architecture

#### backend
Functional, modular Koa + TypeScript services with schema-first approach and code quality focus.

**Use when:**
- Working with Koa routers and services
- Backend development in /services
- API development and database work

**Key features:**
- Zod validation and OpenAPI generation
- Code quality and refactoring principles
- PR workflow integration

#### devops
Declarative GitOps infrastructure with FluxCD, Kustomize, Helm, and operators.

**Use when:**
- Working with Kubernetes manifests
- Infrastructure in /infra or /k8s
- CI/CD and deployment configurations

**Key features:**
- GitOps workflows
- Operator-first approach
- SemVer with release candidates

**Helm Values Configuration Process:**
1. Documentation First Approach: Always fetch official documentation from Artifact Hub/GitHub for the specific chart version before writing values. Search Artifact Hub for exact chart version documentation, check the chart's GitHub repository for official docs and examples, verify the exact version being used in the deployment.
2. Validation Requirements: Check for available validation schemas before committing YAML files. Use Helm's built-in validation tools (helm lint, helm template). Validate against JSON schema if available for the chart. Ensure YAML syntax correctness with linters.
3. Standard Workflow: Identify chart name and exact version. Fetch official documentation from Artifact Hub/GitHub. Check for available schemas and validation tools. Write values according to official documentation. Validate against schema (if available). Test with helm template or helm lint. Commit validated YAML files.
4. Quality Assurance: Never commit unvalidated Helm values. Use helm dependency update when adding new charts. Test rendering with helm template --dry-run before deployment. Document any custom values with comments referencing official docs.

#### app
Expo + React Native applications with props-first architecture and offline awareness.

**Use when:**
- Mobile app development with Expo
- React Native projects in /apps/app
- Cross-platform mobile development

**Key features:**
- Shared design tokens with frontend
- Offline-first architecture
- Expo integration

### Subagents

#### security
Security specialist for penetration testing, OWASP compliance, and vulnerability assessments.

**Use when:**
- Need security review of code changes
- OWASP Top 10 compliance checks
- Vulnerability assessments

**Key features:**
- OWASP standards compliance
- Security best practices
- Actionable remediation strategies

#### quality
Quality assurance specialist for testing, building, and PR management.

**Use when:**
- Need to run test suites and build processes
- Creating or updating pull requests
- Monitoring GitHub for reviewer comments
- Ensuring code quality standards

**Key features:**
- Comprehensive testing and building workflows
- PR creation and management
- GitHub integration for reviewer feedback
- CLI command expertise for quality assurance

## Usage

### Switching Agents
Use the \`<tab>\` key to cycle through primary agents during a session.

### Manual Agent Selection
Use commands to switch to specific agents:
- \`/fullstack\` - Switch to Fullstack agent
- \`/frontend\` - Switch to Frontend agent  
- \`/backend\` - Switch to Backend agent
- \`/devops\` - Switch to DevOps agent
- \`/app\` - Switch to App agent
- \`/quality\` - Switch to Quality agent for testing and PR management

### Using Subagents
Mention subagents with \`@\` symbol:
- \`@security review this authentication implementation\`
- \`@quality run tests and create PR for these changes\`

## Routing Rules

The fullstack agent automatically routes tasks based on file patterns:

- \`/apps/frontend\` or \`.tsx\` files → frontend
- \`/apps/app\` or Expo/React Native → app  
- \`/infra\`, \`/k8s\`, FluxCD, Helm → devops
- \`/services\`, Koa routers → backend

## Configuration

All agents are configured in \`opencode.json\` with:
- Specialized prompts and temperature settings
- Appropriate tool permissions
- Model optimizations for their specific tasks

## Environment Setup

Configure \`.env\` with your API key:
\`\`\`
BERGET_API_KEY=your_api_key_here
\`\`\`

## Workflow

All agents follow these principles:
- Never work directly in main branch
- Follow branch strategy and commit conventions
- Create PRs for new functionality
- Run tests before committing
- Address reviewer feedback promptly

---

*Generated by berget code init for ${projectName}*
`

              await writeFile(agentsMdPath, agentsMdContent)
              console.log(chalk.green(`✓ Created AGENTS.md`))
              console.log(
                chalk.dim(`  Documentation for available agents and usage`),
              )
            } else {
              console.log(
                chalk.yellow(`⚠ AGENTS.md already exists, skipping creation`),
              )
            }

            // Check if .gitignore exists and add .env if not already there
            const gitignorePath = path.join(process.cwd(), '.gitignore')
            let gitignoreContent = ''

            if (fs.existsSync(gitignorePath)) {
              gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
            }

            if (!gitignoreContent.includes('.env')) {
              gitignoreContent +=
                (gitignoreContent.endsWith('\n') ? '' : '\n') + '.env\n'
              await writeFile(gitignorePath, gitignoreContent)
              console.log(chalk.green(`✓ Added .env to .gitignore`))
            }
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
        console.log(chalk.blue('Next steps:'))
        console.log(
          chalk.blue(`  berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.RUN}`),
        )
        console.log(chalk.blue('  Or run: opencode'))
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
      'Automatically answer yes to all prompts (for automation)',
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
              chalk.dim(`Loaded config for project: ${config.projectName}`),
            )
            console.log(
              chalk.dim(
                `Models: Analysis=${config.analysisModel}, Build=${config.buildModel}`,
              ),
            )
          } catch (error) {
            console.log(chalk.yellow('Warning: Failed to load opencode.json'))
          }
        }

        if (!config) {
          console.log(chalk.yellow('No project configuration found.'))
          console.log(
            chalk.blue(
              `Run ${chalk.bold(`berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`)} first.`,
            ),
          )
          return
        }

        // Set environment variables for opencode
        const env = { ...process.env }
        env.OPENCODE_API_KEY = config.apiKey

        // Prepare opencode command
        const opencodeArgs: string[] = []

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
      } catch (error) {
        handleError('Failed to run OpenCode', error)
      }
    })

  code
    .command(SUBCOMMANDS.CODE.UPDATE)
    .description('Update OpenCode and agents to latest versions')
    .option('-f, --force', 'Force update even if already latest')
    .option(
      '-y, --yes',
      'Automatically answer yes to all prompts (for automation)',
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
              `Run ${chalk.bold(`berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`)} first.`,
            ),
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
        console.log(chalk.dim(`  Model: ${currentConfig.model}`))
        console.log(chalk.dim(`  Theme: ${currentConfig.theme}`))
        console.log(
          chalk.dim(
            `  Agents: ${Object.keys(currentConfig.agent || {}).length} configured`,
          ),
        )

        // Load latest agent configuration to ensure consistency
        const latestAgentConfig = await loadLatestAgentConfig()

        // Create latest configuration with all improvements
        const latestConfig = {
          $schema: 'https://opencode.ai/config.json',
          username: 'berget-code',
          theme: 'berget-dark',
          share: 'manual',
          autoupdate: true,
          model: MODEL_CONFIG.AGENT_MODELS.primary,
          small_model: MODEL_CONFIG.AGENT_MODELS.small,
          agent: {
            fullstack: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.3,
              top_p: 0.9,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
              description:
                'Router/coordinator agent for full-stack development with schema-driven architecture',
              prompt:
                'Voice: Scandinavian calm—precise, concise, confident; no fluff. You are Berget Code Fullstack agent. Act as a router and coordinator in a monorepo. Bottom-up schema: database → OpenAPI → generated types. Top-down types: API → UI → components. Use openapi-fetch and Zod at every boundary; compile-time errors are desired when contracts change. Routing rules: if task/paths match /apps/frontend or React (.tsx) → use frontend; if /apps/app or Expo/React Native → app; if /infra, /k8s, flux-system, kustomization.yaml, Helm values → devops; if /services, Koa routers, services/adapters/domain → backend. If ambiguous, remain fullstack and outline the end-to-end plan, then delegate subtasks to the right persona. Security: validate inputs; secrets via FluxCD SOPS/Sealed Secrets. Documentation is generated from code—never duplicated. CRITICAL: When all implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
            },
            frontend: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.4,
              top_p: 0.9,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'deny', webfetch: 'allow' },
              note: 'Bash access is denied for frontend persona to prevent shell command execution in UI environments. This restriction enforces security and architectural boundaries.',
              description:
                'Builds Scandinavian, type-safe UIs with React, Tailwind, Shadcn.',
              prompt:
                'You are Berget Code Frontend agent. Voice: Scandinavian calm—precise, concise, confident. React 18 + TypeScript. Tailwind + Shadcn UI only via the design system (index.css, tailwind.config.ts). Use semantic tokens for color/spacing/typography/motion; never ad-hoc classes or inline colors. Components are pure and responsive; props-first data; minimal global state (Zustand/Jotai). Accessibility and keyboard navigation mandatory. Mock data only at init under /data via typed hooks (e.g., useProducts() reading /data/products.json). Design: minimal, balanced, quiet motion. CRITICAL: When all frontend implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
            },
            backend: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.3,
              top_p: 0.9,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
              description:
                'Functional, modular Koa + TypeScript services; schema-first with code quality focus.',
              prompt:
                'You are Berget Code Backend agent. Voice: Scandinavian calm—precise, concise, confident. TypeScript + Koa. Prefer many small pure functions; avoid big try/catch blocks. Routes thin; logic in services/adapters/domain. Validate with Zod; auto-generate OpenAPI. Adapters isolate external systems; domain never depends on framework. Test with supertest; idempotent and stateless by default. Each microservice emits an OpenAPI contract; changes propagate upward to types. Code Quality & Refactoring Principles: Apply Single Responsibility Principle, fail fast with explicit errors, eliminate code duplication, remove nested complexity, use descriptive error codes, keep functions under 30 lines. Always leave code cleaner and more readable than you found it. CRITICAL: When all backend implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
            },
            // Use centralized devops configuration with Helm guidelines
            devops: latestAgentConfig.devops || {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.3,
              top_p: 0.8,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
              description:
                'Declarative GitOps infra with FluxCD, Kustomize, Helm, operators.',
              prompt:
                'You are Berget Code DevOps agent. Voice: Scandinavian calm—precise, concise, confident. Start simple: k8s/{deployment,service,ingress}. Add FluxCD sync to repo and image automation. Use Kustomize bases/overlays (staging, production). Add dependencies via Helm from upstream sources; prefer native operators when available (CloudNativePG, cert-manager, external-dns). SemVer with -rc tags keeps CI environments current. Observability with Prometheus/Grafana. No manual kubectl in production—Git is the source of truth. For testing, building, and PR management, use @quality subagent.',
            },
            app: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.4,
              top_p: 0.9,
              mode: 'primary',
              permission: { edit: 'allow', bash: 'deny', webfetch: 'allow' },
              note: 'Bash access is denied for app persona to prevent shell command execution in mobile/Expo environments. This restriction enforces security and architectural boundaries.',
              description:
                'Expo + React Native apps; props-first, offline-aware, shared tokens.',
              prompt:
                'You are Berget Code App agent. Voice: Scandinavian calm—precise, concise, confident. Expo + React Native + TypeScript. Structure by components/hooks/services/navigation. Components are pure; data via props; refactor shared logic into hooks/stores. Share tokens with frontend. Mock data in /data via typed hooks; later replace with live APIs. Offline via SQLite/MMKV; notifications via Expo. Request permissions only when needed. Subtle, meaningful motion; light/dark parity. For testing, building, and PR management, use @quality subagent.',
            },
            security: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.2,
              top_p: 0.8,
              mode: 'subagent',
              permission: { edit: 'deny', bash: 'allow', webfetch: 'allow' },
              description:
                'Security specialist for pentesting, OWASP compliance, and vulnerability assessments.',
              prompt:
                'Voice: Scandinavian calm—precise, concise, confident. You are Berget Code Security agent. Expert in application security, penetration testing, and OWASP standards. Core responsibilities: Conduct security assessments and penetration tests, Validate OWASP Top 10 compliance, Review code for security vulnerabilities, Implement security headers and Content Security Policy (CSP), Audit API security, Check for sensitive data exposure, Validate input sanitization and output encoding, Assess dependency security and supply chain risks. Tools and techniques: OWASP ZAP, Burp Suite, security linters, dependency scanners, manual code review. Always provide specific, actionable security recommendations with priority levels. Workflow: Always follow branch_strategy and commit_convention from workflow section. Never work directly in main. Agent awareness: Review code from all personas (frontend, backend, app, devops). If implementation changes are needed, suggest <tab> to switch to appropriate persona after security assessment.',
            },
            quality: {
              model: MODEL_CONFIG.AGENT_MODELS.primary,
              temperature: 0.1,
              top_p: 0.9,
              mode: 'subagent',
              permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
              description:
                'Quality assurance specialist for testing, building, and complete PR management.',
              prompt:
                'Voice: Scandinavian calm—precise, concise, confident. You are Berget Code Quality agent. Specialist in code quality assurance, testing, building, and complete pull request lifecycle management.\n\nCore responsibilities:\n  - Run comprehensive test suites (npm test, npm run test, jest, vitest)\n  - Execute build processes (npm run build, webpack, vite, tsc)\n  - Create and manage pull requests with proper descriptions\n  - Handle merge conflicts and keep main updated\n  - Monitor GitHub for reviewer comments and address them\n  - Ensure code quality standards are met\n  - Validate linting and formatting (npm run lint, prettier)\n  - Check test coverage and performance benchmarks\n  - Handle CI/CD pipeline validation\n\nComplete PR Workflow:\n  1. Ensure all tests pass: npm test\n  2. Build successfully: npm run build\n  3. Commit all changes with proper message\n  4. Push to feature branch\n  5. Update main branch and handle merge conflicts\n  6. Create or update PR with comprehensive description\n  7. Monitor for reviewer comments\n  8. Address feedback and push updates\n  9. Always provide PR URL for user review\n\nEssential CLI commands:\n  - npm test or npm run test (run test suite)\n  - npm run build (build project)\n  - npm run lint (run linting)\n  - npm run format (format code)\n  - npm run test:coverage (check coverage)\n  - git add . && git commit -m "message" && git push (commit and push)\n  - git checkout main && git pull origin main (update main)\n  - git checkout feature-branch && git merge main (handle conflicts)\n  - gh pr create --title "title" --body "body" (create PR)\n  - gh pr view --comments (check PR comments)\n  - gh pr edit --title "title" --body "body" (update PR)\n\nPR Creation Process:\n  - Always include clear summary of changes\n  - List technical details and improvements\n  - Include testing and validation results\n  - Add any breaking changes or migration notes\n  - Provide PR URL immediately after creation\n\nMerge Conflict Resolution:\n  - Always update main before creating/updating PR\n  - Handle conflicts automatically when possible\n  - If conflicts require human input, clearly explain what\'s needed\n  - Re-run tests after conflict resolution\n  - Ensure CI checks pass before finalizing\n\nReviewer Comment Handling:\n  - Monitor PR for new comments regularly\n  - Address each comment specifically\n  - Push fixes and update PR accordingly\n  - Always provide updated PR URL after changes\n  - Continue monitoring until all feedback is addressed\n\nCRITICAL: When invoked by other agents (@quality), you MUST:\n  - Complete all testing and building tasks\n  - Handle entire PR creation/update process\n  - Provide PR URL at the end\n  - Ensure main branch is properly merged\n  - Handle any merge conflicts automatically\n\nAlways provide specific command examples and wait for processes to complete before proceeding.\nWorkflow: Always follow branch_strategy and commit_convention from workflow section. Never work directly in main.\nAgent awareness: Can be invoked by any primary agent (@quality) for complete testing, building, and PR management. You are the final step before user review - ensure everything is perfect.',
            },
          },
          command: {
            fullstack: {
              description: 'Switch to Fullstack (router)',
              template: '{{input}}',
              agent: 'fullstack',
            },
            route: {
              description:
                'Let Fullstack auto-route to the right persona based on files/intent',
              template: 'ROUTE {{input}}',
              agent: 'fullstack',
              subtask: true,
            },
            frontend: {
              description: 'Switch to Frontend persona',
              template: '{{input}}',
              agent: 'frontend',
            },
            backend: {
              description: 'Switch to Backend persona',
              template: '{{input}}',
              agent: 'backend',
            },
            devops: {
              description: 'Switch to DevOps persona',
              template: '{{input}}',
              agent: 'devops',
            },
            app: {
              description: 'Switch to App persona',
              template: '{{input}}',
              agent: 'app',
            },
            security: {
              description:
                'Switch to Security persona for pentesting and OWASP compliance',
              template: '{{input}}',
              agent: 'security',
            },
            quality: {
              description:
                'Switch to Quality agent for testing, building, and PR management',
              template: '{{input}}',
              agent: 'quality',
            },
          },
          watcher: {
            ignore: ['node_modules', 'dist', '.git', 'coverage'],
          },
          provider: {
            berget: {
              npm: '@ai-sdk/openai-compatible',
              name: 'Berget AI',
              options: {
                baseURL: 'https://api.berget.ai/v1',
                apiKey: '{env:BERGET_API_KEY}',
              },
              models: MODEL_CONFIG.PROVIDER_MODELS,
            },
          },
        }

        // Check if update is needed
        const needsUpdate =
          JSON.stringify(currentConfig) !== JSON.stringify(latestConfig)

        if (!needsUpdate && !options.force) {
          console.log(chalk.green('✅ Already using the latest configuration!'))
          return
        }

        if (needsUpdate) {
          console.log(chalk.blue('\n🔄 Updates available:'))

          // Compare agents
          const currentAgents = Object.keys(currentConfig.agent || {})
          const latestAgents = Object.keys(latestConfig.agent)
          const newAgents = latestAgents.filter(
            (agent) => !currentAgents.includes(agent),
          )

          if (newAgents.length > 0) {
            console.log(chalk.cyan(`  • New agents: ${newAgents.join(', ')}`))
          }

          // Check for quality agent specifically
          if (!currentConfig.agent?.quality && latestConfig.agent.quality) {
            console.log(
              chalk.cyan('  • Quality subagent for testing and PR management'),
            )
          }

          // Check for security subagent mode
          if (currentConfig.agent?.security?.mode !== 'subagent') {
            console.log(
              chalk.cyan(
                '  • Security agent converted to subagent (read-only)',
              ),
            )
          }

          // Check for GLM-4.6 optimizations
          if (
            !currentConfig.provider?.berget?.models?.[MODEL_CONFIG.AGENT_MODELS.primary.replace('berget/', '')]?.limit?.context
          ) {
            console.log(
              chalk.cyan('  • GLM-4.6 token limits and auto-compaction'),
            )
          }

          console.log(chalk.cyan('  • Latest agent prompts and improvements'))
        }

        if (options.force) {
          console.log(chalk.yellow('🔧 Force update requested'))
        }

        if (!options.yes) {
          console.log(
            chalk.blue(
              '\nThis will update your OpenCode configuration with the latest improvements.',
            ),
          )

          // Check if user has git for backup
          const hasGitRepo = hasGit()
          if (!hasGitRepo) {
            console.log(
              chalk.yellow(
                '⚠️  No .git repository detected - backup will be created',
              ),
            )
          } else {
            console.log(
              chalk.green('✓ Git repository detected - changes are tracked'),
            )
          }
        }

        // Ask user what they want to do
        console.log(chalk.blue('\nChoose update strategy:'))
        console.log(
          chalk.cyan(
            '1) Replace - Use latest configuration (your customizations will be lost)',
          ),
        )
        console.log(
          chalk.cyan(
            '2) Merge  - Combine latest updates with your customizations (recommended)',
          ),
        )

        let mergeChoice: 'replace' | 'merge' = 'merge'

        if (!options.yes) {
          const choice = await askChoice(
            '\nYour choice (1-2, default: 2): ',
            ['replace', 'merge'],
            'merge',
          )
          mergeChoice = choice as 'replace' | 'merge'
        }

        if (
          await confirm(`\nProceed with ${mergeChoice}? (Y/n): `, options.yes)
        ) {
          try {
            let finalConfig: any
            let backupPath: string | null = null

            // Create backup if no git
            if (!hasGit()) {
              backupPath = `${configPath}.backup.${Date.now()}`
              await writeFile(
                backupPath,
                JSON.stringify(currentConfig, null, 2),
              )
              console.log(
                chalk.green(
                  `✓ Backed up current config to ${path.basename(backupPath)}`,
                ),
              )
            }

            if (mergeChoice === 'merge') {
              // Merge configurations
              finalConfig = await mergeConfigurations(
                currentConfig,
                latestConfig,
              )
              console.log(
                chalk.green('✓ Merged configurations with latest updates'),
              )
            } else {
              // Replace with latest
              finalConfig = latestConfig
              console.log(chalk.green('✓ Replaced with latest configuration'))
            }

            // Write final configuration
            await writeFile(configPath, JSON.stringify(finalConfig, null, 2))
            console.log(
              chalk.green(
                `✓ Updated opencode.json with ${mergeChoice} strategy`,
              ),
            )

            // Update AGENTS.md if it doesn't exist
            const agentsMdPath = path.join(process.cwd(), 'AGENTS.md')
            if (!fs.existsSync(agentsMdPath)) {
              const agentsMdContent = `# Berget Code Agents

This document describes the specialized agents available in this project for use with OpenCode.

## Available Agents

### Primary Agents

#### fullstack
Router/coordinator agent for full-stack development with schema-driven architecture. Handles routing between different personas based on file paths and task requirements.

**Use when:**
- Working across multiple parts of a monorepo
- Need to coordinate between frontend, backend, devops, and app
- Starting new projects and need to determine tech stack

**Key features:**
- Schema-driven development (database → OpenAPI → types)
- Automatic routing to appropriate persona
- Tech stack discovery and recommendations

#### frontend
Builds Scandinavian, type-safe UIs with React, Tailwind, and Shadcn.

**Use when:**
- Working with React components (.tsx files)
- Frontend development in /apps/frontend
- UI/UX implementation

**Key features:**
- Design system integration
- Semantic tokens and accessibility
- Props-first component architecture

#### backend
Functional, modular Koa + TypeScript services with schema-first approach and code quality focus.

**Use when:**
- Working with Koa routers and services
- Backend development in /services
- API development and database work

**Key features:**
- Zod validation and OpenAPI generation
- Code quality and refactoring principles
- PR workflow integration

#### devops
Declarative GitOps infrastructure with FluxCD, Kustomize, Helm, and operators.

**Use when:**
- Working with Kubernetes manifests
- Infrastructure in /infra or /k8s
- CI/CD and deployment configurations

**Key features:**
- GitOps workflows
- Operator-first approach
- SemVer with release candidates

**Helm Values Configuration Process:**
1. Documentation First Approach: Always fetch official documentation from Artifact Hub/GitHub for the specific chart version before writing values. Search Artifact Hub for exact chart version documentation, check the chart's GitHub repository for official docs and examples, verify the exact version being used in the deployment.
2. Validation Requirements: Check for available validation schemas before committing YAML files. Use Helm's built-in validation tools (helm lint, helm template). Validate against JSON schema if available for the chart. Ensure YAML syntax correctness with linters.
3. Standard Workflow: Identify chart name and exact version. Fetch official documentation from Artifact Hub/GitHub. Check for available schemas and validation tools. Write values according to official documentation. Validate against schema (if available). Test with helm template or helm lint. Commit validated YAML files.
4. Quality Assurance: Never commit unvalidated Helm values. Use helm dependency update when adding new charts. Test rendering with helm template --dry-run before deployment. Document any custom values with comments referencing official docs.

#### app
Expo + React Native applications with props-first architecture and offline awareness.

**Use when:**
- Mobile app development with Expo
- React Native projects in /apps/app
- Cross-platform mobile development

**Key features:**
- Shared design tokens with frontend
- Offline-first architecture
- Expo integration

### Subagents

#### security
Security specialist for penetration testing, OWASP compliance, and vulnerability assessments.

**Use when:**
- Need security review of code changes
- OWASP Top 10 compliance checks
- Vulnerability assessments

**Key features:**
- OWASP standards compliance
- Security best practices
- Actionable remediation strategies

#### quality
Quality assurance specialist for testing, building, and PR management.

**Use when:**
- Need to run test suites and build processes
- Creating or updating pull requests
- Monitoring GitHub for reviewer comments
- Ensuring code quality standards

**Key features:**
- Comprehensive testing and building workflows
- PR creation and management
- GitHub integration for reviewer feedback
- CLI command expertise for quality assurance

## Usage

### Switching Agents
Use the \`<tab>\` key to cycle through primary agents during a session.

### Manual Agent Selection
Use commands to switch to specific agents:
- \`/fullstack\` - Switch to Fullstack agent
- \`/frontend\` - Switch to Frontend agent  
- \`/backend\` - Switch to Backend agent
- \`/devops\` - Switch to DevOps agent
- \`/app\` - Switch to App agent
- \`/quality\` - Switch to Quality agent for testing and PR management

### Using Subagents
Mention subagents with \`@\` symbol:
- \`@security review this authentication implementation\`
- \`@quality run tests and create PR for these changes\`

## Routing Rules

The fullstack agent automatically routes tasks based on file patterns:

- \`/apps/frontend\` or \`.tsx\` files → frontend
- \`/apps/app\` or Expo/React Native → app  
- \`/infra\`, \`/k8s\`, FluxCD, Helm → devops
- \`/services\`, Koa routers → backend

## Configuration

All agents are configured in \`opencode.json\` with:
- Specialized prompts and temperature settings
- Appropriate tool permissions
- Model optimizations for their specific tasks

## Environment Setup

Configure \`.env\` with your API key:
\`\`\`
BERGET_API_KEY=your_api_key_here
\`\`\`

## Workflow

All agents follow these principles:
- Never work directly in main branch
- Follow branch strategy and commit conventions
- Create PRs for new functionality
- Run tests before committing
- Address reviewer feedback promptly

---

*Updated by berget code update*
`

              await writeFile(agentsMdPath, agentsMdContent)
              console.log(chalk.green('✓ Updated AGENTS.md documentation'))
            }

            console.log(chalk.green('\n✅ Update completed successfully!'))
            console.log(chalk.blue('New features available:'))
            console.log(
              chalk.cyan('  • @quality subagent for testing and PR management'),
            )
            console.log(
              chalk.cyan('  • @security subagent for security reviews'),
            )
            console.log(chalk.cyan('  • Improved agent prompts and routing'))
            console.log(chalk.cyan('  • GLM-4.6 token optimizations'))
            console.log(chalk.blue('\nTry these new commands:'))
            console.log(chalk.cyan('  @quality run tests and create PR'))
            console.log(chalk.cyan('  @security review this code'))
          } catch (error) {
            console.error(chalk.red('Failed to update configuration:'))
            handleError('Update failed', error)

            // Restore from backup if update failed
            try {
              await writeFile(
                configPath,
                JSON.stringify(currentConfig, null, 2),
              )
              console.log(
                chalk.yellow('📁 Restored original configuration from backup'),
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
