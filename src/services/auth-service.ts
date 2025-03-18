import { createAuthenticatedClient, saveAuthToken } from '../client';
import * as open from 'open';

export class AuthService {
  private static instance: AuthService;
  private client = createAuthenticatedClient();

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async login(): Promise<boolean> {
    try {
      console.log('... loggar in med BankID');
      
      // In a real implementation, this would:
      // 1. Call the API to initiate BankID authentication
      // 2. Open the user's browser to complete authentication
      // 3. Wait for the callback with the token
      
      // For demo purposes, we'll simulate a successful login
      const mockToken = 'berget_' + Math.random().toString(36).substring(2, 15);
      saveAuthToken(mockToken);
      
      console.log('✓ Successfully logged in to Berget');
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  public async isAuthenticated(): Promise<boolean> {
    try {
      // Call an API endpoint that requires authentication
      const { data, error } = await this.client.GET('/users/me');
      return !!data && !error;
    } catch {
      return false;
    }
  }
}
