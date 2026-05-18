import { describe, expect, it } from 'vitest';

import { decodeJwtPayload, hasBergetCodeSeat } from '../../../auth/jwt.js';
import {
  type AuthDeps,
  type CliAuth,
  configureAuth,
  ensureCliAuth,
  isToolAuthenticated,
  readCliAuth,
  syncApiKeyToTool,
  syncOAuthToTool,
} from '../auth-sync.js';
import { FatalError } from '../errors.js';
import { FakeApiKeyService } from './fake-api-key-service.js';
import { FakeAuthService } from './fake-auth-service.js';
import { FakeFileStore } from './fake-file-store.js';
import { confirm, FakePrompter, select } from './fake-prompter.js';

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

const HOME = '/home/user';

const fakeCliAuth = (overrides: Partial<CliAuth> = {}): CliAuth => ({
  access_token: makeJwt({
    exp: 9_999_999_999_999, // JWT exp in seconds (different from expires_at in ms)
    realm_access: { roles: ['default-roles-berget'] },
  }),
  expires_at: 9_999_999_999_999,
  refresh_token: 'refreshtoken',
  ...overrides,
});

describe('readCliAuth', () => {
  it('returns null when auth file does not exist', async () => {
    const files = new FakeFileStore();
    const result = await readCliAuth(files, HOME);
    expect(result).toBeNull();
  });

  it('parses valid auth file', async () => {
    const files = new FakeFileStore();
    const auth: CliAuth = fakeCliAuth();
    files.seed(HOME + '/.berget/auth.json', JSON.stringify(auth));

    const result = await readCliAuth(files, HOME);
    // The JWT's exp claim should be extracted and converted to milliseconds
    const jwtPayload = JSON.parse(
      Buffer.from(auth.access_token.split('.')[1], 'base64url').toString(),
    );
    const expectedAuth = {
      access_token: auth.access_token,
      expires_at: (jwtPayload.exp as number) * 1000,
      refresh_token: auth.refresh_token,
    };
    expect(result).toEqual(expectedAuth);
  });

  it('returns null for malformed JSON', async () => {
    const files = new FakeFileStore();
    files.seed(HOME + '/.berget/auth.json', 'not json');
    const result = await readCliAuth(files, HOME);
    expect(result).toBeNull();
  });

  it('returns null when fields are missing', async () => {
    const files = new FakeFileStore();
    files.seed(HOME + '/.berget/auth.json', JSON.stringify({ access_token: 'only' }));
    const result = await readCliAuth(files, HOME);
    expect(result).toBeNull();
  });
});

describe('isToolAuthenticated', () => {
  it('returns false when auth file does not exist', async () => {
    const files = new FakeFileStore();
    const result = await isToolAuthenticated(files, HOME, 'opencode');
    expect(result).toBe(false);
  });

  it('returns true when berget entry exists', async () => {
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.local/share/opencode/auth.json',
      JSON.stringify({ berget: { access: 'tok', type: 'oauth' } }),
    );
    const result = await isToolAuthenticated(files, HOME, 'opencode');
    expect(result).toBe(true);
  });

  it('returns false when berget entry is missing', async () => {
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.local/share/opencode/auth.json',
      JSON.stringify({ openai: { type: 'api' } }),
    );
    const result = await isToolAuthenticated(files, HOME, 'opencode');
    expect(result).toBe(false);
  });

  it('checks correct path for pi', async () => {
    const files = new FakeFileStore();
    files.seed(HOME + '/.pi/agent/auth.json', JSON.stringify({ berget: { type: 'oauth' } }));
    const result = await isToolAuthenticated(files, HOME, 'pi');
    expect(result).toBe(true);
  });
});

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = { realm_access: { roles: ['admin'] }, sub: '123' };
    const jwt = makeJwt(payload);
    expect(decodeJwtPayload(jwt)).toEqual(payload);
  });

  it('returns null for invalid format', () => {
    expect(decodeJwtPayload('not.a')).toBeNull();
    expect(decodeJwtPayload('onlyOnePart')).toBeNull();
  });

  it('returns null for invalid base64', () => {
    expect(decodeJwtPayload('header.bad\.base64.signature')).toBeNull();
  });
});

describe('hasBergetCodeSeat', () => {
  it('returns true when berget_code_seat is present', () => {
    const token = makeJwt({
      realm_access: { roles: ['berget_code_seat', 'default-roles-berget'] },
    });
    expect(hasBergetCodeSeat(token)).toBe(true);
  });

  it('returns false when role is missing', () => {
    const token = makeJwt({
      realm_access: { roles: ['default-roles-berget'] },
    });
    expect(hasBergetCodeSeat(token)).toBe(false);
  });

  it('returns false when realm_access is missing', () => {
    const token = makeJwt({ sub: '123' });
    expect(hasBergetCodeSeat(token)).toBe(false);
  });

  it('returns false for invalid JWT', () => {
    expect(hasBergetCodeSeat('invalid')).toBe(false);
  });
});

describe('syncOAuthToTool', () => {
  it('writes oauth tokens to opencode auth file', async () => {
    const files = new FakeFileStore();
    const auth = fakeCliAuth();

    await syncOAuthToTool(files, HOME, 'opencode', auth);

    const written = files.getWrittenFiles();
    const content = written.get(HOME + '/.local/share/opencode/auth.json')!;
    const parsed = JSON.parse(content);
    // The expires field should now use the JWT's exp claim (converted to milliseconds)
    const jwtPayload = JSON.parse(
      Buffer.from(auth.access_token.split('.')[1], 'base64url').toString(),
    );
    expect(parsed.berget).toEqual({
      access: auth.access_token,
      expires: (jwtPayload.exp as number) * 1000,
      refresh: auth.refresh_token,
      type: 'oauth',
    });
  });

  it('writes oauth tokens to pi auth file', async () => {
    const files = new FakeFileStore();
    const auth = fakeCliAuth();

    await syncOAuthToTool(files, HOME, 'pi', auth);

    const written = files.getWrittenFiles();
    const content = written.get(HOME + '/.pi/agent/auth.json')!;
    const parsed = JSON.parse(content);
    expect(parsed.berget.type).toBe('oauth');
  });

  it('merges with existing providers', async () => {
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.local/share/opencode/auth.json',
      JSON.stringify({ openai: { key: 'sk-openai', type: 'api' } }),
    );

    const auth = fakeCliAuth();
    await syncOAuthToTool(files, HOME, 'opencode', auth);

    const written = files.getWrittenFiles();
    const parsed = JSON.parse(written.get(HOME + '/.local/share/opencode/auth.json')!);
    expect(parsed.openai).toEqual({ key: 'sk-openai', type: 'api' });
    expect(parsed.berget.type).toBe('oauth');
  });

  it('sets 0o600 permissions on the auth file', async () => {
    const files = new FakeFileStore();
    const auth = fakeCliAuth();

    await syncOAuthToTool(files, HOME, 'opencode', auth);

    const chmodCalls = files.getChmodCalls();
    expect(chmodCalls).toHaveLength(1);
    expect(chmodCalls[0]).toEqual({
      mode: 0o600,
      path: HOME + '/.local/share/opencode/auth.json',
    });
  });
});

describe('syncApiKeyToTool', () => {
  it('writes api key to opencode auth file with type "api"', async () => {
    const files = new FakeFileStore();

    await syncApiKeyToTool(files, HOME, 'opencode', 'sk_ber_test');

    const written = files.getWrittenFiles();
    const content = written.get(HOME + '/.local/share/opencode/auth.json')!;
    const parsed = JSON.parse(content);
    expect(parsed.berget).toEqual({
      key: 'sk_ber_test',
      type: 'api',
    });
  });

  it('writes api key to pi auth file with type "api_key"', async () => {
    const files = new FakeFileStore();

    await syncApiKeyToTool(files, HOME, 'pi', 'sk_ber_pi');

    const written = files.getWrittenFiles();
    const content = written.get(HOME + '/.pi/agent/auth.json')!;
    const parsed = JSON.parse(content);
    expect(parsed.berget).toEqual({
      key: 'sk_ber_pi',
      type: 'api_key',
    });
  });

  it('merges with existing providers', async () => {
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.local/share/opencode/auth.json',
      JSON.stringify({ anthropic: { key: 'sk-ant', type: 'api' } }),
    );

    await syncApiKeyToTool(files, HOME, 'opencode', 'sk_ber_test');

    const written = files.getWrittenFiles();
    const parsed = JSON.parse(written.get(HOME + '/.local/share/opencode/auth.json')!);
    expect(parsed.anthropic).toEqual({ key: 'sk-ant', type: 'api' });
  });

  it('sets 0o600 permissions on the auth file', async () => {
    const files = new FakeFileStore();

    await syncApiKeyToTool(files, HOME, 'opencode', 'sk_ber_test');

    const chmodCalls = files.getChmodCalls();
    expect(chmodCalls).toHaveLength(1);
    expect(chmodCalls[0]).toEqual({
      mode: 0o600,
      path: HOME + '/.local/share/opencode/auth.json',
    });
  });
});

describe('configureAuth', () => {
  const makeAuthDeps = (overrides: Partial<AuthDeps> = {}): AuthDeps =>
    ({
      apiKeyService: new FakeApiKeyService('sk_ber_test'),
      authService: new FakeAuthService(true),
      files: new FakeFileStore(),
      homeDir: HOME,
      prompter: new FakePrompter([]),
      ...overrides,
    }) as AuthDeps;

  it('Case A: already authenticated — chooses keep → skips flow', async () => {
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.local/share/opencode/auth.json',
      JSON.stringify({ berget: { type: 'oauth' } }),
    );

    const prompter = new FakePrompter([select('keep')]);

    const deps = makeAuthDeps({ files, prompter });
    const result = await configureAuth(deps, 'opencode', fakeCliAuth());

    expect(result.authenticated).toBe(true);
    expect((deps.prompter as FakePrompter).calls.length).toBe(1); // Only the select prompt
  });

  it('Case A reconfigure: already authenticated — reconfigure with valid CLI token', async () => {
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.local/share/opencode/auth.json',
      JSON.stringify({ berget: { type: 'oauth' } }),
    );

    const prompter = new FakePrompter([select('reconfigure'), select('subscription')]);

    const deps = makeAuthDeps({ files, prompter });
    const result = await configureAuth(
      deps,
      'opencode',
      fakeCliAuth({
        access_token: makeJwt({
          exp: 9_999_999_999_999,
          realm_access: { roles: ['berget_code_seat'] },
        }),
      }),
    );

    expect(result.authenticated).toBe(true);
  });

  it('Case B: login success + berget_code_seat → chooses subscription', async () => {
    const files = new FakeFileStore();
    const jwt = makeJwt({
      exp: 9_999_999_999_999,
      realm_access: { roles: ['berget_code_seat'] },
    });
    const cliAuth: CliAuth = {
      access_token: jwt,
      expires_at: 9_999_999_999_999,
      refresh_token: 'ref',
    };

    const prompter = new FakePrompter([select('subscription')]);

    const deps = makeAuthDeps({ files, prompter });
    const result = await configureAuth(deps, 'opencode', cliAuth);

    expect(result.authenticated).toBe(true);
    const written = files.getWrittenFiles();
    expect(written.has(HOME + '/.local/share/opencode/auth.json')).toBe(true);
    const parsed = JSON.parse(written.get(HOME + '/.local/share/opencode/auth.json')!);
    expect(parsed.berget.type).toBe('oauth');
  });

  it('Case B variant: login success + seat → chooses api_key', async () => {
    const files = new FakeFileStore();
    const jwt = makeJwt({
      exp: 9_999_999_999_999,
      realm_access: { roles: ['berget_code_seat'] },
    });
    const cliAuth: CliAuth = {
      access_token: jwt,
      expires_at: 9_999_999_999_999,
      refresh_token: 'ref',
    };

    const prompter = new FakePrompter([select('api_key')]);

    const deps = makeAuthDeps({ files, prompter });
    const result = await configureAuth(deps, 'opencode', cliAuth);

    expect(result.authenticated).toBe(true);
    const written = files.getWrittenFiles();
    const parsed = JSON.parse(written.get(HOME + '/.local/share/opencode/auth.json')!);
    expect(parsed.berget.type).toBe('api');
    expect(parsed.berget.key).toBe('sk_ber_test');
  });

  it('Case C: login success + no seat → creates api key', async () => {
    const files = new FakeFileStore();
    const prompter = new FakePrompter([confirm(true)]);

    const deps = makeAuthDeps({ files, prompter });
    const result = await configureAuth(deps, 'opencode', fakeCliAuth());

    expect(result.authenticated).toBe(true);
    const written = files.getWrittenFiles();
    const parsed = JSON.parse(written.get(HOME + '/.local/share/opencode/auth.json')!);
    expect(parsed.berget.type).toBe('api');
    expect(parsed.berget.key).toBe('sk_ber_test');
  });

  it('Case B variant failure: login success + seat → chooses api_key + creation fails', async () => {
    const files = new FakeFileStore();
    const jwt = makeJwt({
      exp: 9_999_999_999_999,
      realm_access: { roles: ['berget_code_seat'] },
    });
    const cliAuth: CliAuth = {
      access_token: jwt,
      expires_at: 9_999_999_999_999,
      refresh_token: 'ref',
    };

    const prompter = new FakePrompter([select('api_key')]);
    const failingApiKeyService = new FakeApiKeyService(
      'sk_ber_test',
      true,
      'Before you can create API keys, you need to finish setting up your account.',
    );

    const deps = makeAuthDeps({ apiKeyService: failingApiKeyService, files, prompter });

    await expect(configureAuth(deps, 'opencode', cliAuth)).rejects.toThrow(FatalError);
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
  });

  it('Case C failure: login success + no seat → confirms api key + creation fails', async () => {
    const files = new FakeFileStore();
    const prompter = new FakePrompter([confirm(true)]);

    const failingApiKeyService = new FakeApiKeyService(
      'sk_ber_test',
      true,
      'Before you can create API keys, you need to finish setting up your account.',
    );
    const deps = makeAuthDeps({
      apiKeyService: failingApiKeyService,
      files,
      prompter,
    });

    await expect(configureAuth(deps, 'opencode', fakeCliAuth())).rejects.toThrow(FatalError);
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
  });

  it('Case D: login success + no seat → declines api key', async () => {
    const files = new FakeFileStore();
    const prompter = new FakePrompter([confirm(false)]);

    const deps = makeAuthDeps({ files, prompter });
    const result = await configureAuth(deps, 'opencode', fakeCliAuth());

    expect(result.authenticated).toBe(false);
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
  });

  it('Case E: login fails → returns false when cliAuth is null', async () => {
    const files = new FakeFileStore();

    const deps = makeAuthDeps({ files });
    const result = await configureAuth(deps, 'opencode', null);

    expect(result.authenticated).toBe(false);
  });

  it('fails authentication when cliAuth is null', async () => {
    const prompter = new FakePrompter([]);

    const deps = makeAuthDeps({ prompter });
    const result = await configureAuth(deps, 'opencode', null);

    expect(result.authenticated).toBe(false);
    const written = (deps.files as FakeFileStore).getWrittenFiles();
    expect(written.size).toBe(0); // No files should be written
  });

  it('preserves existing providers during sync', async () => {
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.local/share/opencode/auth.json',
      JSON.stringify({ openai: { key: 'sk-openai', type: 'api' } }),
    );

    const prompter = new FakePrompter([select('subscription')]);

    const deps = makeAuthDeps({ files, prompter });
    await configureAuth(
      deps,
      'opencode',
      fakeCliAuth({
        access_token: makeJwt({
          exp: 9_999_999_999_999,
          realm_access: { roles: ['berget_code_seat'] },
        }),
      }),
    );

    const written = files.getWrittenFiles();
    const parsed = JSON.parse(written.get(HOME + '/.local/share/opencode/auth.json')!);
    expect(parsed.openai).toEqual({ key: 'sk-openai', type: 'api' });
    expect(parsed.berget).toBeDefined();
  });
});

type EnsureCliAuthDeps = Pick<AuthDeps, 'authService' | 'files' | 'homeDir' | 'prompter'>;

describe('ensureCliAuth', () => {
  const makeEnsureDeps = (overrides: Partial<EnsureCliAuthDeps> = {}): EnsureCliAuthDeps =>
    ({
      authService: new FakeAuthService(true),
      files: new FakeFileStore(),
      homeDir: HOME,
      prompter: new FakePrompter([]),
      ...overrides,
    }) as Pick<AuthDeps, 'authService' | 'files' | 'homeDir' | 'prompter'>;

  it('returns valid existing token without calling loginInteractive', async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.berget/auth.json',
      JSON.stringify({
        access_token: makeJwt({ exp: farFuture, realm_access: { roles: ['berget_code_seat'] } }),
        expires_at: farFuture * 1000,
        refresh_token: 'ref',
      }),
    );

    const authService = new FakeAuthService(true);
    const deps = makeEnsureDeps({ authService, files });
    const result = await ensureCliAuth(deps);

    expect(result).not.toBeNull();
    expect(result!.access_token).toBeTruthy();
    expect(authService.loginInteractiveCallCount).toBe(0);
  });

  it('calls loginInteractive when token is expired', async () => {
    const farPast = Math.floor(Date.now() / 1000) - 3600;
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.berget/auth.json',
      JSON.stringify({
        access_token: makeJwt({ exp: farPast, realm_access: { roles: ['default-roles-berget'] } }),
        expires_at: farPast * 1000,
        refresh_token: 'ref',
      }),
    );

    const authService = new FakeAuthService(true);
    const prompter = new FakePrompter([]);
    const deps = makeEnsureDeps({ authService, files, prompter });
    const result = await ensureCliAuth(deps);

    expect(result).not.toBeNull();
    expect(authService.loginInteractiveCallCount).toBe(1);
  });

  it('returns auth on successful login when no existing token', async () => {
    const authService = new FakeAuthService(true);
    const prompter = new FakePrompter([]);
    const deps = makeEnsureDeps({ authService, prompter });
    const result = await ensureCliAuth(deps);

    expect(result).not.toBeNull();
    expect(result!.access_token).toBeTruthy();
    expect(authService.loginInteractiveCallCount).toBe(1);
  });

  it('returns null on failed login', async () => {
    const authService = new FakeAuthService(false);
    const prompter = new FakePrompter([]);
    const deps = makeEnsureDeps({ authService, prompter });
    const result = await ensureCliAuth(deps);

    expect(result).toBeNull();
    expect(authService.loginInteractiveCallCount).toBe(1);

    const notes = prompter.calls.filter((c) => c.method === 'note');
    const failNote = notes.find((n) => (n.args as any).title === 'Authentication Failed');
    expect(failNote).toBeDefined();
  });

  it('returns null when JWT is invalid after login', async () => {
    const authService = new FakeAuthService(true, true, false); // succeed, has seat, invalid token
    const prompter = new FakePrompter([]);
    const deps = makeEnsureDeps({ authService, prompter });
    const result = await ensureCliAuth(deps);

    expect(result).toBeNull();

    const notes = prompter.calls.filter((c) => c.method === 'note');
    const errorNote = notes.find((n) => (n.args as any).title === 'Authentication Error');
    expect(errorNote).toBeDefined();
  });
});
