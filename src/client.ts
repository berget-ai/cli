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

export const saveAuthToken = (accessToken: string, refreshToken: string, expiresIn: number = 3600): void => {
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
      if (typeof target[prop as keyof typeof target] === 'function' && 
          ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(String(prop))) {
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
          const result = await (target[prop as keyof typeof target] as Function)(...args)
          
          // If we get a 401 error, try to refresh the token and retry
          if (result.error && typeof result.error === 'object' && 
              (result.error.status === 401 || 
               (result.error.error && result.error.error.code === 'invalid_token'))) {
            
            if (tokenManager.getRefreshToken()) {
              const refreshed = await refreshAccessToken(tokenManager)
              if (refreshed) {
                // Update the Authorization header with the new token
                if (!args[1]) args[1] = {}
                if (!args[1].headers) args[1].headers = {}
                args[1].headers.Authorization = `Bearer ${tokenManager.getAccessToken()}`
                
                // Retry the request
                return await (target[prop as keyof typeof target] as Function)(...args)
              }
            }
          }
          
          return result
        }
      }
      
      // For other properties, just return the original
      return target[prop as keyof typeof target]
    }
  })
}

// Helper function to refresh the access token
async function refreshAccessToken(tokenManager: TokenManager): Promise<boolean> {
  try {
    const refreshToken = tokenManager.getRefreshToken()
    if (!refreshToken) return false
    
    // Create a basic client for the refresh request
    const client = createClient<paths>({
      baseUrl: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
    
    // Make the refresh token request
    const { data, error } = await client.POST('/v1/auth/refresh' as any, {
      body: { refresh_token: refreshToken }
    })
    
    if (error || !data) {
      console.warn(chalk.yellow('Failed to refresh authentication token. Please run `berget auth login` again.'))
      return false
    }
    
    // Update the token with proper type assertion
    const tokenData = data as { access_token: string, expires_in?: number };
    if (!tokenData.access_token) {
      console.warn(chalk.yellow('Invalid token response. Please run `berget auth login` again.'))
      return false
    }
    
    // Update the token
    tokenManager.updateAccessToken(tokenData.access_token, tokenData.expires_in || 3600)
    return true
  } catch (error) {
    console.warn(chalk.yellow('Failed to refresh authentication token. Please run `berget auth login` again.'))
    return false
  }
}
