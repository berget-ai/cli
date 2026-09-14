import QRCode from 'qrcode';

import type { AuthConfig } from '../types.js';
import type { BrowserAuthResult } from '../types.js';

import { logger, LogLevel } from '../../utils/logger.js';

const DEVICE_AUTHORIZATION_PATH = '/realms/berget/protocol/openid-connect/auth/device';
const TOKEN_PATH = '/realms/berget/protocol/openid-connect/token';
const DEVICE_FLOW_SCOPE = 'openid email profile offline_access device-email-otp';

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 30;

export interface DeviceFlowOptions {
  config: AuthConfig;
  debug?: boolean;
}

interface DeviceAuthorizationResponse {
  device_code: string;
  expires_in: number;
  interval?: number;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
}

interface DeviceTokenErrorResponse {
  error?: string;
  error_description?: string;
}

/**
 * Map a token response body to a result, or undefined when the body is an
 * RFC 8628 error (handled by {@link handlePollError}). Exported for tests.
 */
export function extractTokenResult(data: Record<string, unknown>): BrowserAuthResult | undefined {
  if (
    typeof data.access_token !== 'string' ||
    typeof data.expires_in !== 'number' ||
    typeof data.refresh_token !== 'string'
  ) {
    return undefined;
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token,
    success: true,
  };
}

/**
 * RFC 8628 token-poll error handling. Exported for tests.
 *
 * @returns `{ intervalSeconds }` to adjust polling (slow_down), or throws a
 *          user-readable Error for terminal states.
 */
export function handlePollError(
  errorData: DeviceTokenErrorResponse,
  intervalSeconds: number,
): { intervalSeconds?: number } {
  switch (errorData.error) {
    case 'authorization_pending': {
      return {};
    }
    case 'slow_down': {
      return {
        intervalSeconds: Math.min(
          intervalSeconds + DEFAULT_POLL_INTERVAL_SECONDS,
          MAX_POLL_INTERVAL_SECONDS,
        ),
      };
    }
    case 'access_denied': {
      throw new Error('Sign-in was denied on the other device.');
    }
    case 'expired_token': {
      throw new Error('The device code expired. Please try signing in again.');
    }
    default: {
      throw new Error(
        errorData.error_description
          ? `Device flow failed: ${errorData.error ?? 'unknown'} — ${errorData.error_description}`
          : `Device flow failed: ${errorData.error ?? 'unknown'}`,
      );
    }
  }
}

/**
 * Renders the QR matrix as half-block pairs: one character covers two
 * vertical modules using ▀/▄/█/space — square pixels in ~1:2 terminal cells.
 * Light blocks on the terminal's dark background.
 */
export function renderTerminalQrCode(data: string): string {
  const code = QRCode.create(data, { errorCorrectionLevel: 'L' });
  const size = code.modules.size;
  const quiet = 2;
  const total = size + quiet * 2;

  const moduleAt = (row: number, col: number): number => {
    const qrRow = row - quiet;
    const qrCol = col - quiet;
    if (qrRow < 0 || qrRow >= size || qrCol < 0 || qrCol >= size) {
      return 0;
    }
    return code.modules.get(qrRow, qrCol) === 1 ? 1 : 0;
  };

  const lines: string[] = [];
  for (let r = 0; r < total; r += 2) {
    let line = '  ';
    for (let c = 0; c < total; c += 1) {
      const top = moduleAt(r, c) === 1;
      const bottom = moduleAt(r + 1, c) === 1;
      if (top && bottom) {
        line += '█';
      } else if (top) {
        line += '▀';
      } else if (bottom) {
        line += '▄';
      } else {
        line += ' ';
      }
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * Run the OAuth 2.0 Device Authorization Grant (RFC 8628): request a
 * device/user code pair, show a QR + the verification link in the terminal,
 * then poll the token endpoint until the user approves, denies, or the code
 * expires.
 */
export async function startDeviceFlow(options: DeviceFlowOptions): Promise<BrowserAuthResult> {
  const debug = options.debug || logger.getLogLevel() >= LogLevel.DEBUG;
  const baseUrl = `https://${new URL(options.config.keycloakUrl).host}`;

  let deviceInfo: DeviceAuthorizationResponse;
  try {
    const response = await fetch(`${baseUrl}${DEVICE_AUTHORIZATION_PATH}`, {
      body: new URLSearchParams({
        client_id: options.config.clientId,
        scope: DEVICE_FLOW_SCOPE,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.debug(`Device authorization failed: ${errorText}`);
      throw new Error(`Keycloak rejected device authorization (${String(response.status)})`);
    }

    deviceInfo = (await response.json()) as DeviceAuthorizationResponse;
  } catch (error) {
    return {
      error: `Failed to start device flow: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
    };
  }

  const verificationUri = deviceInfo.verification_uri_complete ?? deviceInfo.verification_uri;

  console.log('');
  console.log('  Scan with your phone, or open this link — the code is included:');
  console.log(`  ${verificationUri}`);
  console.log('');
  console.log(renderTerminalQrCode(verificationUri));
  console.log('');
  console.log(`  Or enter the code manually: ${deviceInfo.user_code}`);
  console.log(`  Valid for ${Math.round(deviceInfo.expires_in / 60)} minutes.`);
  console.log('');
  console.log('  Waiting for approval...');

  return pollForTokens({ baseUrl, clientId: options.config.clientId, debug, deviceInfo });
}

/**
 * Single token poll request. Returns undefined on transport errors or
 * non-JSON bodies (e.g. a 502 HTML page from a gateway in front of Keycloak)
 * so the caller keeps retrying until the deadline.
 */
async function fetchTokenPollBody(
  baseUrl: string,
  clientId: string,
  deviceInfo: DeviceAuthorizationResponse,
): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await fetch(`${baseUrl}${TOKEN_PATH}`, {
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceInfo.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function pollForTokens(input: {
  baseUrl: string;
  clientId: string;
  debug: boolean;
  deviceInfo: DeviceAuthorizationResponse;
}): Promise<BrowserAuthResult> {
  const { baseUrl, clientId, deviceInfo } = input;
  const deadline = Date.now() + deviceInfo.expires_in * 1000;
  let intervalSeconds = deviceInfo.interval ?? DEFAULT_POLL_INTERVAL_SECONDS;

  while (Date.now() < deadline) {
    await sleep(intervalSeconds * 1000);

    const data = await fetchTokenPollBody(baseUrl, clientId, deviceInfo);
    if (!data) {
      logger.debug('Token poll returned no body, retrying');
      continue;
    }

    const result = extractTokenResult(data);
    if (result) {
      if (input.debug) {
        logger.debug('Device flow: tokens received');
      }
      return result;
    }

    const action = handlePollError(data as unknown as DeviceTokenErrorResponse, intervalSeconds);
    if (action.intervalSeconds !== undefined) {
      intervalSeconds = action.intervalSeconds;
    }
  }

  return { error: 'Authentication timed out. Please try signing in again.', success: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
