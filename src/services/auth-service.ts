import {
  createAuthenticatedClient,
  saveAuthToken,
  clearAuthToken,
  apiClient,
} from '../client'
// We'll use dynamic import for 'open' to support ESM modules in CommonJS
import chalk from 'chalk'
import { handleError } from '../utils/error-handler'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'

/**
 * Service for authentication operations
 * Command group: auth
 */
export class AuthService {
  private static instance: AuthService
  private client = createAuthenticatedClient()
  
  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.AUTH
  
  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.AUTH

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  public async login(): Promise<boolean> {
    try {
      // Clear any existing token to ensure a fresh login
      clearAuthToken()

      console.log(chalk.blue('Initiating login process...'))

      // Step 1: Initiate device authorization
      const { data: deviceData, error: deviceError } = await apiClient.POST(
        '/v1/auth/device',
        {}
      )

      if (deviceError || !deviceData) {
        throw new Error(
          deviceError
            ? JSON.stringify(deviceError)
            : 'Failed to get device authorization data'
        )
      }

      // Type assertion for deviceData
      const typedDeviceData = deviceData as {
        verification_url?: string;
        user_code?: string;
        device_code?: string;
        expires_in?: number;
        interval?: number;
      };

      // Display information to user
      console.log(chalk.cyan('\nTo complete login:'))
      console.log(
        chalk.cyan(
          `1. Open this URL: ${chalk.bold(
            typedDeviceData.verification_url || 'https://auth.berget.ai/device'
          )}`
        )
      )
      console.log(
        chalk.cyan(
          `2. Enter this code: ${chalk.bold(typedDeviceData.user_code || '')}\n`
        )
      )

      // Try to open browser automatically
      try {
        if (typedDeviceData.verification_url) {
          // Use dynamic import for the 'open' package
          const open = await import('open').then(m => m.default);
          await open(typedDeviceData.verification_url);
          console.log(
            chalk.dim(
              "Browser opened automatically. If it didn't open, please use the URL above."
            )
          )
        }
      } catch (error) {
        console.log(
          chalk.yellow(
            'Could not open browser automatically. Please open the URL manually.'
          )
        )
      }

      console.log(chalk.dim('\nWaiting for authentication to complete...'))

      // Step 2: Poll for completion
      const startTime = Date.now()
      const expiresIn =
        typedDeviceData.expires_in !== undefined ? typedDeviceData.expires_in : 900
      const expiresAt = startTime + expiresIn * 1000
      let pollInterval = (typedDeviceData.interval || 5) * 1000

      const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
      let spinnerIdx = 0

      while (Date.now() < expiresAt) {
        // Wait for the polling interval
        await new Promise((resolve) => setTimeout(resolve, pollInterval))

        // Update spinner
        process.stdout.write(
          `\r${chalk.blue(spinner[spinnerIdx])} Waiting for authentication...`
        )
        spinnerIdx = (spinnerIdx + 1) % spinner.length

        // Check if authentication is complete
        const deviceCode = typedDeviceData.device_code || ''
        const { data: tokenData, error: tokenError } = await apiClient.POST(
          '/v1/auth/device/token',
          {
            body: {
              device_code: deviceCode,
            },
          }
        )

        if (tokenError) {
          // Parse the error to get status and other details
          const errorObj =
            typeof tokenError === 'string' ? JSON.parse(tokenError) : tokenError

          const status = errorObj.status || 0
          const errorCode = errorObj.code || ''

          if (status === 401 || errorCode === 'AUTHORIZATION_PENDING') {
            // Still waiting for user to complete authorization
            continue
          } else if (status === 429) {
            // Slow down
            pollInterval *= 2
            continue
          } else if (status === 400) {
            // Error or expired
            if (errorCode === 'EXPIRED_TOKEN') {
              console.log(
                chalk.red('\n\nAuthentication timed out. Please try again.')
              )
            } else if (errorCode !== 'AUTHORIZATION_PENDING') {
              // Only show error if it's not the expected "still waiting" error
              const errorMessage = errorObj.message || JSON.stringify(errorObj)
              console.log(chalk.red(`\n\nError: ${errorMessage}`))
              return false
            } else {
              // If it's AUTHORIZATION_PENDING, continue polling
              continue
            }
            return false
          } else {
            // For any other error, log it but continue polling
            // This makes the flow more resilient to temporary issues
            if (process.env.DEBUG) {
              console.log(
                chalk.yellow(`\n\nReceived error: ${JSON.stringify(errorObj)}`)
              )
              console.log(
                chalk.yellow('Continuing to wait for authentication...')
              )
              process.stdout.write(
                `\r${chalk.blue(
                  spinner[spinnerIdx]
                )} Waiting for authentication...`
              )
            }
            continue
          }
        } else if (tokenData) {
          // Type assertion for tokenData
          const typedTokenData = tokenData as {
            token?: string;
            refresh_token?: string;
            expires_in?: number;
            user?: any;
          };
          
          if (typedTokenData.token) {
            // Success!
            saveAuthToken(
              typedTokenData.token, 
              typedTokenData.refresh_token || '', 
              typedTokenData.expires_in || 3600
            )

            process.stdout.write('\r' + ' '.repeat(50) + '\r') // Clear the spinner line
            console.log(chalk.green('✓ Successfully logged in to Berget'))

            if (typedTokenData.user) {
              const user = typedTokenData.user
            console.log(
              chalk.green(`Logged in as ${user.name || user.email || 'User'}`)
            )
          }

          return true
        }
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

  /**
   * Get current user profile
   * Command: berget auth whoami
   */
  public async whoami() {
    try {
      const { data, error } = await this.client.GET('/v1/users/me')
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      handleError('Failed to get user profile', error)
      throw error
    }
  }
}
