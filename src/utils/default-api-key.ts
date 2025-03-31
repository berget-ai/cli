import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import chalk from 'chalk'

interface DefaultApiKeyData {
  id: string
  name: string
  prefix: string
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
      console.error(chalk.dim('Failed to load default API key configuration'))
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
      console.error(chalk.dim('Failed to save default API key configuration'))
    }
  }
  
  /**
   * Set the default API key
   */
  public setDefaultApiKey(id: string, name: string, prefix: string): void {
    this.defaultApiKey = { id, name, prefix }
    this.saveConfig()
  }
  
  /**
   * Get the default API key
   */
  public getDefaultApiKey(): DefaultApiKeyData | null {
    return this.defaultApiKey
  }
  
  /**
   * Clear the default API key
   */
  public clearDefaultApiKey(): void {
    this.defaultApiKey = null
    this.saveConfig()
  }
}
