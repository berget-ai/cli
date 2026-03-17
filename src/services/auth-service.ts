import {
  createAuthenticatedClient,
  saveAuthToken,
  clearAuthToken,
  apiClient,
  API_BASE_URL,
} from '../client'
// We'll use dynamic import for 'open' to support ESM modules in CommonJS
import chalk from 'chalk'
import { handleError } from '../utils/error-handler'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import * as http from 'http'
import * as crypto from 'crypto'
import * as url from 'url'

// Keycloak configuration based on environment
const isStageMode = process.argv.includes('--stage')
const isLocalMode = process.argv.includes('--local')
const KEYCLOAK_URL = (isStageMode || isLocalMode)
  ? 'https://keycloak.stage.berget.ai'
  : 'https://keycloak.berget.ai'
const KEYCLOAK_REALM = 'berget'
const KEYCLOAK_CLIENT_ID = 'berget-code'
const CALLBACK_PORT = 8787

/**
 * Generate a random string for PKCE code_verifier
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * Generate code_challenge from code_verifier using S256 method
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

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

  public async whoami(): Promise<any> {
    try {
      // Create fresh client to ensure we have the latest token
      const client = createAuthenticatedClient()
      const { data: profile, error } = await client.GET('/v1/users/me')
      if (error) {
        return null
      }
      return profile
    } catch (error) {
      return null
    }
  }

  public async login(): Promise<boolean> {
    try {
      // Clear any existing token to ensure a fresh login
      clearAuthToken()

      console.log(chalk.blue('Initiating login process...'))

      // Generate PKCE code verifier and challenge
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = generateCodeChallenge(codeVerifier)
      const state = crypto.randomBytes(16).toString('hex')

      const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`

      // Build authorization URL
      const authUrl = new URL(
        `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
      )
      authUrl.searchParams.set('client_id', KEYCLOAK_CLIENT_ID)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('scope', 'openid email profile')
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')

      // Create a promise that resolves when we receive the callback
      const authResult = await new Promise<{
        success: boolean
        code?: string
        error?: string
      }>((resolve) => {
        const server = http.createServer(async (req, res) => {
          const parsedUrl = url.parse(req.url || '', true)

          if (parsedUrl.pathname === '/callback') {
            const receivedState = parsedUrl.query.state as string
            const code = parsedUrl.query.code as string
            const error = parsedUrl.query.error as string

            if (error) {
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(`
                <html>
                  <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e;">
                    <div style="text-align: center; color: #ff6b6b;">
                      <h1>Authentication Failed</h1>
                      <p>${parsedUrl.query.error_description || error}</p>
                      <p style="color: #666;">You can close this window.</p>
                    </div>
                  </body>
                </html>
              `)
              server.close()
              resolve({ success: false, error })
              return
            }

            if (receivedState !== state) {
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(`
                <html>
                  <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e;">
                    <div style="text-align: center; color: #ff6b6b;">
                      <h1>Authentication Failed</h1>
                      <p>Invalid state parameter. Please try again.</p>
                      <p style="color: #666;">You can close this window.</p>
                    </div>
                  </body>
                </html>
              `)
              server.close()
              resolve({ success: false, error: 'Invalid state parameter' })
              return
            }

            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(`
              <html>
                <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e;">
                  <div style="text-align: center; color: #4ade80;">
                    <h1>✓ Authentication Successful</h1>
                    <p style="color: #a0a0a0;">You can close this window and return to the terminal.</p>
                  </div>
                </body>
              </html>
            `)
            server.close()
            resolve({ success: true, code })
          }
        })

        server.listen(CALLBACK_PORT, () => {
          if (process.argv.includes('--debug')) {
            console.log(
              chalk.dim(`Callback server listening on port ${CALLBACK_PORT}`),
            )
          }
        })

        // Set timeout for the server
        setTimeout(() => {
          server.close()
          resolve({ success: false, error: 'Authentication timed out' })
        }, 5 * 60 * 1000) // 5 minute timeout

        // Open browser
        ;(async () => {
          try {
            const open = await import('open').then((m) => m.default)
            await open(authUrl.toString())
            console.log(chalk.dim('Browser opened for authentication...'))
          } catch {
            console.log(chalk.cyan('\nPlease open this URL in your browser:'))
            console.log(chalk.bold(authUrl.toString()))
          }
        })()
      })

      if (!authResult.success || !authResult.code) {
        console.log(
          chalk.red(`\nAuthentication failed: ${authResult.error || 'Unknown error'}`),
        )
        return false
      }

      // Exchange authorization code for tokens
      console.log(chalk.dim('Exchanging authorization code for tokens...'))

      const tokenUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: KEYCLOAK_CLIENT_ID,
          code: authResult.code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }).toString(),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.log(chalk.red(`\nFailed to exchange code for tokens: ${errorText}`))
        return false
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string
        refresh_token: string
        expires_in: number
        refresh_expires_in?: number
      }

      // Save tokens
      saveAuthToken(
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_in,
      )

      if (process.argv.includes('--debug')) {
        console.log(chalk.yellow('DEBUG: Token data received:'))
        console.log(
          chalk.yellow(
            JSON.stringify(
              {
                expires_in: tokenData.expires_in,
                refresh_expires_in: tokenData.refresh_expires_in,
              },
              null,
              2,
            ),
          ),
        )
      }

      console.log(chalk.green('\n✓ Successfully logged in to Berget'))

      // Try to get user info
      try {
        const profile = await this.whoami()
        if (profile?.email) {
          console.log(chalk.green(`Logged in as ${profile.name || profile.email}`))
        }
      } catch {
        // Ignore errors fetching profile
      }

      console.log(chalk.cyan('\nNext steps:'))
      console.log(chalk.cyan('  • Create an API key: berget api-keys create'))
      console.log(chalk.cyan('  • Setup OpenCode: berget code init'))

      return true
    } catch (error) {
      handleError('Login failed', error)
      return false
    }
  }
}
