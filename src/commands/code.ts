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

/**
 * Helper function to get user confirmation
 */
async function confirm(question: string, autoYes = false): Promise<boolean> {
  if (autoYes) {
    return true
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise<boolean>((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      // Default to yes if user just presses enter
      const cleanAnswer = answer.trim().toLowerCase()
      resolve(cleanAnswer === '' || cleanAnswer === 'y' || cleanAnswer === 'yes')
    })
  })
}

/**
 * Helper function to get user input
 */
async function getInput(question: string, defaultValue: string, autoYes = false): Promise<string> {
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
 * Check if opencode is installed
 */
function checkOpencodeInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('opencode', ['--version'], { 
      stdio: 'pipe',
      shell: true 
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
        shell: true
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
      console.log(chalk.yellow('Installation completed but opencode command not found.'))
      console.log(chalk.yellow('You may need to restart your terminal or check your PATH.'))
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
      console.log(chalk.blue('OpenCode is required for the AI coding assistant.'))
    }
    
    if (await confirm('Would you like to install OpenCode automatically? (Y/n): ', autoYes)) {
      opencodeInstalled = await installOpencode()
    } else {
      if (!autoYes) {
        console.log(chalk.blue('\nInstallation cancelled.'))
        console.log(chalk.blue('To install manually: curl -fsSL https://opencode.ai/install | bash'))
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
    .option('-y, --yes', 'Automatically answer yes to all prompts (for automation)')
    .action(async (options) => {
      try {
        const projectName = options.name || getProjectName()
        const configPath = path.join(process.cwd(), 'opencode.json')
        
        // Check if already initialized
        if (fs.existsSync(configPath) && !options.force) {
          if (!options.yes) {
            console.log(chalk.yellow('Project already initialized for OpenCode.'))
            console.log(chalk.dim(`Config file: ${configPath}`))
          }
          
          if (await confirm('Do you want to reinitialize? (Y/n): ', options.yes)) {
            // Continue with reinitialization
          } else {
            return
          }
        }

        // Ensure opencode is installed
        if (!(await ensureOpencodeInstalled(options.yes))) {
          return
        }

        // Check if user is authenticated with Berget first
        try {
          const authService = AuthService.getInstance()
          // This will throw if not authenticated
          await authService.whoami()
        } catch (error) {
          console.log(chalk.red('❌ Not authenticated with Berget AI.'))
          console.log(chalk.blue('Please login first to create API keys:'))
          console.log(chalk.cyan('  berget auth login'))
          console.log(chalk.blue('Then try again:'))
          console.log(chalk.cyan(`  berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`))
          return
        }

        console.log(chalk.cyan(`Initializing OpenCode for project: ${projectName}`))

        // Handle API key selection or creation
        let apiKey: string
        let keyName: string
        
        try {
          const apiKeyService = ApiKeyService.getInstance()
          
          // For automation mode, check for environment variable first
          if (options.yes && process.env.BERGET_API_KEY) {
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
                console.log(`${chalk.cyan((index + 1).toString())}. ${chalk.bold(key.name)} (${key.prefix}...)`)
                console.log(chalk.dim(`   Created: ${new Date(key.created).toLocaleDateString('sv-SE')}`))
                console.log(chalk.dim(`   Last used: ${key.lastUsed ? new Date(key.lastUsed).toLocaleDateString('sv-SE') : 'Never'}`))
                if (index < existingKeys.length - 1) console.log()
              })
              console.log(chalk.dim('─'.repeat(60)))
              console.log(chalk.cyan(`${existingKeys.length + 1}. Create a new API key`))
              
              // Get user choice
              const choice = await new Promise<string>((resolve) => {
                const rl = readline.createInterface({
                  input: process.stdin,
                  output: process.stdout,
                })
                rl.question(chalk.blue('\nSelect an option (1-' + (existingKeys.length + 1) + '): '), (answer) => {
                  rl.close()
                  resolve(answer.trim())
                })
              })
              
              const choiceIndex = parseInt(choice) - 1
              
              if (choiceIndex >= 0 && choiceIndex < existingKeys.length) {
                // Use existing key
                const selectedKey = existingKeys[choiceIndex]
                keyName = selectedKey.name
                
                // We need to rotate the key to get the actual key value
                console.log(chalk.yellow(`\n🔄 Rotating API key "${selectedKey.name}" to get the key value...`))
                
                if (await confirm(chalk.yellow('This will invalidate the current key. Continue? (Y/n): '), options.yes)) {
                  const rotatedKey = await apiKeyService.rotate(selectedKey.id.toString())
                  apiKey = rotatedKey.key
                  console.log(chalk.green(`✓ API key rotated successfully`))
                } else {
                  console.log(chalk.yellow('Cancelled. Please select a different option or create a new key.'))
                  return
                }
              } else if (choiceIndex === existingKeys.length) {
                // Create new key
                console.log(chalk.blue('\n🔑 Creating new API key...'))
                
                const defaultKeyName = `opencode-${projectName}-${Date.now()}`
                const customName = await getInput(chalk.blue(`Enter key name (default: ${defaultKeyName}): `), defaultKeyName, options.yes)
                
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
              const customName = await getInput(chalk.blue(`Enter key name (default: ${defaultKeyName}): `), defaultKeyName, options.yes)
              
              keyName = customName
              const createOptions: CreateApiKeyOptions = { name: keyName }
              const keyData = await apiKeyService.create(createOptions)
              apiKey = keyData.key
              console.log(chalk.green(`✓ Created new API key: ${keyName}`))
            }
          }
        } catch (error) {
          console.error(chalk.red('Failed to handle API keys:'))
          handleError('API key operation failed', error)
          return
        }

        // Prepare .env file path for safe update
        const envPath = path.join(process.cwd(), '.env')

        // Create opencode.json config with optimized agent-based format
        const config = {
          "$schema": "https://opencode.ai/config.json",
          "username": "berget-code",
          "theme": "berget-dark",
          "share": "manual",
          "autoupdate": true,
          "model": "deepseek-r1",
          "small_model": "gpt-oss",
          "agent": {
            "fullstack": {
              "model": "deepseek-r1",
              "temperature": 0.3,
              "top_p": 0.9,
              "mode": "primary",
              "permission": { "edit": "allow", "bash": "allow", "webfetch": "allow" },
              "description": "Router/coordinator agent for full-stack development with schema-driven architecture",
              "prompt": "Voice: Scandinavian calm—precise, concise, confident; no fluff. You are Berget Code Fullstack agent. Act as a router and coordinator in a monorepo. Bottom-up schema: database → OpenAPI → generated types. Top-down types: API → UI → components. Use openapi-fetch and Zod at every boundary; compile-time errors are desired when contracts change. Routing rules: if task/paths match /apps/frontend or React (.tsx) → use frontend; if /apps/app or Expo/React Native → app; if /infra, /k8s, flux-system, kustomization.yaml, Helm values → devops; if /services, Koa routers, services/adapters/domain → backend. If ambiguous, remain fullstack and outline the end-to-end plan, then delegate subtasks to the right persona. Security: validate inputs; secrets via FluxCD SOPS/Sealed Secrets. Documentation is generated from code—never duplicated. For testing, building, and PR management, use @quality subagent."
            },
            "frontend": {
              "model": "deepseek-r1",
              "temperature": 0.4,
              "top_p": 0.9,
              "mode": "primary",
              "permission": { "edit": "allow", "bash": "deny", "webfetch": "allow" },
              "note": "Bash access is denied for frontend persona to prevent shell command execution in UI environments. This restriction enforces security and architectural boundaries.",
              "description": "Builds Scandinavian, type-safe UIs with React, Tailwind, Shadcn.",
              "prompt": "You are Berget Code Frontend agent. Voice: Scandinavian calm—precise, concise, confident. React 18 + TypeScript. Tailwind + Shadcn UI only via the design system (index.css, tailwind.config.ts). Use semantic tokens for color/spacing/typography/motion; never ad-hoc classes or inline colors. Components are pure and responsive; props-first data; minimal global state (Zustand/Jotai). Accessibility and keyboard navigation mandatory. Mock data only at init under /data via typed hooks (e.g., useProducts() reading /data/products.json). Design: minimal, balanced, quiet motion. For testing, building, and PR management, use @quality subagent."
            },
            "backend": {
              "model": "deepseek-r1",
              "temperature": 0.3,
              "top_p": 0.9,
              "mode": "primary",
              "permission": { "edit": "allow", "bash": "allow", "webfetch": "allow" },
              "description": "Functional, modular Koa + TypeScript services; schema-first with code quality focus.",
              "prompt": "You are Berget Code Backend agent. Voice: Scandinavian calm—precise, concise, confident. TypeScript + Koa. Prefer many small pure functions; avoid big try/catch blocks. Routes thin; logic in services/adapters/domain. Validate with Zod; auto-generate OpenAPI. Adapters isolate external systems; domain never depends on framework. Test with supertest; idempotent and stateless by default. Each microservice emits an OpenAPI contract; changes propagate upward to types. Code Quality & Refactoring Principles: Apply Single Responsibility Principle, fail fast with explicit errors, eliminate code duplication, remove nested complexity, use descriptive error codes, keep functions under 30 lines. Always leave code cleaner and more readable than you found it. For testing, building, and PR management, use @quality subagent."
            },
            "devops": {
              "model": "deepseek-r1",
              "temperature": 0.3,
              "top_p": 0.8,
              "mode": "primary",
              "permission": { "edit": "allow", "bash": "allow", "webfetch": "allow" },
              "description": "Declarative GitOps infra with FluxCD, Kustomize, Helm, operators.",
              "prompt": "You are Berget Code DevOps agent. Voice: Scandinavian calm—precise, concise, confident. Start simple: k8s/{deployment,service,ingress}. Add FluxCD sync to repo and image automation. Use Kustomize bases/overlays (staging, production). Add dependencies via Helm from upstream sources; prefer native operators when available (CloudNativePG, cert-manager, external-dns). SemVer with -rc tags keeps CI environments current. Observability with Prometheus/Grafana. No manual kubectl in production—Git is the source of truth."
            },
            "app": {
              "model": "deepseek-r1",
              "temperature": 0.4,
              "top_p": 0.9,
              "mode": "primary",
              "permission": { "edit": "allow", "bash": "deny", "webfetch": "allow" },
              "note": "Bash access is denied for app persona to prevent shell command execution in mobile/Expo environments. This restriction enforces security and architectural boundaries.",
              "description": "Expo + React Native apps; props-first, offline-aware, shared tokens.",
              "prompt": "You are Berget Code App agent. Voice: Scandinavian calm—precise, concise, confident. Expo + React Native + TypeScript. Structure by components/hooks/services/navigation. Components are pure; data via props; refactor shared logic into hooks/stores. Share tokens with frontend. Mock data in /data via typed hooks; later replace with live APIs. Offline via SQLite/MMKV; notifications via Expo. Request permissions only when needed. Subtle, meaningful motion; light/dark parity."
            },
            "security": {
              "model": "deepseek-r1",
              "temperature": 0.2,
              "top_p": 0.8,
              "mode": "subagent",
              "permission": { "edit": "deny", "bash": "allow", "webfetch": "allow" },
              "description": "Security specialist for pentesting, OWASP compliance, and vulnerability assessments.",
              "prompt": "Voice: Scandinavian calm—precise, concise, confident. You are Berget Code Security agent. Expert in application security, penetration testing, and OWASP standards. Core responsibilities: Conduct security assessments and penetration tests, Validate OWASP Top 10 compliance, Review code for security vulnerabilities, Implement security headers and Content Security Policy (CSP), Audit API security, Check for sensitive data exposure, Validate input sanitization and output encoding, Assess dependency security and supply chain risks. Tools and techniques: OWASP ZAP, Burp Suite, security linters, dependency scanners, manual code review. Always provide specific, actionable security recommendations with priority levels."
            },
            "quality": {
              "model": "deepseek-r1",
              "temperature": 0.1,
              "top_p": 0.9,
              "mode": "subagent",
              "permission": { "edit": "allow", "bash": "allow", "webfetch": "allow" },
              "description": "Quality assurance specialist for testing, building, and PR management.",
              "prompt": "Voice: Scandinavian calm—precise, concise, confident. You are Berget Code Quality agent. Specialist in code quality assurance, testing, building, and pull request management.\n\nCore responsibilities:\n  - Run comprehensive test suites (npm test, npm run test, jest, vitest)\n  - Execute build processes (npm run build, webpack, vite, tsc)\n  - Create and manage pull requests with proper descriptions\n  - Monitor GitHub for Copilot/reviewer comments\n  - Ensure code quality standards are met\n  - Validate linting and formatting (npm run lint, prettier)\n  - Check test coverage and performance benchmarks\n  - Handle CI/CD pipeline validation\n\nCommon CLI commands:\n  - npm test or npm run test (run test suite)\n  - npm run build (build project)\n  - npm run lint (run linting)\n  - npm run format (format code)\n  - npm run test:coverage (check coverage)\n  - gh pr create (create pull request)\n  - gh pr view --comments (check PR comments)\n  - git add . && git commit -m \"message\" && git push (commit and push)\n\nPR Workflow:\n  1. Ensure all tests pass: npm test\n  2. Build successfully: npm run build\n  3. Create/update PR with clear description\n  4. Monitor for reviewer comments\n  5. Address feedback promptly\n  6. Update PR with fixes\n  7. Ensure CI checks pass\n\nAlways provide specific command examples and wait for processes to complete before proceeding."
            }
          },
          "command": {
            "fullstack": {
              "description": "Switch to Fullstack (router)",
              "template": "{{input}}",
              "agent": "fullstack"
            },
            "route": {
              "description": "Let Fullstack auto-route to the right persona based on files/intent",
              "template": "ROUTE {{input}}",
              "agent": "fullstack",
              "subtask": true
            },
            "frontend": {
              "description": "Switch to Frontend persona",
              "template": "{{input}}",
              "agent": "frontend"
            },
            "backend": {
              "description": "Switch to Backend persona",
              "template": "{{input}}",
              "agent": "backend"
            },
            "devops": {
              "description": "Switch to DevOps persona",
              "template": "{{input}}",
              "agent": "devops"
            },
            "app": {
              "description": "Switch to App persona",
              "template": "{{input}}",
              "agent": "app"
            },
            "quality": {
              "description": "Switch to Quality agent for testing, building, and PR management",
              "template": "{{input}}",
              "agent": "quality"
            }
          },
          "watcher": {
            "ignore": ["node_modules", "dist", ".git", "coverage"]
          },
          "provider": {
            "berget": {
              "npm": "@ai-sdk/openai-compatible",
              "name": "Berget AI",
              "options": { "baseURL": "https://api.berget.ai/v1" },
              "models": {
                "deepseek-r1": { "name": "GLM-4.6" },
                "gpt-oss": { "name": "GPT-OSS" }
              }
            }
          }
        }

        // Ask for permission to create config files
        if (!options.yes) {
          console.log(chalk.blue('\nAbout to create configuration files:'))
          console.log(chalk.dim(`Config: ${configPath}`))
          console.log(chalk.dim(`Environment: ${envPath}`))
          console.log(chalk.dim(`Documentation: ${path.join(process.cwd(), 'AGENTS.md')} (if not exists)`))
          console.log(chalk.dim(`Template: ${path.join(process.cwd(), '.env.example')} (if not exists)`))
          console.log(chalk.dim('This will configure OpenCode to use Berget AI models.'))
          console.log(chalk.cyan('\n💡 Benefits:'))
          console.log(chalk.cyan('  • API key stored separately in .env file (not committed to Git)'))
          console.log(chalk.cyan('  • Easy cost separation per project/customer'))
          console.log(chalk.cyan('  • Secure key management with environment variables'))
          console.log(chalk.cyan('  • Project-specific agent documentation (won\'t overwrite existing)'))
        }
        
        if (await confirm('\nCreate configuration files? (Y/n): ', options.yes)) {
          try {
            // Safely update .env file using dotenv
            await updateEnvFile({
              envPath,
              key: 'BERGET_API_KEY',
              value: apiKey,
              comment: `Berget AI Configuration for ${projectName} - Generated by berget code init - Do not commit to version control`
            })
            
            // Create opencode.json
            await writeFile(configPath, JSON.stringify(config, null, 2))
            console.log(chalk.green(`✓ Created opencode.json`))
            console.log(chalk.dim(`  Model: ${config.model}`))
            console.log(chalk.dim(`  Small Model: ${config.small_model}`))
            console.log(chalk.dim(`  Theme: ${config.theme}`))
            console.log(chalk.dim(`  API Key: Stored in .env as BERGET_API_KEY`))

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

Copy \`.env.example\` to \`.env\` and configure:
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
              console.log(chalk.dim(`  Documentation for available agents and usage`))
            } else {
              console.log(chalk.yellow(`⚠ AGENTS.md already exists, skipping creation`))
            }

            // Create .env.example template only if it doesn't exist
            const envExamplePath = path.join(process.cwd(), '.env.example')
            if (!fs.existsSync(envExamplePath)) {
              const envExampleContent = `# OpenCode Configuration for ${projectName}
# Copy this file to .env and adjust values as needed

# Berget AI API Key - Required for authentication
BERGET_API_KEY=your_api_key_here
`

              await writeFile(envExamplePath, envExampleContent)
              console.log(chalk.green(`✓ Created .env.example`))
              console.log(chalk.dim(`  Environment configuration template`))
            } else {
              console.log(chalk.yellow(`⚠ .env.example already exists, skipping creation`))
            }
            
            // Check if .gitignore exists and add .env if not already there
            const gitignorePath = path.join(process.cwd(), '.gitignore')
            let gitignoreContent = ''
            
            if (fs.existsSync(gitignorePath)) {
              gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
            }
            
            if (!gitignoreContent.includes('.env')) {
              gitignoreContent += (gitignoreContent.endsWith('\n') ? '' : '\n') + '.env\n'
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
        console.log(chalk.blue(`  berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.RUN}`))
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
    .option('-y, --yes', 'Automatically answer yes to all prompts (for automation)')
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
            console.log(chalk.dim(`Loaded config for project: ${config.projectName}`))
        console.log(chalk.dim(`Models: Analysis=${config.analysisModel}, Build=${config.buildModel}`))
          } catch (error) {
            console.log(chalk.yellow('Warning: Failed to load opencode.json'))
          }
        }

        if (!config) {
          console.log(chalk.yellow('No project configuration found.'))
          console.log(chalk.blue(`Run ${chalk.bold(`berget ${COMMAND_GROUPS.CODE} ${SUBCOMMANDS.CODE.INIT}`)} first.`))
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
          shell: true
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
}