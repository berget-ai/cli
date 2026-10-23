import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decodeJwtPayload } from '../../../auth/jwt.js';
import {
  type AuthDeps,
  type CliAuth,
  configureAuth,
  ensureCliAuth,
  isToolAuthenticated,
  readCliAuth,
} from '../auth-sync.js';
import { FatalError } from '../errors.js';
import { FakeApiKeyService } from './fake-api-key-service.js';
import { FakeAuthService } from './fake-auth-service.js';
import { FakeFileStore } from './fake-file-store.js';
import { confirm, FakePrompter, select } from './fake-prompter.js';
import { FakeSeatStatusService } from './fake-seat-status-service.js';

const ENV_KEYS = [
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'OPENCODE_CONFIG',
  'OPENCODE_CONFIG_DIR',
  'PI_CODING_AGENT_DIR',
];

beforeEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

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

describe('configureAuth', () => {
  const makeAuthDeps = (overrides: Partial<AuthDeps> = {}): AuthDeps =>
    ({
      apiKeyService: new FakeApiKeyService('sk_ber_test'),
      authService: new FakeAuthService(true),
      files: new FakeFileStore(),
      homeDir: HOME,
      prompter: new FakePrompter([]),
      seatStatusService: new FakeSeatStatusService({ seatId: null, tier: null }),
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
    expect((deps.prompter as FakePrompter).calls).toHaveLength(1); // Only the select prompt
  });

  it('Case A reconfigure: already authenticated — reconfigure delegates login to the tool and leaves the old entry untouched', async () => {
    const files = new FakeFileStore();
    const original = JSON.stringify({ berget: { type: 'oauth' } });
    files.seed(HOME + '/.local/share/opencode/auth.json', original);

    const prompter = new FakePrompter([select('reconfigure'), select('subscription')]);

    const deps = makeAuthDeps({
      files,
      prompter,
      seatStatusService: new FakeSeatStatusService({ seatId: 1, tier: 'berget_code' }),
    });
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

    expect(result.authenticated).toBe(false);
    // The old entry is never deleted mid-flow: the tool's own login
    // (/connect) overwrites it on success, and a cancelled/failed run must
    // not leave the user with less working auth than before.
    expect(files.getWrittenFiles().get(HOME + '/.local/share/opencode/auth.json')).toBe(original);
  });

  it('Case B: login success + berget_code_seat → chooses subscription → instructs /connect, writes nothing', async () => {
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

    const deps = makeAuthDeps({
      files,
      prompter,
      seatStatusService: new FakeSeatStatusService({ seatId: 1, tier: 'berget_code' }),
    });
    const result = await configureAuth(deps, 'opencode', cliAuth);

    expect(result.authenticated).toBe(false);
    // The CLI must never write the tool's private auth store
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
    const notes = prompter.calls.filter((c) => c.method === 'note');
    const instruction = notes.find((n) => JSON.stringify(n.args).includes('/connect'));
    expect(instruction).toBeDefined();
    expect(JSON.stringify(instruction!.args)).toContain('Berget Code Seat');
  });

  it('Case B (pi): subscription → instructs /login, writes nothing', async () => {
    const files = new FakeFileStore();
    const prompter = new FakePrompter([select('subscription')]);

    const deps = makeAuthDeps({
      files,
      prompter,
      seatStatusService: new FakeSeatStatusService({ seatId: 1, tier: 'berget_code' }),
    });
    const result = await configureAuth(deps, 'pi', fakeCliAuth());

    expect(result.authenticated).toBe(false);
    expect(files.getWrittenFiles().has(HOME + '/.pi/agent/auth.json')).toBe(false);
    const notes = prompter.calls.filter((c) => c.method === 'note');
    const instruction = notes.find((n) => JSON.stringify(n.args).includes('/login'));
    expect(instruction).toBeDefined();
    expect(JSON.stringify(instruction!.args)).toContain('Use a subscription');
  });

  it('Case B variant: login success + seat → chooses api_key → displays key, writes nothing', async () => {
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

    const deps = makeAuthDeps({
      files,
      prompter,
      seatStatusService: new FakeSeatStatusService({ seatId: 1, tier: 'berget_code' }),
    });
    const result = await configureAuth(deps, 'opencode', cliAuth);

    expect(result.authenticated).toBe(false);
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
    const notes = prompter.calls.filter((c) => c.method === 'note');
    const keyNote = notes.find((n) => JSON.stringify(n.args).includes('sk_ber_test'));
    expect(keyNote).toBeDefined();
    expect(JSON.stringify(keyNote!.args)).toContain('/connect');
  });

  it('Case C: login success + no seat → creates api key → displays key, writes nothing', async () => {
    const files = new FakeFileStore();
    const prompter = new FakePrompter([confirm(true)]);

    const deps = makeAuthDeps({ files, prompter });
    const result = await configureAuth(deps, 'opencode', fakeCliAuth());

    expect(result.authenticated).toBe(false);
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
    const notes = prompter.calls.filter((c) => c.method === 'note');
    const keyNote = notes.find((n) => JSON.stringify(n.args).includes('sk_ber_test'));
    expect(keyNote).toBeDefined();
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

    const deps = makeAuthDeps({
      apiKeyService: failingApiKeyService,
      files,
      prompter,
      seatStatusService: new FakeSeatStatusService({ seatId: 1, tier: 'berget_code' }),
    });

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

  it('seat without recognized tier ({seatId, tier: null}) → still treated as seat-holder', async () => {
    const files = new FakeFileStore();
    const prompter = new FakePrompter([select('subscription')]);

    const deps = makeAuthDeps({
      files,
      prompter,
      seatStatusService: new FakeSeatStatusService({ seatId: 168, tier: null }),
    });
    const result = await configureAuth(deps, 'opencode', fakeCliAuth());

    expect(result.authenticated).toBe(false);
    // Seat path: /connect instructions, NOT the no-seat API-key prompt
    const notes = prompter.calls.filter((c) => c.method === 'note');
    const instruction = notes.find((n) => JSON.stringify(n.args).includes('/connect'));
    expect(instruction).toBeDefined();
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
  });

  it('seat status unverifiable (API down) → warns and instructs, writes nothing', async () => {
    const files = new FakeFileStore();
    const prompter = new FakePrompter([select('browser')]);

    const deps = makeAuthDeps({
      files,
      prompter,
      seatStatusService: new FakeSeatStatusService(null),
    });
    const result = await configureAuth(deps, 'opencode', fakeCliAuth());

    expect(result.authenticated).toBe(false);
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
    const notes = prompter.calls.filter((c) => c.method === 'note');
    const warningNote = notes.find((n) => JSON.stringify(n.args).includes('Could not verify'));
    expect(warningNote).toBeDefined();
  });

  it('Case E: login fails → returns false when cliAuth is null', async () => {
    const files = new FakeFileStore();

    const deps = makeAuthDeps({ files });
    const result = await configureAuth(deps, 'opencode', null);

    expect(result.authenticated).toBe(false);
  });

  it('skips seat check when JWT cannot be decoded', async () => {
    const files = new FakeFileStore();
    // No prompts expected — the !jwtPayload guard should short-circuit
    const prompter = new FakePrompter([select('browser')]);

    const deps = makeAuthDeps({ files, prompter });

    const cliAuth: CliAuth = {
      access_token: 'not-a-valid-jwt-string',
      expires_at: Date.now() + 3600000,
      refresh_token: 'ref',
    };

    const result = await configureAuth(deps, 'opencode', cliAuth);

    expect(result.authenticated).toBe(false);
    // No seat-selection prompt should have been shown
    const selectCalls = prompter.calls.filter((c) => c.method === 'select');
    expect(selectCalls).toHaveLength(0);
    // Nothing written to the tool's auth store
    expect(files.getWrittenFiles().has(HOME + '/.local/share/opencode/auth.json')).toBe(false);
    // Warning note displayed
    const notes = prompter.calls.filter((c) => c.method === 'note');
    const warningNote = notes.find((n) => (n.args as any).title === 'Authentication');
    expect(warningNote).toBeDefined();
    expect((warningNote!.args as any).message).toContain('Could not verify');
  });

  it('fails authentication when cliAuth is null', async () => {
    const prompter = new FakePrompter([select('browser')]);

    const deps = makeAuthDeps({ prompter });
    const result = await configureAuth(deps, 'opencode', null);

    expect(result.authenticated).toBe(false);
    const written = (deps.files as FakeFileStore).getWrittenFiles();
    expect(written.size).toBe(0); // No files should be written
  });

  it('never writes the tool auth store, regardless of path', async () => {
    const files = new FakeFileStore();
    files.seed(
      HOME + '/.local/share/opencode/auth.json',
      JSON.stringify({ openai: { key: 'sk-openai', type: 'api' } }),
    );

    const prompter = new FakePrompter([select('subscription')]);

    const deps = makeAuthDeps({
      files,
      prompter,
      seatStatusService: new FakeSeatStatusService({ seatId: 1, tier: 'berget_code' }),
    });
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

    // Other providers' entries are left untouched and nothing is added
    expect(files.getWrittenFiles().get(HOME + '/.local/share/opencode/auth.json')).toBe(
      JSON.stringify({ openai: { key: 'sk-openai', type: 'api' } }),
    );
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
    const prompter = new FakePrompter([select('browser')]);
    const deps = makeEnsureDeps({ authService, files, prompter });
    const result = await ensureCliAuth(deps);

    expect(result).not.toBeNull();
    expect(authService.loginInteractiveCallCount).toBe(1);
  });

  it('returns auth on successful login when no existing token', async () => {
    const authService = new FakeAuthService(true);
    const prompter = new FakePrompter([select('browser')]);
    const deps = makeEnsureDeps({ authService, prompter });
    const result = await ensureCliAuth(deps);

    expect(result).not.toBeNull();
    expect(result!.access_token).toBeTruthy();
    expect(authService.loginInteractiveCallCount).toBe(1);
  });

  it('returns null on failed login', async () => {
    const authService = new FakeAuthService(false);
    const prompter = new FakePrompter([select('browser')]);
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
    const prompter = new FakePrompter([select('browser')]);
    const deps = makeEnsureDeps({ authService, prompter });
    const result = await ensureCliAuth(deps);

    expect(result).toBeNull();

    const notes = prompter.calls.filter((c) => c.method === 'note');
    const errorNote = notes.find((n) => (n.args as any).title === 'Authentication Error');
    expect(errorNote).toBeDefined();
  });
});
