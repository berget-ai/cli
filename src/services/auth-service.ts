import { createAuthenticatedClient, saveAuthToken, apiClient } from '../client'
import open from 'open'
import * as readline from 'readline'
import * as http from 'http'
import * as url from 'url'

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
      console.log('... loggar in med BankID')

      // Starta en lokal server för att ta emot callback från OAuth
      const server = http.createServer();
      const port = 3000;
      
      // Skapa en Promise som kommer att lösas när autentiseringen är klar
      const authPromise = new Promise<string>((resolve, reject) => {
        server.on('request', (req, res) => {
          const parsedUrl = url.parse(req.url || '', true);
          
          if (parsedUrl.pathname === '/callback') {
            // Hämta token från query parameters
            const token = parsedUrl.query.token as string;
            
            if (token) {
              // Skicka en bekräftelsesida till användaren
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Inloggning lyckades!</h1><p>Du kan nu stänga detta fönster och återgå till terminalen.</p></body></html>');
              
              // Lös Promise med token
              resolve(token);
              
              // Stäng servern efter en kort fördröjning
              setTimeout(() => server.close(), 1000);
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Inloggning misslyckades</h1><p>Ingen token mottogs.</p></body></html>');
              reject(new Error('No token received'));
            }
          } else {
            res.writeHead(404);
            res.end();
          }
        });
      });
      
      // Starta servern
      server.listen(port);
      
      // Initiera OAuth-flödet genom att öppna webbläsaren
      await open(`https://api.berget.ai/auth/github?redirect_uri=http://localhost:${port}/callback`);
      
      console.log('Öppnar webbläsaren för BankID-autentisering...');
      console.log('Väntar på att autentiseringen ska slutföras...');
      
      // Vänta på att autentiseringen ska slutföras
      const token = await authPromise;
      
      // Spara token
      saveAuthToken(token);
      
      console.log('✓ Successfully logged in to Berget');
      return true;
    } catch (error) {
      console.error('Login failed:', error)
      return false
    }
  }

  public async isAuthenticated(): Promise<boolean> {
    try {
      // Call an API endpoint that requires authentication
      const { data, error } = await this.client.GET('/users/me')
      return !!data && !error
    } catch {
      return false
    }
  }
  
  public async getUserProfile() {
    try {
      const { data, error } = await this.client.GET('/users/me')
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      console.error('Failed to get user profile:', error)
      throw error
    }
  }
}
import { createAuthenticatedClient, saveAuthToken, apiClient } from '../client'
import open from 'open'
import * as readline from 'readline'
import * as http from 'http'
import * as url from 'url'

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
      console.log('... loggar in med BankID')

      // Starta en lokal server för att ta emot callback från OAuth
      const server = http.createServer();
      const port = 3000;
      
      // Skapa en Promise som kommer att lösas när autentiseringen är klar
      const authPromise = new Promise<string>((resolve, reject) => {
        server.on('request', (req, res) => {
          const parsedUrl = url.parse(req.url || '', true);
          
          if (parsedUrl.pathname === '/callback') {
            // Hämta token från query parameters
            const token = parsedUrl.query.token as string;
            
            if (token) {
              // Skicka en bekräftelsesida till användaren
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Inloggning lyckades!</h1><p>Du kan nu stänga detta fönster och återgå till terminalen.</p></body></html>');
              
              // Lös Promise med token
              resolve(token);
              
              // Stäng servern efter en kort fördröjning
              setTimeout(() => server.close(), 1000);
            } else {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<html><body><h1>Inloggning misslyckades</h1><p>Ingen token mottogs.</p></body></html>');
              reject(new Error('No token received'));
            }
          } else {
            res.writeHead(404);
            res.end();
          }
        });
      });
      
      // Starta servern
      server.listen(port);
      
      // Initiera OAuth-flödet genom att öppna webbläsaren
      await open(`https://api.berget.ai/auth/github?redirect_uri=http://localhost:${port}/callback`);
      
      console.log('Öppnar webbläsaren för BankID-autentisering...');
      console.log('Väntar på att autentiseringen ska slutföras...');
      
      // Vänta på att autentiseringen ska slutföras
      const token = await authPromise;
      
      // Spara token
      saveAuthToken(token);
      
      console.log('✓ Successfully logged in to Berget');
      return true;
    } catch (error) {
      console.error('Login failed:', error)
      return false
    }
  }

  public async isAuthenticated(): Promise<boolean> {
    try {
      // Call an API endpoint that requires authentication
      const { data, error } = await this.client.GET('/users/me')
      return !!data && !error
    } catch {
      return false
    }
  }
  
  public async getUserProfile() {
    try {
      const { data, error } = await this.client.GET('/users/me')
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      console.error('Failed to get user profile:', error)
      throw error
    }
  }
}
