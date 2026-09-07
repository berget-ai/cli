import type {
  ApiKeyServicePort,
  AuthServicePort,
  SeatStatusPort,
} from './ports/auth-services.js';
import type { FileStore } from './ports/file-store.js';
import type { Prompter } from './ports/prompter.js';

import {
  decodeJwtPayload,
  extractJwtExpiresAt,
  isTokenExpired,
} from '../../auth/jwt.js';
import { logger } from '../../utils/logger.js';
import { FatalError } from './errors.js';
import { getOpencodeAuthPath, getPiAuthPath } from './xdg-paths.js';

export interface AuthDeps {
  apiKeyService: ApiKeyServicePort;
  authService: AuthServicePort;
  files: FileStore;
  homeDir: string;
  prompter: Prompter;
  seatStatusService: SeatStatusPort;
}

export interface AuthResult {
  authenticated: boolean;
}

export interface CliAuth {
  access_token: string;
  expires_at: number;
  refresh_token: string;
}

const CLI_AUTH_PATH = (homeDir: string) => homeDir + '/.berget/auth.json';

const TOOL_AUTH_PATHS = {
  opencode: getOpencodeAuthPath,
  pi: getPiAuthPath,
} as const;

const TOOL_API_KEY_TYPES: Record<'opencode' | 'pi', string> = {
  opencode: 'api',
  pi: 'api_key',
};

export async function configureAuth(
  deps: Pick<AuthDeps, 'apiKeyService' | 'files' | 'homeDir' | 'prompter' | 'seatStatusService'>,
  tool: 'opencode' | 'pi',
  cliAuth: CliAuth | null,
): Promise<AuthResult> {
  const { apiKeyService, files, homeDir, prompter } = deps;

  const alreadyAuth = await isToolAuthenticated(files, homeDir, tool);

  if (alreadyAuth) {
    const choice = await prompter.select<'keep' | 'reconfigure'>({
      message: `Account is already connected to Berget AI (${tool === 'opencode' ? 'OpenCode' : 'Pi'}). How do you want to proceed?`,
      options: [
        { label: 'Keep existing authentication', value: 'keep' },
        { label: 'Reconfigure — choose a different method', value: 'reconfigure' },
      ],
    });

    if (choice === 'keep') {
      return { authenticated: true };
    }
    // Fall through to reconfigure
  } else if (cliAuth !== null) {
    prompter.note('Authentication required to use Berget AI.', 'Connect your account');
  }

  if (cliAuth === null) {
    return { authenticated: false };
  }

  const jwtPayload = decodeJwtPayload(cliAuth.access_token);

  if (!jwtPayload) {
    return handleUnverifiedAuth(prompter, files, homeDir, tool, cliAuth);
  }

  // Resolve the seat from the API's canonical source (berget.seat via
  // /v1/auth/status) — NOT from JWT roles, which are legacy duplicated state
  // and drift (e.g. a stale berget_code_seat role on a Summit subscriber).
  const seatStatus = await deps.seatStatusService.fetchSeatStatus(cliAuth.access_token);

  if (seatStatus === null) {
    // Status could not be verified (network/5xx) — proceed with the OAuth
    // sync and a warning, same as the undecodable-JWT path.
    return handleUnverifiedAuth(prompter, files, homeDir, tool, cliAuth);
  }

  if (seatStatus.seatId != null || seatStatus.tier != null) {
    return handleHasSeat(prompter, apiKeyService, files, homeDir, tool, cliAuth, seatStatus.tier);
  }

  return handleNoSeat(prompter, apiKeyService, files, homeDir, tool);
}

export async function ensureCliAuth(
  deps: Pick<AuthDeps, 'authService' | 'files' | 'homeDir' | 'prompter'>,
): Promise<CliAuth | null> {
  const { authService, files, homeDir, prompter } = deps;

  const cliAuth: CliAuth | null = await readCliAuth(files, homeDir);

  if (cliAuth && !isTokenExpired(cliAuth.expires_at)) {
    return cliAuth;
  }

  prompter.note('Authentication required to use Berget AI.', 'Connect your account');

  const s = prompter.spinner();
  s.start('Waiting for browser login...');

  const loginResult = await authService.loginInteractive({
    debug: process.env.LOG_LEVEL === 'debug',
  });
  if (!loginResult.success) {
    s.stop('Login failed.');
    prompter.note(
      `${loginResult.error || 'Login timed out or was cancelled.'}\n\nPlease run \`berget auth login\` manually, then run \`berget code init\` again.`,
      'Authentication Failed',
    );
    return null;
  }

  s.stop('Successfully logged in to Berget.');

  const jwtExpiresAt = extractJwtExpiresAt(loginResult.accessToken!);
  if (jwtExpiresAt === 0) {
    s.stop('Login succeeded but received invalid token.');
    prompter.note('Please try logging in again or contact support.', 'Authentication Error');
    return null;
  }

  return {
    access_token: loginResult.accessToken!,
    expires_at: jwtExpiresAt,
    refresh_token: loginResult.refreshToken!,
  };
}

export async function isToolAuthenticated(
  files: FileStore,
  homeDir: string,
  tool: 'opencode' | 'pi',
): Promise<boolean> {
  const content = await files.readFile(TOOL_AUTH_PATHS[tool](homeDir));
  if (!content) return false;
  try {
    const parsed = JSON.parse(content);
    return typeof parsed.berget === 'object' && parsed.berget !== null;
  } catch {
    return false;
  }
}

export async function readCliAuth(files: FileStore, homeDir: string): Promise<CliAuth | null> {
  const content = await files.readFile(CLI_AUTH_PATH(homeDir));
  if (!content) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    logger.warn(
      `CLI auth file appears corrupted. Run \`berget auth login\` to re-authenticate.`,
      String(error),
    );
    return null;
  }
  if (parsed.access_token && parsed.refresh_token) {
    // Extract the actual expiry time from the JWT token instead of using the stored expires_at
    const jwtExpiresAt = extractJwtExpiresAt(parsed.access_token);
    if (jwtExpiresAt === 0) {
      // Invalid token, return null
      return null;
    }
    return {
      access_token: parsed.access_token,
      expires_at: jwtExpiresAt,
      refresh_token: parsed.refresh_token,
    };
  }
  return null;
}

export async function syncApiKeyToTool(
  files: FileStore,
  homeDir: string,
  tool: 'opencode' | 'pi',
  apiKey: string,
): Promise<void> {
  const authPath = TOOL_AUTH_PATHS[tool](homeDir);
  let existing: Record<string, unknown> = {};

  const content = await files.readFile(authPath);
  if (content) {
    try {
      existing = JSON.parse(content) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  const updated = {
    ...existing,
    berget: {
      key: apiKey,
      type: TOOL_API_KEY_TYPES[tool],
    },
  };

  await files.writeFile(authPath, JSON.stringify(updated, null, 2) + '\n');
  await files.chmod(authPath, 0o600);
}

export async function syncOAuthToTool(
  files: FileStore,
  homeDir: string,
  tool: 'opencode' | 'pi',
  cliAuth: CliAuth,
): Promise<void> {
  const authPath = TOOL_AUTH_PATHS[tool](homeDir);
  let existing: Record<string, unknown> = {};

  const content = await files.readFile(authPath);
  if (content) {
    try {
      existing = JSON.parse(content) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  // Use the JWT's actual expiry time for consistency
  const jwtExpiresAt = extractJwtExpiresAt(cliAuth.access_token);

  const updated = {
    ...existing,
    berget: {
      access: cliAuth.access_token,
      expires: jwtExpiresAt,
      refresh: cliAuth.refresh_token,
      type: 'oauth',
    },
  };

  await files.writeFile(authPath, JSON.stringify(updated, null, 2) + '\n');
  await files.chmod(authPath, 0o600);
}

async function createAndSyncApiKey(
  prompter: Prompter,
  apiKeyService: ApiKeyServicePort,
  files: FileStore,
  homeDir: string,
  tool: 'opencode' | 'pi',
): Promise<AuthResult> {
  const s = prompter.spinner();
  s.start('Creating API key...');
  try {
    const { key } = await apiKeyService.create({
      description: 'Created by berget code init',
      name: `${tool === 'opencode' ? 'OpenCode' : 'Pi'} (created by berget CLI)`,
    });
    await syncApiKeyToTool(files, homeDir, tool, key);
    s.stop('API key created and saved.');
    return { authenticated: true };
  } catch (error: any) {
    s.stop('API key creation failed.');
    throw new FatalError(
      error?.message ||
        'Could not create API key. Please create one manually with `berget api-keys create`.',
    );
  }
}

const TIER_LABELS: Record<string, string> = {
  berget_code: 'Berget Code',
  seat_plan_mini: 'Berget Chat',
  seat_plan_pro: 'Berget Pro',
  seat_plan_summit: 'Berget Summit',
};

async function handleHasSeat(
  prompter: Prompter,
  apiKeyService: ApiKeyServicePort,
  files: FileStore,
  homeDir: string,
  tool: 'opencode' | 'pi',
  cliAuth: CliAuth,
  tier: string | null,
): Promise<AuthResult> {
  const tierLabel = (tier && TIER_LABELS[tier]) || 'Berget';
  const method = await prompter.select<'api_key' | 'subscription'>({
    message: `You have a ${tierLabel} subscription. How do you want to authenticate?`,
    options: [
      { label: `Use my ${tierLabel} subscription`, value: 'subscription' },
      { label: 'Use an API key instead', value: 'api_key' },
    ],
  });

  if (method === 'subscription') {
    const s = prompter.spinner();
    s.start('Authenticating with Berget AI via subscription...');
    try {
      await syncOAuthToTool(files, homeDir, tool, cliAuth);
      s.stop('Authenticated.');
    } catch (error) {
      s.stop('Authentication failed.');
      throw error;
    }
    return { authenticated: true };
  }

  return createAndSyncApiKey(prompter, apiKeyService, files, homeDir, tool);
}

async function handleNoSeat(
  prompter: Prompter,
  apiKeyService: ApiKeyServicePort,
  files: FileStore,
  homeDir: string,
  tool: 'opencode' | 'pi',
): Promise<AuthResult> {
  const shouldCreate = await prompter.confirm({
    initialValue: true,
    message: 'You do not have a Berget subscription. Would you like to create a new API key?',
  });

  if (shouldCreate) {
    return createAndSyncApiKey(prompter, apiKeyService, files, homeDir, tool);
  }

  prompter.note(
    'Authentication skipped. You\'ll need to set up authentication manually:\n1. Run: berget api-keys create --name "My Key"\n2. Set BERGET_API_KEY environment variable, or\n3. Run `berget auth login` and try again',
    'Authentication',
  );
  return { authenticated: false };
}

async function handleUnverifiedAuth(
  prompter: Prompter,
  files: FileStore,
  homeDir: string,
  tool: 'opencode' | 'pi',
  cliAuth: CliAuth,
): Promise<AuthResult> {
  const s = prompter.spinner();
  s.start('Authenticating with Berget AI...');
  try {
    await syncOAuthToTool(files, homeDir, tool, cliAuth);
    s.stop('Authenticated.');
  } catch (error) {
    s.stop('Authentication failed.');
    throw error;
  }
  prompter.note(
    'Warning: Could not verify your subscription status.\nIf you do not have a subscription, the tool may show an authorization error.',
    'Authentication',
  );
  return { authenticated: true };
}
