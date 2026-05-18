import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearConfigurationCache, getConfiguration } from '../issuer.js';

let mockDiscoveryCalls: any[] = [];

// Mock openid-client at the module level
vi.mock('openid-client', () => ({
  discovery: vi.fn((...args: any[]) => {
    mockDiscoveryCalls.push(args);
    // Return a unique config object based on the URL (just a plain object)
    return Promise.resolve({ _url: (args[0] as URL).toString() });
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
    expect((result1 as any)._url).toBe('https://keycloak.berget.ai/realms/berget');
    expect(mockDiscoveryCalls).toHaveLength(1);

    // Second call should use cache
    const result2 = await getConfiguration(authConfig);
    expect((result2 as any)._url).toBe('https://keycloak.berget.ai/realms/berget');
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
    expect((result as any)._url).toBe('https://keycloak.stage.berget.ai/realms/berget');
    expect(mockDiscoveryCalls).toHaveLength(2);
  });
});
