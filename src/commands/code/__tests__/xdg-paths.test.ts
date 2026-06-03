import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getOpencodeAuthPath,
  getOpencodeConfigDir,
  getOpencodeDataDir,
  getPiAgentDir,
  getPiAuthPath,
  getPiSettingsPath,
  resolveGlobalConfigPath,
} from '../xdg-paths.js';

const HOME = '/home/user';

describe('xdg-paths', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.OPENCODE_CONFIG;
    delete process.env.OPENCODE_CONFIG_DIR;
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_DATA_HOME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  /* ─── Pi paths ───────────────────────────────────────────────────────── */

  describe('getPiAgentDir', () => {
    it('defaults to ~/.pi/agent', () => {
      expect(getPiAgentDir(HOME)).toBe('/home/user/.pi/agent');
    });

    it('honors PI_CODING_AGENT_DIR', () => {
      process.env.PI_CODING_AGENT_DIR = '/custom/pi/dir';
      expect(getPiAgentDir(HOME)).toBe('/custom/pi/dir');
    });

    it('tilde-expands PI_CODING_AGENT_DIR', () => {
      process.env.PI_CODING_AGENT_DIR = '~/custom/pi';
      expect(getPiAgentDir(HOME)).toBe('/home/user/custom/pi');
    });

    it('tilde-expands Windows-style backslash', () => {
      process.env.PI_CODING_AGENT_DIR = '~\\custom\\pi';
      // On Unix the backslash is preserved in the remainder; on Windows path.join
      // produces backslashes. We verify tilde is expanded, not path normalization.
      expect(getPiAgentDir(HOME)).toMatch(/^\/home\/user[/\\]custom[/\\]pi$/);
    });

    it('handles bare tilde', () => {
      process.env.PI_CODING_AGENT_DIR = '~';
      expect(getPiAgentDir(HOME)).toBe('/home/user');
    });
  });

  describe('getPiAuthPath', () => {
    it('resolves to agentDir/auth.json', () => {
      expect(getPiAuthPath(HOME)).toBe('/home/user/.pi/agent/auth.json');
    });

    it('follows PI_CODING_AGENT_DIR override', () => {
      process.env.PI_CODING_AGENT_DIR = '/other/pi';
      expect(getPiAuthPath(HOME)).toBe('/other/pi/auth.json');
    });
  });

  describe('getPiSettingsPath', () => {
    it('resolves to agentDir/settings.json', () => {
      expect(getPiSettingsPath(HOME)).toBe('/home/user/.pi/agent/settings.json');
    });

    it('follows PI_CODING_AGENT_DIR override', () => {
      process.env.PI_CODING_AGENT_DIR = '/other/pi';
      expect(getPiSettingsPath(HOME)).toBe('/other/pi/settings.json');
    });
  });

  /* ─── OpenCode paths ─────────────────────────────────────────────────── */

  describe('getOpencodeConfigDir', () => {
    it('defaults to ~/.config/opencode', () => {
      expect(getOpencodeConfigDir(HOME)).toBe('/home/user/.config/opencode');
    });

    it('honors XDG_CONFIG_HOME', () => {
      process.env.XDG_CONFIG_HOME = '/custom/config';
      expect(getOpencodeConfigDir(HOME)).toBe('/custom/config/opencode');
    });

    it('prefers OPENCODE_CONFIG_DIR over XDG_CONFIG_HOME', () => {
      process.env.OPENCODE_CONFIG_DIR = '/oc/dir';
      process.env.XDG_CONFIG_HOME = '/xdg/config';
      expect(getOpencodeConfigDir(HOME)).toBe('/oc/dir');
    });
  });

  describe('getOpencodeDataDir', () => {
    it('defaults to ~/.local/share/opencode', () => {
      expect(getOpencodeDataDir(HOME)).toBe('/home/user/.local/share/opencode');
    });

    it('honors XDG_DATA_HOME', () => {
      process.env.XDG_DATA_HOME = '/custom/data';
      expect(getOpencodeDataDir(HOME)).toBe('/custom/data/opencode');
    });
  });

  describe('getOpencodeAuthPath', () => {
    it('resolves to dataDir/auth.json', () => {
      expect(getOpencodeAuthPath(HOME)).toBe('/home/user/.local/share/opencode/auth.json');
    });

    it('follows XDG_DATA_HOME override', () => {
      process.env.XDG_DATA_HOME = '/other/data';
      expect(getOpencodeAuthPath(HOME)).toBe('/other/data/opencode/auth.json');
    });
  });

  describe('resolveGlobalConfigPath', () => {
    it('honors OPENCODE_CONFIG env var', async () => {
      process.env.OPENCODE_CONFIG = '/explicit/opencode.json';
      const result = await resolveGlobalConfigPath(HOME, async () => false);
      expect(result).toBe('/explicit/opencode.json');
    });

    it('prefers existing .jsonc over .json', async () => {
      const exists = vi.fn(async (p: string) => p.endsWith('.jsonc'));
      const result = await resolveGlobalConfigPath(HOME, exists);
      expect(result).toBe('/home/user/.config/opencode/opencode.jsonc');
    });

    it('falls back to .json when .jsonc missing', async () => {
      const exists = vi.fn(async (p: string) => p.endsWith('.json'));
      const result = await resolveGlobalConfigPath(HOME, exists);
      expect(result).toBe('/home/user/.config/opencode/opencode.json');
    });

    it('returns .json path when neither exists', async () => {
      const exists = vi.fn(async () => false);
      const result = await resolveGlobalConfigPath(HOME, exists);
      expect(result).toBe('/home/user/.config/opencode/opencode.json');
    });

    it('follows XDG_CONFIG_HOME for config dir', async () => {
      process.env.XDG_CONFIG_HOME = '/xdg/config';
      const exists = vi.fn(async () => false);
      const result = await resolveGlobalConfigPath(HOME, exists);
      expect(result).toBe('/xdg/config/opencode/opencode.json');
    });
  });
});
