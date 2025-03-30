import createClient from 'openapi-fetch'
import type { paths } from './types/api'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import chalk from 'chalk'

// Configuration directory
const CONFIG_DIR = path.join(os.homedir(), '.berget')
const TOKEN_FILE = path.join(CONFIG_DIR, 'token.json')

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
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'))
      return tokenData.accessToken
    }
  } catch (error) {
    console.error('Error reading auth token:', error)
  }
  return null
}

// Check if token is expired (JWT tokens have an exp claim)
export const isTokenExpired = (token: string): boolean => {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    const payload = JSON.parse(jsonPayload)

    // Check if token has expired
    if (payload.exp) {
      return payload.exp * 1000 < Date.now()
    }
  } catch (error) {
    // If we can't decode the token, assume it's expired
    return true
  }

  // If there's no exp claim, assume it's valid
  return false
}

export const saveAuthToken = (token: string): void => {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ accessToken: token }), 'utf8')
    // Set file permissions to be readable only by the owner
    fs.chmodSync(TOKEN_FILE, 0o600)
  } catch (error) {
    console.error('Error saving auth token:', error)
  }
}

export const clearAuthToken = (): void => {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE)
    }
  } catch (error) {
    console.error('Error clearing auth token:', error)
  }
}

// Create an authenticated client
export const createAuthenticatedClient = () => {
  const token = getAuthToken()
  if (!token) {
    console.warn(
      chalk.yellow(
        'No authentication token found. Please run `berget login` first.'
      )
    )
  } else if (isTokenExpired(token)) {
    console.warn(
      chalk.yellow(
        'Your authentication token has expired. Please run `berget login` to get a new token.'
      )
    )
    // Optionally clear the expired token
    clearAuthToken()
    return createClient<paths>({
      baseUrl: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  return createClient<paths>({
    baseUrl: API_BASE_URL,
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }
      : {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
  })
}
