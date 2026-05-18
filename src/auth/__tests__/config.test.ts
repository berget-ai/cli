import { describe, expect, it, vi } from 'vitest';

import { getAuthConfig } from '../config.js';

describe('getAuthConfig', () => {
  it('returns production URLs by default', () => {
    const config = getAuthConfig();
    expect(config.apiBaseUrl).toBe('https://api.berget.ai');
    expect(config.keycloakUrl).toBe('https://keycloak.berget.ai');
    expect(config.realm).toBe('berget');
    expect(config.clientId).toBe('berget-code');
  });

  it('returns stage URLs when stage: true', () => {
    const config = getAuthConfig({ stage: true });
    expect(config.apiBaseUrl).toBe('https://api.stage.berget.ai');
    expect(config.keycloakUrl).toBe('https://keycloak.stage.berget.ai');
  });

  it('returns local URLs when local: true', () => {
    const config = getAuthConfig({ local: true });
    expect(config.apiBaseUrl).toBe('http://localhost:3000');
    expect(config.keycloakUrl).toBe('https://keycloak.stage.berget.ai');
  });

  it('overrides apiBaseUrl with BERGET_API_URL env var', () => {
    vi.stubEnv('BERGET_API_URL', 'https://custom.api.example.com');
    const config = getAuthConfig();
    expect(config.apiBaseUrl).toBe('https://custom.api.example.com');
    expect(config.keycloakUrl).toBe('https://keycloak.berget.ai');
    vi.unstubAllEnvs();
  });

  it('does not read process.argv at module load', () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'berget', '--stage'];
    try {
      const config = getAuthConfig();
      expect(config.apiBaseUrl).toBe('https://api.berget.ai');
    } finally {
      process.argv = originalArgv;
    }
  });
});
