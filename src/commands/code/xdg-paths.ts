import * as path from 'node:path';

/**
 * Resolve the path to the OpenCode auth file.
 */
export function getOpencodeAuthPath(homeDir: string): string {
  return path.join(getOpencodeDataDir(homeDir), 'auth.json');
}

/**
 * Resolve the OpenCode global config directory.
 * Honors XDG_CONFIG_HOME, then falls back to ~/.config/opencode.
 * Also honors OPENCODE_CONFIG_DIR if set (highest priority).
 */
export function getOpencodeConfigDir(homeDir: string): string {
  const envDir = process.env.OPENCODE_CONFIG_DIR;
  if (envDir) {
    return envDir;
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  return path.join(xdgConfig || path.join(homeDir, '.config'), 'opencode');
}

/**
 * Resolve the OpenCode data directory (for auth.json, sessions, etc.).
 * Honors XDG_DATA_HOME, then falls back to ~/.local/share/opencode.
 */
export function getOpencodeDataDir(homeDir: string): string {
  const xdgData = process.env.XDG_DATA_HOME;
  return path.join(xdgData || path.join(homeDir, '.local', 'share'), 'opencode');
}

/**
 * Resolve the Pi agent base directory.
 * Honors `PI_CODING_AGENT_DIR` (tilde-expanded), else `~/.pi/agent`.
 */
export function getPiAgentDir(homeDir: string): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) {
    return expandTilde(envDir, homeDir);
  }
  return path.join(homeDir, '.pi', 'agent');
}

/**
 * Resolve the path to Pi's global auth.json.
 */
export function getPiAuthPath(homeDir: string): string {
  return path.join(getPiAgentDir(homeDir), 'auth.json');
}

/**
 * Resolve the path to Pi's global settings.json.
 */
export function getPiSettingsPath(homeDir: string): string {
  return path.join(getPiAgentDir(homeDir), 'settings.json');
}

/**
 * Resolve the path to the global opencode config file.
 * Honors OPENCODE_CONFIG (single-file override), then probes
 * OPENCODE_CONFIG_DIR / XDG_CONFIG_HOME / ~/.config.
 */
export async function resolveGlobalConfigPath(
  homeDir: string,
  exists: (p: string) => Promise<boolean>,
): Promise<string> {
  const envConfig = process.env.OPENCODE_CONFIG;
  if (envConfig) {
    return envConfig;
  }

  const configDir = getOpencodeConfigDir(homeDir);
  const jsoncPath = path.join(configDir, 'opencode.jsonc');
  const jsonPath = path.join(configDir, 'opencode.json');

  if (await exists(jsoncPath)) return jsoncPath;
  if (await exists(jsonPath)) return jsonPath;
  return jsonPath;
}

/**
 * Expand a leading tilde in a path to the user's home directory.
 * Pi's `PI_CODING_AGENT_DIR` env var is tilde-expanded.
 */
function expandTilde(input: string, homeDir: string): string {
  let expanded: string;
  if (input.startsWith('~/')) {
    expanded = path.join(homeDir, input.slice(2));
  } else if (input.startsWith('~\\')) {
    expanded = path.join(homeDir, input.slice(2));
  } else if (input === '~') {
    expanded = homeDir;
  } else {
    expanded = input;
  }
  // Normalize backslashes for cross-platform consistency
  return expanded.replace(/\\/g, '/');
}
