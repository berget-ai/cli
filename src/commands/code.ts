import { Command } from 'commander'
import chalk from 'chalk'
import readline from 'readline'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import { ApiKeyService, CreateApiKeyOptions } from '../services/api-key-service'
import { handleError } from '../utils/error-handler'
import * as fs from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

/**
 * Helper function to get user confirmation
 */
async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise<boolean>((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
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
async function ensureOpencodeInstalled(): Promise<boolean> {
  let opencodeInstalled = await checkOpencodeInstalled()
  if (!opencodeInstalled) {
    console.log(chalk.red('OpenCode is not installed.'))
    console.log(chalk.blue('OpenCode is required for the AI coding assistant.'))
    
    if (await confirm('Would you like to install OpenCode automatically? (y/n): ')) {
      opencodeInstalled = await installOpencode()
    } else {
      console.log(chalk.blue('\nInstallation cancelled.'))
      console.log(chalk.blue('To install manually: curl -fsSL https://opencode.ai/install | bash'))
      console.log(chalk.blue('Or visit: https://opencode.ai/docs'))
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
    .action(async (options) => {
      try {
        const projectName = options.name || getProjectName()
        const configPath = path.join(process.cwd(), 'opencode.json')
        
        // Check if already initialized
        if (fs.existsSync(configPath) && !options.force) {
          console.log(chalk.yellow('Project already initialized for OpenCode.'))
          console.log(chalk.dim(`Config file: ${configPath}`))
          
          if (await confirm('Do you want to reinitialize? (y/n): ')) {
            // Continue with reinitialization
          } else {
            return
          }
        }

        // Ensure opencode is installed
        if (!(await ensureOpencodeInstalled())) {
          return
        }

        console.log(chalk.cyan(`Initializing OpenCode for project: ${projectName}`))

        // Handle API key selection or creation
        let apiKey: string
        let keyName: string
        
        try {
          const apiKeyService = ApiKeyService.getInstance()
          
          // List existing API keys
          console.log(chalk.blue('\n📋 Checking existing API keys...'))
          const existingKeys = await apiKeyService.list()
          
          if (existingKeys.length > 0) {
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
              
              if (await confirm(chalk.yellow('This will invalidate the current key. Continue? (y/n): '))) {
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
              const customName = await new Promise<string>((resolve) => {
                const rl = readline.createInterface({
                  input: process.stdin,
                  output: process.stdout,
                })
                rl.question(chalk.blue(`Enter key name (default: ${defaultKeyName}): `), (answer) => {
                  rl.close()
                  resolve(answer.trim() || defaultKeyName)
                })
              })
              
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
            // No existing keys, create new one
            console.log(chalk.yellow('No existing API keys found.'))
            console.log(chalk.blue('Creating a new API key...'))
            
            const defaultKeyName = `opencode-${projectName}-${Date.now()}`
            const customName = await new Promise<string>((resolve) => {
              const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
              })
              rl.question(chalk.blue(`Enter key name (default: ${defaultKeyName}): `), (answer) => {
                rl.close()
                resolve(answer.trim() || defaultKeyName)
              })
            })
            
            keyName = customName
            const createOptions: CreateApiKeyOptions = { name: keyName }
            const keyData = await apiKeyService.create(createOptions)
            apiKey = keyData.key
            console.log(chalk.green(`✓ Created new API key: ${keyName}`))
          }
        } catch (error) {
          console.error(chalk.red('Failed to handle API keys:'))
          handleError('API key operation failed', error)
          return
        }

        // Create .env file with API key
        const envPath = path.join(process.cwd(), '.env')
        const envContent = `# Berget AI Configuration for ${projectName}
# Generated by berget code init
# Do not commit to version control
BERGET_API_KEY=${apiKey}
`

        // Create opencode.json config (without API key)
        const config = {
          model: "berget/deepseek-r1", // Will be changed to glm-4-6 later
          envKey: "BERGET_API_KEY",
          projectName: projectName,
          provider: "berget",
          created: new Date().toISOString(),
          version: "1.0.0"
        }

        // Ask for permission to create config files
        console.log(chalk.blue('\nAbout to create configuration files:'))
        console.log(chalk.dim(`Config: ${configPath}`))
        console.log(chalk.dim(`Environment: ${envPath}`))
        console.log(chalk.dim('This will configure OpenCode to use Berget AI models.'))
        console.log(chalk.cyan('\n💡 Benefits:'))
        console.log(chalk.cyan('  • API key stored separately in .env file (not committed to Git)'))
        console.log(chalk.cyan('  • Easy cost separation per project/customer'))
        console.log(chalk.cyan('  • Secure key management with environment variables'))
        
        if (await confirm('\nCreate configuration files? (y/n): ')) {
          try {
            // Create .env file
            await writeFile(envPath, envContent)
            console.log(chalk.green(`✓ Created .env with API key`))
            
            // Create opencode.json
            await writeFile(configPath, JSON.stringify(config, null, 2))
            console.log(chalk.green(`✓ Created opencode.json`))
            console.log(chalk.dim(`  Model: ${config.model}`))
            console.log(chalk.dim(`  Project: ${config.projectName}`))
            console.log(chalk.dim(`  API Key: Stored in .env as ${config.envKey}`))
            
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
    .option('--no-config', 'Run without loading project config')
    .action(async (prompt: string, options: any) => {
      try {
        const configPath = path.join(process.cwd(), 'opencode.json')
        
        // Ensure opencode is installed
        if (!(await ensureOpencodeInstalled())) {
          return
        }

        let config: any = null
        if (!options.noConfig && fs.existsSync(configPath)) {
          try {
            const configContent = await readFile(configPath, 'utf8')
            config = JSON.parse(configContent)
            console.log(chalk.dim(`Loaded config for project: ${config.projectName}`))
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

        if (options.model || config.model) {
          opencodeArgs.push('--model', options.model || config.model)
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