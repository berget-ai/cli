import type { AuthServicePort } from '../ports/auth-services'

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url')
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = base64urlEncode(JSON.stringify(payload))
  return `${header}.${body}.signature`
}

export class FakeAuthService implements AuthServicePort {
  loginCallCount = 0
  loginInteractiveCallCount = 0

  constructor(
    private readonly _shouldSucceed: boolean,
    private readonly _hasSeat: boolean = true,
    private readonly _validToken: boolean = true,
  ) {}

  async login(): Promise<boolean> {
    this.loginCallCount++
    return this._shouldSucceed
  }

  loginInteractive(): ReturnType<AuthServicePort['loginInteractive']> {
    this.loginInteractiveCallCount++
    if (!this._shouldSucceed) {
      return Promise.resolve({ success: false, error: 'Login failed' })
    }

    const farFuture = Math.floor(Date.now() / 1000) + 3600 * 24 * 365 // 1 year from now in seconds
    
    const accessToken = this._validToken
      ? makeJwt({ 
          realm_access: { roles: this._hasSeat ? ['berget_code_seat'] : ['default-roles-berget'] },
          exp: farFuture,
        })
      : 'invalid.token.here'

    return Promise.resolve({
      success: true,
      accessToken,
      refreshToken: 'refresh',
      expiresIn: 3600,
    })
  }
}
