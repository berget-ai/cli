import createClient from 'openapi-fetch';
import type { paths } from './types/api';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Configuration directory
const CONFIG_DIR = path.join(os.homedir(), '.berget');
const TOKEN_FILE = path.join(CONFIG_DIR, 'token.json');

// Create a typed client for the Berget API
export const apiClient = createClient<paths>({
  baseUrl: 'https://api.berget.ai',
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

// Create an authenticated client
export const createAuthenticatedClient = () => {
  const token = getAuthToken();
  return createClient<paths>({
    baseUrl: 'https://api.berget.ai',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
};
