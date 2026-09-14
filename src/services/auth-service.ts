import * as p from '@clack/prompts';
import chalk from 'chalk';

import { getAuthConfig } from '../auth/config.js';
import { getConfiguration } from '../auth/issuer.js';
import { extractJwtExpiresAt } from '../auth/jwt.js';
import { startDeviceFlow } from '../auth/oauth/device-flow.js';
import { startPkceFlow } from '../auth/oauth/pkce-flow.js';
import { FileTokenStore } from '../auth/storage/token-store.js';
import { createAuthenticatedClient } from '../client.js';
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure.js';
import { handleError } from '../utils/error-handler.js';

/**
 * Service for authentication operations
 * Command group: auth
 */
export class AuthService {
  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.AUTH;

  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.AUTH;

  private static instance: AuthService;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Browser-based PKCE login for interactive CLI use.
   * Prints status to stdout/stderr. Use loginInteractive() when you need
   * a silent, UI-agnostic result (e.g. inside the setup wizard).
   */
  public async login(options?: {
    debug?: boolean;
    method?: 'browser' | 'device';
    stage?: boolean;
  }): Promise<boolean> {
    try {
      // Interactive default: ask how to sign in (non-TTY and explicit
      // --device skip the prompt).
      let method = options?.method;
      if (!method && process.stdin.isTTY) {
        const choice = await p.select<'browser' | 'device'>({
          message: 'How do you want to sign in?',
          options: [
            { label: 'Login using this device', value: 'browser' },
            {
              hint: 'Scan a code with your phone — for SSH/headless machines',
              label: 'Login using other device with QR',
              value: 'device',
            },
          ],
        });
        if (p.isCancel(choice)) {
          console.log(chalk.yellow('\nLogin cancelled.'));
          return false;
        }
        method = choice as 'browser' | 'device';
      }

      const result = await this.loginInteractive({ ...options, method });

      if (!result.success) {
        console.log(chalk.red(`\nAuthentication failed: ${result.error || 'Unknown error'}`));
        return false;
      }

      console.log(chalk.green('\n✓ Successfully logged in to Berget'));

      try {
        const profile = await this.whoami();
        if (profile?.email) {
          console.log(chalk.green(`Logged in as ${profile.name || profile.email}`));
        }
      } catch {
        // Ignore errors fetching profile
      }

      console.log(chalk.cyan('\nNext steps:'));
      console.log(chalk.cyan('  • Create an API key: berget api-keys create'));
      console.log(chalk.cyan('  • Initialize OpenCode: berget code init'));

      return true;
    } catch (error) {
      handleError('Login failed', error);
      return false;
    }
  }

  /**
   * Browser-based PKCE login for wizard / programmatic use.
   * Does NOT print to stdout — returns tokens so callers can display
   * their own UI (e.g. via clack/prompts).
   */
  public async loginInteractive(options?: {
    debug?: boolean;
    /** Force a login method; default: browser PKCE. */
    method?: 'browser' | 'device';
    stage?: boolean;
  }): Promise<{
    accessToken?: string;
    error?: string;
    expiresIn?: number;
    refreshToken?: string;
    success: boolean;
  }> {
    try {
      const config = getAuthConfig(options);
      const authResult =
        options?.method === 'device'
          ? await startDeviceFlow({ config, debug: options?.debug })
          : await (async () => {
              const configuration = await getConfiguration(config);
              return startPkceFlow({ config: configuration, debug: options?.debug });
            })();
      const result = authResult;

      if (result.success && result.accessToken && result.refreshToken) {
        const tokenStore = new FileTokenStore();
        const jwtExpiresAt = extractJwtExpiresAt(result.accessToken);
        const expiresAt =
          jwtExpiresAt > 0 ? jwtExpiresAt : Date.now() + (result.expiresIn || 3600) * 1000;
        await tokenStore.set({
          access_token: result.accessToken,
          expires_at: expiresAt,
          refresh_token: result.refreshToken,
        });
      }

      return result;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        success: false,
      };
    }
  }

  public async whoami(): Promise<any> {
    try {
      const client = createAuthenticatedClient();
      const { data: profile, error } = await client.GET('/v1/users/me');
      if (error) {
        return null;
      }
      return profile;
    } catch {
      return null;
    }
  }
}
