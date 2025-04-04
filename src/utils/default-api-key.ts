import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import chalk from 'chalk'
import { ApiKeyService } from '../services/api-key-service'
import readline from 'readline'

interface DefaultApiKeyData {
  id: string
  name: string
  prefix: string
  key: string
}

/**
 * Manages the default API key for chat commands
 */
export class DefaultApiKeyManager {
  private static instance: DefaultApiKeyManager
  private configFilePath: string
  private defaultApiKey: DefaultApiKeyData | null = null
  
  private constructor() {
    // Set up config file path in user's home directory
    const bergetDir = path.join(os.homedir(), '.berget')
    if (!fs.existsSync(bergetDir)) {
      fs.mkdirSync(bergetDir, { recursive: true })
    }
    this.configFilePath = path.join(bergetDir, 'default-api-key.json')
    this.loadConfig()
  }
  
  public static getInstance(): DefaultApiKeyManager {
    if (!DefaultApiKeyManager.instance) {
      DefaultApiKeyManager.instance = new DefaultApiKeyManager()
    }
    return DefaultApiKeyManager.instance
  }
  
  /**
   * Load default API key from file
   */
  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const data = fs.readFileSync(this.configFilePath, 'utf8')
        this.defaultApiKey = JSON.parse(data)
      }
    } catch (error) {
      if (process.argv.includes('--debug')) {
        console.error(chalk.dim('Failed to load default API key configuration'))
      }
      this.defaultApiKey = null
    }
  }
  
  /**
   * Save default API key to file
   */
  private saveConfig(): void {
    try {
      if (this.defaultApiKey) {
        fs.writeFileSync(this.configFilePath, JSON.stringify(this.defaultApiKey, null, 2))
        // Set file permissions to be readable only by the owner
        fs.chmodSync(this.configFilePath, 0o600)
      } else {
        // If default API key is null, remove the file
        if (fs.existsSync(this.configFilePath)) {
          fs.unlinkSync(this.configFilePath)
        }
      }
    } catch (error) {
      if (process.argv.includes('--debug')) {
        console.error(chalk.dim('Failed to save default API key configuration'))
      }
    }
  }
  
  /**
   * Set the default API key
   */
  public setDefaultApiKey(id: string, name: string, prefix: string, key: string): void {
    this.defaultApiKey = { id, name, prefix, key }
    this.saveConfig()
  }
  
  /**
   * Get the default API key string
   */
  public getDefaultApiKey(): string | null {
    return this.defaultApiKey?.key || null
  }
  
  /**
   * Get the default API key data object
   */
  public getDefaultApiKeyData(): DefaultApiKeyData | null {
    return this.defaultApiKey
  }
  
  /**
   * Clear the default API key
   */
  public clearDefaultApiKey(): void {
    this.defaultApiKey = null
    this.saveConfig()
  }

  /**
   * Prompts the user to select a default API key if none is set
   * @returns The selected API key or null if none was selected
   */
  public async promptForDefaultApiKey(): Promise<string | null> {
    try {
      // If we already have a default API key, return it
      if (this.defaultApiKey) {
        return this.defaultApiKey.key
      }

      const apiKeyService = ApiKeyService.getInstance()
      
      // Get all API keys
      let apiKeys;
      try {
        apiKeys = await apiKeyService.list()
        
        if (!apiKeys || apiKeys.length === 0) {
          console.log(chalk.yellow('No API keys found. Create one with:'))
          console.log(chalk.blue('  berget api-keys create --name "My Key"'))
          return null
        }
      } catch (error) {
        console.log(chalk.red('Error fetching API keys:'))
        if (error instanceof Error) {
          console.log(chalk.red(error.message))
        }
        console.log(chalk.yellow('Please make sure you are logged in with: berget auth login'))
        return null
      }
      
      console.log(chalk.blue('Select an API key to use as default:'))
      
      // Display available API keys
      apiKeys.forEach((key, index) => {
        console.log(`  ${index + 1}. ${key.name} (${key.prefix}...)`)
      })
      
      // Create readline interface for user input
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })
      
      // Prompt for selection
      const selection = await new Promise<number>((resolve) => {
        rl.question('Enter number (or press Enter to cancel): ', (answer) => {
          rl.close()
          const num = parseInt(answer.trim(), 10)
          if (isNaN(num) || num < 1 || num > apiKeys.length) {
            resolve(-1) // Invalid selection
          } else {
            resolve(num - 1) // Convert to zero-based index
          }
        })
      })
      
      if (selection === -1) {
        console.log(chalk.yellow('No API key selected'))
        return null
      }
      
      const selectedKey = apiKeys[selection]
      
      // Create a new API key with the selected name
      const newKey = await apiKeyService.create({
        name: `CLI Default (copy of ${selectedKey.name})`,
        description: 'Created automatically by the Berget CLI for default use'
      })
      
      // Save the new key as default
      this.setDefaultApiKey(
        newKey.id.toString(), 
        newKey.name, 
        newKey.key.substring(0, 8), // Use first 8 chars as prefix
        newKey.key
      )
      
      console.log(chalk.green(`✓ Default API key set to: ${newKey.name}`))
      return newKey.key
    } catch (error) {
      console.error(chalk.red('Failed to set default API key:'), error)
      return null
    }
  }
}
