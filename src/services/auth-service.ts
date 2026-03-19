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

            const errorPage = (title: string, message: string) => `
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Berget - Authentication Failed</title>
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      min-height: 100vh;
                      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
                      color: #fff;
                    }
                    .container {
                      text-align: center;
                      padding: 3rem;
                      max-width: 400px;
                    }
                    .icon {
                      width: 80px;
                      height: 80px;
                      background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      margin: 0 auto 1.5rem;
                      box-shadow: 0 4px 20px rgba(248, 113, 113, 0.3);
                    }
                    .icon svg {
                      width: 40px;
                      height: 40px;
                      stroke: #fff;
                      stroke-width: 3;
                    }
                    h1 {
                      font-size: 1.5rem;
                      font-weight: 600;
                      margin-bottom: 0.75rem;
                      color: #fff;
                    }
                    p {
                      color: #94a3b8;
                      font-size: 0.95rem;
                      line-height: 1.5;
                    }
                    .brand {
                      margin-top: 2rem;
                      opacity: 0.5;
                      font-size: 0.8rem;
                      letter-spacing: 0.05em;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </div>
                    <h1>${title}</h1>
                    <p>${message}</p>
                    <div class="brand">BERGET</div>
                  </div>
                </body>
              </html>
            `

            if (error) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(errorPage('Authentication Failed', String(parsedUrl.query.error_description || error)))
              server.close()
              resolve({ success: false, error })
              return
            }

            if (receivedState !== state) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
              res.end(errorPage('Authentication Failed', 'Invalid state parameter. Please try again.'))
              server.close()
              resolve({ success: false, error: 'Invalid state parameter' })
              return
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`
              <!DOCTYPE html>
              <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Berget - Authentication Successful</title>
                  <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      min-height: 100vh;
                      background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
                      color: #fff;
                    }
                    .container {
                      text-align: center;
                      padding: 3rem;
                      max-width: 400px;
                    }
                    .icon {
                      width: 80px;
                      height: 80px;
                      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
                      border-radius: 50%;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      margin: 0 auto 1.5rem;
                      box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
                    }
                    .icon svg {
                      width: 40px;
                      height: 40px;
                      stroke: #fff;
                      stroke-width: 3;
                    }
                    h1 {
                      font-size: 1.5rem;
                      font-weight: 600;
                      margin-bottom: 0.75rem;
                      color: #fff;
                    }
                    p {
                      color: #94a3b8;
                      font-size: 0.95rem;
                      line-height: 1.5;
                    }
                    .brand {
                      margin-top: 2rem;
                      opacity: 0.5;
                      font-size: 0.8rem;
                      letter-spacing: 0.05em;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <h1>Authentication Successful</h1>
                    <p>You can close this window and return to your terminal.</p>
                    <div class="brand">BERGET</div>
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
