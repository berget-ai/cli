import type { ApiKeyServicePort } from '../ports/auth-services.js';

export class FakeApiKeyService implements ApiKeyServicePort {
  private readonly _errorMessage: string;
  private readonly _key: string;
  private readonly _shouldFail: boolean;

  constructor(key: string, shouldFail = false, errorMessage = 'API key creation failed') {
    this._key = key;
    this._shouldFail = shouldFail;
    this._errorMessage = errorMessage;
  }

  async create(_options: { description?: string; name: string }): Promise<{ key: string }> {
    if (this._shouldFail) {
      throw new Error(this._errorMessage);
    }
    return { key: this._key };
  }
}
