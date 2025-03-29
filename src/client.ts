import createClient from 'openapi-fetch';
import type { paths } from './types/api';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';

// Configuration directory
const CONFIG_DIR = path.join(os.homedir(), '.berget');
const TOKEN_FILE = path.join(CONFIG_DIR, 'token.json');

// API Base URL
const API_BASE_URL = process.env.BERGET_API_URL || 'https://api.berget.ai';

// Create a typed client for the Berget API
export const apiClient = createClient<paths>({
  baseUrl: API_BASE_URL,
});

// Authentication functions
export const getAuthToken = (): string | null => {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      return tokenData.accessToken;
    }
  } catch (error) {
    console.error('Error reading auth token:', error);
  }
  return null;
};

export const saveAuthToken = (token: string): void => {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ accessToken: token }), 'utf8');
  } catch (error) {
    console.error('Error saving auth token:', error);
  }
};

export const clearAuthToken = (): void => {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch (error) {
    console.error('Error clearing auth token:', error);
  }
};

// Create an authenticated client
export const createAuthenticatedClient = () => {
  const token = getAuthToken();
  
  if (!token) {
    console.warn(chalk.yellow('No authentication token found. Please run `berget login` first.'));
  }
  
  return createClient<paths>({
    baseUrl: API_BASE_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
};
