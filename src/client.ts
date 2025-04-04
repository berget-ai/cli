import createClient from 'openapi-fetch'
import type { paths } from './types/api'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import chalk from 'chalk'
import { TokenManager } from './utils/token-manager'

// API Base URL
// Use --local flag to test against local API
const isLocalMode = process.argv.includes('--local')
const API_BASE_URL =
  process.env.BERGET_API_URL ||
  (isLocalMode ? 'http://localhost:3000' : 'https://api.berget.ai')

if (isLocalMode && !process.env.BERGET_API_URL) {
  console.log(chalk.yellow('Using local API endpoint: http://localhost:3000'))
}

// Create a typed client for the Berget API
export const apiClient = createClient<paths>({
  baseUrl: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// Authentication functions
export const getAuthToken = (): string | null => {
  const tokenManager = TokenManager.getInstance()
  return tokenManager.getAccessToken()
}

export const saveAuthToken = (
  accessToken: string,
  refreshToken: string,
  expiresIn: number = 3600
): void => {
  const tokenManager = TokenManager.getInstance()
  tokenManager.setTokens(accessToken, refreshToken, expiresIn)
}

export const clearAuthToken = (): void => {
  const tokenManager = TokenManager.getInstance()
  tokenManager.clearTokens()
}

// Create an authenticated client with refresh token support
export const createAuthenticatedClient = () => {
  const tokenManager = TokenManager.getInstance()

  if (!tokenManager.getAccessToken()) {
    console.warn(
      chalk.yellow(
        'No authentication token found. Please run `berget auth login` first.'
      )
    )
  }

  // Create the base client
  const client = createClient<paths>({
    baseUrl: API_BASE_URL,
    headers: tokenManager.getAccessToken()
      ? {
          Authorization: `Bearer ${tokenManager.getAccessToken()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }
      : {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
  })

  // Wrap the client to handle token refresh
  return new Proxy(client, {
    get(target, prop: string | symbol) {
      // For HTTP methods (GET, POST, etc.), add token refresh logic
      if (
        typeof target[prop as keyof typeof target] === 'function' &&
        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(String(prop))
      ) {
        return async (...args: any[]) => {
          // Check if token is expired before making the request
          if (tokenManager.isTokenExpired() && tokenManager.getRefreshToken()) {
            await refreshAccessToken(tokenManager)
          }

          // Update the Authorization header with the current token
          if (tokenManager.getAccessToken()) {
            if (!args[1]) args[1] = {}
            if (!args[1].headers) args[1].headers = {}
            args[1].headers.Authorization = `Bearer ${tokenManager.getAccessToken()}`
          }

          // Make the original request
          let result
          try {
            result = await (target[prop as keyof typeof target] as Function)(
              ...args
            )
          } catch (requestError) {
            if (process.argv.includes('--debug')) {
              console.log(
                chalk.red(
                  `DEBUG: Request error: ${
                    requestError instanceof Error
                      ? requestError.message
                      : String(requestError)
                  }`
                )
              )
            }
            return {
              error: {
                message: `Request failed: ${
                  requestError instanceof Error
                    ? requestError.message
                    : String(requestError)
                }`,
              },
            }
          }

          // If we get an auth error, try to refresh the token and retry
          if (result.error) {
            // Detect various forms of authentication errors
            const isAuthError =
              // Standard 401 Unauthorized
              (typeof result.error === 'object' && result.error.status === 401) ||
              // OAuth specific errors
              (result.error.error &&
                (result.error.error.code === 'invalid_token' ||
                 result.error.error.code === 'token_expired' ||
                 result.error.error.message === 'Invalid API key' ||
                 result.error.error.message?.toLowerCase().includes('token') ||
                 result.error.error.message?.toLowerCase().includes('unauthorized'))) ||
              // Message-based detection as fallback
              (typeof result.error === 'string' && 
                (result.error.toLowerCase().includes('unauthorized') ||
                 result.error.toLowerCase().includes('token') ||
                 result.error.toLowerCase().includes('auth')))

            if (isAuthError && tokenManager.getRefreshToken()) {
              if (process.argv.includes('--debug')) {
                console.log(
                  chalk.yellow(
                    'DEBUG: Auth error detected, attempting token refresh'
                  )
                )
                console.log(
                  chalk.yellow(
                    `DEBUG: Error details: ${JSON.stringify(
                      result.error,
                      null,
                      2
                    )}`
                  )
                )
              }

              const refreshed = await refreshAccessToken(tokenManager)
              if (refreshed) {
                if (process.argv.includes('--debug')) {
                  console.log(
                    chalk.green(
                      'DEBUG: Token refreshed successfully, retrying request'
                    )
                  )
                }

                // Update the Authorization header with the new token
                if (!args[1]) args[1] = {}
                if (!args[1].headers) args[1].headers = {}
                args[1].headers.Authorization = `Bearer ${tokenManager.getAccessToken()}`

                // Retry the request
                return await (target[prop as keyof typeof target] as Function)(
                  ...args
                )
              } else {
                if (process.argv.includes('--debug')) {
                  console.log(chalk.red('DEBUG: Token refresh failed'))
                }
                
                // Add a more helpful error message for users
                if (typeof result.error === 'object') {
                  result.error.userMessage = 'Your session has expired. Please run `berget auth login` to log in again.'
                }
              }
            }
          }

          return result
        }
      }

      // For other properties, just return the original
      return target[prop as keyof typeof target]
    },
  })
}

// Helper function to refresh the access token
async function refreshAccessToken(
  tokenManager: TokenManager
): Promise<boolean> {
  try {
    const refreshToken = tokenManager.getRefreshToken()
    if (!refreshToken) return false

    if (process.argv.includes('--debug')) {
      console.log(chalk.yellow('DEBUG: Attempting to refresh access token'))
    }

    // Use the apiClient directly for the refresh request
    const { data, error } = await apiClient.POST('/v1/auth/refresh', {
      body: { refresh_token: refreshToken },
    })

    // Handle errors from the refresh request
    if (error) {
      if (process.argv.includes('--debug')) {
        console.log(
          chalk.yellow(`DEBUG: Token refresh error: ${JSON.stringify(error)}`)
        )
      }

      // Check if the refresh token itself is expired or invalid
      const errorObj = typeof error === 'object' ? error : {}
      if (errorObj.status === 401 || errorObj.status === 403) {
        console.warn(
          chalk.yellow(
            'Your refresh token has expired. Please run `berget auth login` again.'
          )
        )
        // Clear tokens if unauthorized - they're invalid
        tokenManager.clearTokens()
      } else {
        console.warn(
          chalk.yellow(
            `Failed to refresh token: ${
              errorObj.status ? `${errorObj.status} ${errorObj.statusText || ''}` : 'Unknown error'
            }`
          )
        )
      }
      return false
    }

    // Validate the response data
    if (!data || !data.token) {
      console.warn(
        chalk.yellow(
          'Invalid token response. Please run `berget auth login` again.'
        )
      )
      return false
    }

    if (process.argv.includes('--debug')) {
      console.log(chalk.green('DEBUG: Token refreshed successfully'))
    }

    // Update the token
    tokenManager.updateAccessToken(
      data.token,
      data.expires_in || 3600
    )
    
    // If a new refresh token was provided, update that too
    if (data.refresh_token) {
      tokenManager.setTokens(data.token, data.refresh_token, data.expires_in || 3600)
      if (process.argv.includes('--debug')) {
        console.log(chalk.green('DEBUG: Refresh token also updated'))
      }
    }
    
    return true
  } catch (error) {
    console.warn(
      chalk.yellow(
        `Failed to refresh authentication token: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    )
    return false
  }
}
