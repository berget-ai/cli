import { describe, expect, it, vi } from 'vitest';

import { clearConfigurationCache, getConfiguration } from '../issuer.js';

let mockDiscoveryCalls: any[] = [];

// Mock openid-client at the module level
vi.mock('openid-client', () => ({
  discovery: vi.fn((...args: any[]) => {
    mockDiscoveryCalls.push(args);
    // Return a unique config based on the URL
    const url = args[0] as URL;
    return Promise.resolve({
      issuer: url.toString(),
    });
  }),
}));

describe('getConfiguration', () => {
  beforeEach(() => {
    clearConfigurationCache();
    mockDiscoveryCalls = [];
  });

  it('discovers issuer and caches the Configuration', async () => {
    const authConfig = {
      apiBaseUrl: 'https://api.berget.ai',
      clientId: 'berget-code',
      keycloakUrl: 'https://keycloak.berget.ai',
      realm: 'berget',
    };

    const result1 = await getConfiguration(authConfig);
    expect(result1.issuer).toBe('https://keycloak.berget.ai/realms/berget');
    expect(mockDiscoveryCalls).toHaveLength(1);

    // Second call should use cache
    const result2 = await getConfiguration(authConfig);
    expect(result2.issuer).toBe('https://keycloak.berget.ai/realms/berget');
    expect(mockDiscoveryCalls).toHaveLength(1); // no additional call
  });

  it('re-discovers after cache is cleared', async () => {
    const authConfig = {
      apiBaseUrl: 'https://api.berget.ai',
      clientId: 'berget-code',
      keycloakUrl: 'https://keycloak.berget.ai',
      realm: 'berget',
    };

    await getConfiguration(authConfig);
    expect(mockDiscoveryCalls).toHaveLength(1);

    clearConfigurationCache();

    const stageConfig = {
      ...authConfig,
      keycloakUrl: 'https://keycloak.stage.berget.ai',
    };

    const result = await getConfiguration(stageConfig);
    expect(result.issuer).toBe('https://keycloak.stage.berget.ai/realms/berget');
    expect(mockDiscoveryCalls).toHaveLength(2);
  });
});
