import { createAuthenticatedClient, saveAuthToken, clearAuthToken } from "../client";
import chalk from "chalk";
import { handleError } from "../utils/error-handler";
import { COMMAND_GROUPS, SUBCOMMANDS } from "../constants/command-structure";
import { BrowserAuth } from "./browser-auth";

// Keycloak configuration based on environment
const isStageMode = process.argv.includes("--stage");
const isLocalMode = process.argv.includes("--local");
const KEYCLOAK_URL =
  isStageMode || isLocalMode ? "https://keycloak.stage.berget.ai" : "https://keycloak.berget.ai";
const KEYCLOAK_REALM = "berget";
const KEYCLOAK_CLIENT_ID = "berget-code";
const CALLBACK_PORT = 8787;

function makeBrowserAuth(debug?: boolean): BrowserAuth {
  return new BrowserAuth({
    keycloakUrl: KEYCLOAK_URL,
    realm: KEYCLOAK_REALM,
    clientId: KEYCLOAK_CLIENT_ID,
    callbackPort: CALLBACK_PORT,
    debug,
  });
}

/**
 * Service for authentication operations
 * Command group: auth
 */
export class AuthService {
  private static instance: AuthService;

  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.AUTH;

  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.AUTH;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async whoami(): Promise<any> {
    try {
      // Create fresh client to ensure we have the latest token
      const client = createAuthenticatedClient();
      const { data: profile, error } = await client.GET("/v1/users/me");
      if (error) {
        return null;
      }
      return profile;
    } catch (error) {
      return null;
    }
  }

  /**
   * Browser-based PKCE login for interactive CLI use.
   * Prints status to stdout/stderr. Use loginInteractive() when you need
   * a silent, UI-agnostic result (e.g. inside the setup wizard).
   */
  public async login(): Promise<boolean> {
    try {
      clearAuthToken();

      console.log(chalk.blue("Initiating login process..."));

      const auth = makeBrowserAuth(process.argv.includes("--debug"));
      const result = await auth.start();

      if (!result.success) {
        console.log(chalk.red(`\nAuthentication failed: ${result.error || "Unknown error"}`));
        return false;
      }

      saveAuthToken(result.accessToken!, result.refreshToken!, result.expiresIn!);

      if (process.argv.includes("--debug")) {
        console.log(chalk.yellow("DEBUG: Token data received:"));
        console.log(
          chalk.yellow(
            JSON.stringify(
              {
                expires_in: result.expiresIn,
              },
              null,
              2
            )
          )
        );
      }

      console.log(chalk.green("\n✓ Successfully logged in to Berget"));

      try {
        const profile = await this.whoami();
        if (profile?.email) {
          console.log(chalk.green(`Logged in as ${profile.name || profile.email}`));
        }
      } catch {
        // Ignore errors fetching profile
      }

      console.log(chalk.cyan("\nNext steps:"));
      console.log(chalk.cyan("  • Create an API key: berget api-keys create"));
      console.log(chalk.cyan("  • Setup OpenCode: berget code init"));

      return true;
    } catch (error) {
      handleError("Login failed", error);
      return false;
    }
  }

  /**
   * Browser-based PKCE login for wizard / programmatic use.
   * Does NOT print to stdout — returns tokens so callers can display
   * their own UI (e.g. via clack/prompts).
   */
  public async loginInteractive(): Promise<{
    success: boolean;
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    error?: string;
  }> {
    try {
      clearAuthToken();

      const auth = makeBrowserAuth(process.argv.includes("--debug"));
      const result = await auth.start();

      if (result.success) {
        saveAuthToken(result.accessToken!, result.refreshToken!, result.expiresIn!);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
