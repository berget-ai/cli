import type { ApiKeyServicePort, AuthServicePort, SeatStatusPort } from './ports/auth-services.js';
import type { FileStore } from './ports/file-store.js';
import type { Prompter } from './ports/prompter.js';

import { decodeJwtPayload, extractJwtExpiresAt, isTokenExpired } from '../../auth/jwt.js';
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

const TOOL_NAMES = {
  opencode: 'OpenCode',
  pi: 'Pi',
} as const;

/**
 * Tool-specific login instructions. Authentication is ALWAYS performed by the
 * tool itself (OpenCode /connect, Pi /login) — never by writing the tool's
 * private auth store from the CLI. OpenCode V2 moved its credential store and
 * silently ignores the V1 auth.json we used to write; delegating login to the
 * tool is the only version-proof contract, and gives each tool its own
 * Keycloak session (no shared refresh tokens).
 */
const SUBSCRIPTION_LOGIN_INSTRUCTIONS = {
  opencode: 'Run `opencode`, type `/connect` and choose "Login with Berget".',
  pi: 'Run `pi`, type `/login` and choose "Use a subscription" → "Berget AI".',
} as const;

const API_KEY_LOGIN_INSTRUCTIONS = {
  opencode:
    'Run `opencode`, type `/connect` and choose "Enter Berget API Key manually",\nor set the BERGET_API_KEY environment variable.',
  pi: 'Run `pi`, type `/login` and paste the key,\nor set the BERGET_API_KEY environment variable.',
} as const;

export async function configureAuth(
  deps: Pick<AuthDeps, 'apiKeyService' | 'files' | 'homeDir' | 'prompter' | 'seatStatusService'>,
  tool: 'opencode' | 'pi',
  cliAuth: CliAuth | null,
): Promise<AuthResult> {
  const { apiKeyService, files, homeDir, prompter } = deps;

  const alreadyAuth = await isToolAuthenticated(files, homeDir, tool);

  if (alreadyAuth) {
    const choice = await prompter.select<'keep' | 'reconfigure'>({
      message: `Account is already connected to Berget AI (${TOOL_NAMES[tool]}). How do you want to proceed?`,
      options: [
        { label: 'Keep existing authentication', value: 'keep' },
        { label: 'Reconfigure — choose a different method', value: 'reconfigure' },
      ],
    });

    if (choice === 'keep') {
      return { authenticated: true };
    }
    // Reconfigure: drop the stale entry so the tool falls back cleanly to its
    // own login flow instead of retrying a potentially dead credential.
    await removeToolAuth(files, homeDir, tool);
  } else if (cliAuth !== null) {
    prompter.note('Authentication required to use Berget AI.', 'Connect your account');
  }

  if (cliAuth === null) {
    return { authenticated: false };
  }

  const jwtPayload = decodeJwtPayload(cliAuth.access_token);

  if (!jwtPayload) {
    return handleUnverifiedAuth(prompter, tool);
  }

  // Resolve the seat from the API's canonical source (berget.seat via
  // /v1/auth/status) — NOT from JWT roles, which are legacy duplicated state
  // and drift (e.g. a stale berget_code_seat role on a Summit subscriber).
  const seatStatus = await deps.seatStatusService.fetchSeatStatus(cliAuth.access_token);

  if (seatStatus === null) {
    // Status could not be verified (network/5xx) — instruct, don't guess.
    return handleUnverifiedAuth(prompter, tool);
  }

  if (seatStatus.seatId != null || seatStatus.tier != null) {
    return handleHasSeat(prompter, apiKeyService, tool, seatStatus.tier);
  }

  return handleNoSeat(prompter, apiKeyService, tool);
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

  const method = await prompter.select<'browser' | 'device'>({
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

  // The device flow prints its QR/link to stdout — a running clack spinner
  // repaints every ~80ms and would erase it. Only the browser path gets a
  // spinner; the device flow logs completion via the prompter instead.
  if (method === 'device') {
    prompter.log('step', 'Sign in using the QR or link shown below.');
  } else {
    const s = prompter.spinner();
    s.start('Waiting for browser login...');

    const loginResult = await authService.loginInteractive({
      debug: process.env.LOG_LEVEL === 'debug',
      method,
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

  const loginResult = await authService.loginInteractive({
    debug: process.env.LOG_LEVEL === 'debug',
    method,
  });
  if (!loginResult.success) {
    prompter.log(
      'error',
      `${loginResult.error || 'Login timed out or was cancelled.'}\n\nPlease run \`berget auth login\` manually, then run \`berget code init\` again.`,
    );
    return null;
  }

  prompter.log('info', 'Successfully logged in to Berget.');

  const jwtExpiresAt = extractJwtExpiresAt(loginResult.accessToken!);
  if (jwtExpiresAt === 0) {
    prompter.log('error', 'Login succeeded but received invalid token.');
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

/**
 * Removes the `berget` entry from the tool's auth file, preserving any other
 * providers. Used when the user explicitly asks to reconfigure.
 */
export async function removeToolAuth(
  files: FileStore,
  homeDir: string,
  tool: 'opencode' | 'pi',
): Promise<void> {
  const authPath = TOOL_AUTH_PATHS[tool](homeDir);

  const content = await files.readFile(authPath);
  if (!content) return;

  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return;
  }

  if (!('berget' in existing)) return;

  const { berget: _removed, ...remaining } = existing;
  await files.writeFile(authPath, JSON.stringify(remaining, null, 2) + '\n');
  await files.chmod(authPath, 0o600);
}

async function createApiKey(
  prompter: Prompter,
  apiKeyService: ApiKeyServicePort,
  tool: 'opencode' | 'pi',
): Promise<AuthResult> {
  const s = prompter.spinner();
  s.start('Creating API key...');
  let key: string;
  try {
    ({ key } = await apiKeyService.create({
      description: 'Created by berget code init',
      name: `${TOOL_NAMES[tool]} (created by berget CLI)`,
    }));
  } catch (error: any) {
    s.stop('API key creation failed.');
    throw new FatalError(
      error?.message ||
        'Could not create API key. Please create one manually with `berget api-keys create`.',
    );
  }
  s.stop('API key created.');

  prompter.note(
    `${key}\n\nThis key is shown once. To use it:\n${API_KEY_LOGIN_INSTRUCTIONS[tool]}`,
    'Your API key',
  );
  return { authenticated: false };
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
  tool: 'opencode' | 'pi',
  tier: null | string,
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
    prompter.note(
      `Your ${tierLabel} seat is ready. To connect ${TOOL_NAMES[tool]}:\n${SUBSCRIPTION_LOGIN_INSTRUCTIONS[tool]}`,
      'One last step',
    );
    return { authenticated: false };
  }

  return createApiKey(prompter, apiKeyService, tool);
}

async function handleNoSeat(
  prompter: Prompter,
  apiKeyService: ApiKeyServicePort,
  tool: 'opencode' | 'pi',
): Promise<AuthResult> {
  const shouldCreate = await prompter.confirm({
    initialValue: true,
    message: 'You do not have a Berget subscription. Would you like to create a new API key?',
  });

  if (shouldCreate) {
    return createApiKey(prompter, apiKeyService, tool);
  }

  prompter.note(
    'Authentication skipped. You\'ll need to set up authentication manually:\n1. Run: berget api-keys create --name "My Key"\n2. Set BERGET_API_KEY environment variable, or\n3. Run `berget auth login` and try again',
    'Authentication',
  );
  return { authenticated: false };
}

async function handleUnverifiedAuth(
  prompter: Prompter,
  tool: 'opencode' | 'pi',
): Promise<AuthResult> {
  prompter.note(
    `Could not verify your subscription status.\nIf you have a Berget subscription:\n${SUBSCRIPTION_LOGIN_INSTRUCTIONS[tool]}\n\nIf you do not have a subscription, create an API key with \`berget api-keys create\`.`,
    'Authentication',
  );
  return { authenticated: false };
}
