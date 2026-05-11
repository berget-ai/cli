import type { ApiKeyServicePort } from "../ports/auth-services";

export class FakeApiKeyService implements ApiKeyServicePort {
  private readonly _key: string;

  constructor(key: string) {
    this._key = key;
  }

  async create(_options: { description?: string; name: string }): Promise<{ key: string }> {
    return { key: this._key };
  }
}
