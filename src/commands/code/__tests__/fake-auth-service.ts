import type { AuthServicePort } from '../ports/auth-services.js';

export class FakeAuthService implements AuthServicePort {
  loginCallCount = 0;
  loginInteractiveCallCount = 0;

  constructor(
    private readonly _shouldSucceed: boolean,
    private readonly _hasSeat: boolean = true,
    private readonly _validToken: boolean = true,
  ) {}

  async login(): Promise<boolean> {
    this.loginCallCount++;
    return this._shouldSucceed;
  }

  loginInteractive(_options?: {
    debug?: boolean;
  }): ReturnType<AuthServicePort['loginInteractive']> {
    this.loginInteractiveCallCount++;
    if (!this._shouldSucceed) {
      return Promise.resolve({ error: 'Login failed', success: false });
    }

    const farFuture = Math.floor(Date.now() / 1000) + 3600 * 24 * 365; // 1 year from now in seconds

    const accessToken = this._validToken
      ? makeJwt({
          exp: farFuture,
          realm_access: { roles: this._hasSeat ? ['berget_code_seat'] : ['default-roles-berget'] },
        })
      : 'invalid.token.here';

    return Promise.resolve({
      accessToken,
      expiresIn: 3600,
      refreshToken: 'refresh',
      success: true,
    });
  }
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}
