import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import chalk from 'chalk'

interface TokenData {
  access_token: string
  refresh_token: string
  expires_at: number // timestamp in milliseconds
}

/**
 * Manages authentication tokens including refresh functionality
 */
export class TokenManager {
  private static instance: TokenManager
  private tokenFilePath: string
  private tokenData: TokenData | null = null
  
  private constructor() {
    // Set up token file path in user's home directory
    const bergetDir = path.join(os.homedir(), '.berget')
    if (!fs.existsSync(bergetDir)) {
      fs.mkdirSync(bergetDir, { recursive: true })
    }
    this.tokenFilePath = path.join(bergetDir, 'auth.json')
    this.loadToken()
  }
  
  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager()
    }
    return TokenManager.instance
  }
  
  /**
   * Load token data from file
   */
  private loadToken(): void {
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const data = fs.readFileSync(this.tokenFilePath, 'utf8')
        this.tokenData = JSON.parse(data)
      }
    } catch (error) {
      console.error(chalk.dim('Failed to load authentication token'))
      this.tokenData = null
    }
  }
  
  /**
   * Save token data to file
   */
  private saveToken(): void {
    try {
      if (this.tokenData) {
        fs.writeFileSync(this.tokenFilePath, JSON.stringify(this.tokenData, null, 2))
        // Set file permissions to be readable only by the owner
        fs.chmodSync(this.tokenFilePath, 0o600)
      } else {
        // If token data is null, remove the file
        if (fs.existsSync(this.tokenFilePath)) {
          fs.unlinkSync(this.tokenFilePath)
        }
      }
    } catch (error) {
      console.error(chalk.dim('Failed to save authentication token'))
    }
  }
  
  /**
   * Get the current access token
   * @returns The access token or null if not available
   */
  public getAccessToken(): string | null {
    if (!this.tokenData) return null
    return this.tokenData.access_token
  }
  
  /**
   * Get the refresh token
   * @returns The refresh token or null if not available
   */
  public getRefreshToken(): string | null {
    if (!this.tokenData) return null
    return this.tokenData.refresh_token
  }
  
  /**
   * Check if the access token is expired
   * @returns true if expired or about to expire (within 5 minutes), false otherwise
   */
  public isTokenExpired(): boolean {
    if (!this.tokenData || !this.tokenData.expires_at) return true
    
    // Consider token expired if it's within 5 minutes of expiration
    const expirationBuffer = 5 * 60 * 1000 // 5 minutes in milliseconds
    return Date.now() + expirationBuffer >= this.tokenData.expires_at
  }
  
  /**
   * Set new token data
   * @param accessToken The new access token
   * @param refreshToken The new refresh token
   * @param expiresIn Expiration time in seconds
   */
  public setTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    this.tokenData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: Date.now() + (expiresIn * 1000)
    }
    this.saveToken()
  }
  
  /**
   * Update just the access token and its expiration
   * @param accessToken The new access token
   * @param expiresIn Expiration time in seconds
   */
  public updateAccessToken(accessToken: string, expiresIn: number): void {
    if (!this.tokenData) return
    
    this.tokenData.access_token = accessToken
    this.tokenData.expires_at = Date.now() + (expiresIn * 1000)
    this.saveToken()
  }
  
  /**
   * Clear all token data
   */
  public clearTokens(): void {
    this.tokenData = null
    this.saveToken()
  }
}
