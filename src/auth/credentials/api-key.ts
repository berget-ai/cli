import { DefaultApiKeyManager } from '../../utils/default-api-key.js';

/**
 * Resolve API key from explicit option, env var, or default manager.
 * Returns null if none found.
 */
export async function resolveApiKey(options?: { apiKey?: string }): Promise<null | string> {
  // 1. Explicit --api-key option
  if (options?.apiKey) {
    return options.apiKey;
  }

  // 2. BERGET_API_KEY environment variable
  const envApiKey = process.env.BERGET_API_KEY;
  if (envApiKey) {
    return envApiKey;
  }

  // 3. Default API key manager (last resort)
  try {
    const manager = DefaultApiKeyManager.getInstance();
    const data = manager.getDefaultApiKeyData();
    if (data?.key) {
      return data.key;
    }
  } catch {
    // ignore
  }

  return null;
}
