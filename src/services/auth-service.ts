import { createAuthenticatedClient, saveAuthToken, apiClient } from '../client'
import open from 'open'
import chalk from 'chalk'
import { handleError } from '../utils/error-handler'

export class AuthService {
  private static instance: AuthService
  private client = createAuthenticatedClient()

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  public async login(): Promise<boolean> {
    try {
      console.log(chalk.blue('Initiating login process...'))

      // Step 1: Initiate device authorization
      const deviceResponse = await apiClient.POST('/v1/auth/device')
      
      if (deviceResponse.error) {
        throw new Error(JSON.stringify(deviceResponse.error))
      }
      
      const deviceData = deviceResponse.data
      
      if (!deviceData) {
        throw new Error('Failed to get device authorization data')
      }
      
      // Display information to user
      console.log(chalk.cyan('\nTo complete login:'))
      console.log(chalk.cyan(`1. Open this URL: ${chalk.bold(deviceData.verification_url)}`))
      console.log(chalk.cyan(`2. Enter this code: ${chalk.bold(deviceData.user_code)}\n`))
      
      // Try to open browser automatically
      try {
        await open(deviceData.verification_url)
        console.log(chalk.dim('Browser opened automatically. If it didn\'t open, please use the URL above.'))
      } catch (error) {
        console.log(chalk.yellow('Could not open browser automatically. Please open the URL manually.'))
      }
      
      console.log(chalk.dim('\nWaiting for authentication to complete...'))
      
      // Step 2: Poll for completion
      const startTime = Date.now()
      const expiresAt = startTime + (deviceData.expires_in * 1000)
      let pollInterval = deviceData.interval * 1000
      
      const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
      let spinnerIdx = 0
      
      while (Date.now() < expiresAt) {
        // Wait for the polling interval
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        
        // Update spinner
        process.stdout.write(`\r${chalk.blue(spinner[spinnerIdx])} Waiting for authentication...`)
        spinnerIdx = (spinnerIdx + 1) % spinner.length
        
        // Check if authentication is complete
        const tokenResponse = await apiClient.POST('/v1/auth/device/token', {
          body: {
            device_code: deviceData.device_code
          }
        })
        
        if (tokenResponse.error) {
          if (tokenResponse.error.status === 401) {
            // Still waiting
            continue
          } else if (tokenResponse.error.status === 429) {
            // Slow down
            pollInterval *= 2
            continue
          } else if (tokenResponse.error.status === 400) {
            // Error or expired
            const errorData = tokenResponse.error
            if (errorData.code === 'EXPIRED_TOKEN') {
              console.log(chalk.red('\n\nAuthentication timed out. Please try again.'))
            } else {
              console.log(chalk.red(`\n\nError: ${errorData.message || JSON.stringify(errorData)}`))
            }
            return false
          }
        }
        
        if (tokenResponse.data) {
          // Success!
          const tokenData = tokenResponse.data
          
          // Step 3: Store the token
          saveAuthToken(tokenData.token)
          
          process.stdout.write('\r' + ' '.repeat(50) + '\r') // Clear the spinner line
          console.log(chalk.green('✓ Successfully logged in to Berget'))
          
          if (tokenData.user) {
            console.log(chalk.green(`Logged in as ${tokenData.user.name || tokenData.user.email}`))
          }
          
          return true
        }
      }
      
      console.log(chalk.red('\n\nAuthentication timed out. Please try again.'))
      return false
    } catch (error) {
      handleError('Login failed', error)
      return false
    }
  }

  public async isAuthenticated(): Promise<boolean> {
    try {
      // Call an API endpoint that requires authentication
      const { data, error } = await this.client.GET('/v1/users/me')
      return !!data && !error
    } catch {
      return false
    }
  }
  
  public async getUserProfile() {
    try {
      const { data, error } = await this.client.GET('/v1/users/me')
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      console.error('Failed to get user profile:', error)
      throw error
    }
  }
}
