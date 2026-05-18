# Authentication Consolidation Plan

## Overview

Consolidate scattered authentication logic across the Berget CLI into a single, well-typed, tested `src/auth/` module. Replace hand-rolled PKCE, token refresh, and Proxy-based client interception with `openid-client` v6 and clean `openapi-fetch` middleware.

---

## Current Problems

| Problem                       | Location(s)                         | Impact                                                                                                 |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Duplicated Keycloak config    | `auth-service.ts`, `client.ts`      | `--stage`/`--local` parsed from `process.argv` at module load; changes don't propagate                 |
| Hand-rolled PKCE & refresh    | `browser-auth.ts`, `client.ts`      | Error-prone, no standards compliance, no refresh deduplication                                         |
| Proxy-based client wrapper    | `client.ts`                         | Loses TypeScript type safety (`any`), fragile, hard to debug                                           |
| Duplicated JWT parsing        | `token-manager.ts`, `auth-sync.ts`  | Same logic in two places, drift risk                                                                   |
| Hardcoded callback port       | `browser-auth.ts:15`                | Port `8787` with no fallback → `EADDRINUSE` crash                                                      |
| No server-side logout         | `client.ts:clearAuthToken()`        | Only deletes local files; Keycloak session valid                                                       |
| Chat auth mess                | `chat-service.ts:50-191`, `chat.ts` | Deeply nested conditionals mixing OAuth/API key/env var/default key in both command and service layers |
| Zero unit tests for auth core | —                                   | `BrowserAuth`, `TokenManager`, `refreshAccessToken` untested                                           |

---

## Design Decisions

| Decision             | Choice                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OAuth library**    | `openid-client` v6 (native fetch, universal ESM, OIDC-certified)                                                                                              |
| **Token storage**    | `~/.berget/auth.json` (plaintext, `0o600` perms) — keep exact format for backward compat                                                                      |
| **API key scope**    | Chat commands only (`berget chat`)                                                                                                                            |
| **New CLI commands** | None — no `auth status` or other new commands                                                                                                                 |
| **Migration style**  | In-place replacement. `TokenManager` and `createAuthenticatedClient` are internal-only; all call sites are rewritten                                          |
| **ESM**              | Project is already ESM (`"type": "module"`, `"module": "NodeNext"`). `openid-client@^6` static imports work natively. No dynamic `import()` workaround needed |

---

## Phase Dependency Graph

Phases cannot all run in parallel. The explicit dependency graph is:

```
Phase 1 (types, config, jwt, token-store) — each sub-phase includes its test file
    ↓
Phase 2 (issuer, token-refresh) — each sub-phase includes its test file
    ↓
Phase 3 (pkce-flow) — includes pkce-flow.test.ts
    ↓
Phase 4 (middleware + client.ts factory rewrite) — includes middleware.test.ts     ← BREAKING INTERFACE CHANGE
    ↓
Phase 5 (resolver, api-key) — includes resolver.test.ts + api-key.test.ts
    │
    ├─ Phase 6 (commands)
    │
    └─ Phase 7 (services)
         [6/7 can parallelize]
    ↓
Phase 8 (auth-sync refactor)
```

**Tests are not a final phase.** Every implementation module is committed with its unit test in the same PR. This prevents regressions and locks in contracts that existing tests (`auth-sync.test.ts`, `setup-flow.test.ts`) depend on.

**Why Phase 4 gates 5/6/7:** `createAuthenticatedClient()` gains an `options` parameter in Phase 4b. Every service (`auth-service.ts`, `chat-service.ts`, `api-key-service.ts`, `cluster-service.ts`) and every command (`auth.ts`, `chat.ts`, `models.ts`, `users.ts`, `billing.ts`) that imports it must update its call sites. These changes can be parallelized only after the factory signature is stable.

**Within Phase 1:** `types.ts` → `config.ts` → `jwt.ts` → `storage/token-store.ts`. These are sequential.

**Phase 5 and Phase 6/7:** These can run in parallel with each other once Phase 4 is complete, because the command layer and service layer are separate dependency trees after the shared `client.ts` interface is fixed.

---

## Target Architecture

```
src/auth/
  index.ts                   # Public API: login(), logout(), getClient(), resolveAuth()
  config.ts                  # Single source of truth for Keycloak + API URLs
  types.ts                   # AuthMethod, TokenData, AuthState, AuthConfig
  jwt.ts                     # decodeJwtPayload, extractJwtExpiresAt, isTokenExpired, hasBergetCodeSeat
  issuer.ts                  # openid-client discovery() + cached Configuration
  storage/
    token-store.ts           # TokenStore interface + FileTokenStore implementation
  oauth/
    pkce-flow.ts             # Browser-based PKCE using openid-client generators + discovery
    token-refresh.ts         # Centralized refresh with in-flight deduplication
  credentials/
    resolver.ts              # resolveAuth(): clear precedence chain
    api-key.ts               # API key resolution (env var, --api-key, default manager)
  middleware/
    auth-middleware.ts       # openapi-fetch middleware (replaces Proxy wrapper)
  __tests__/
    config.test.ts
    jwt.test.ts
    issuer.test.ts
    pkce-flow.test.ts
    token-refresh.test.ts
    storage/
      token-store.test.ts
    credentials/
      api-key.test.ts
      resolver.test.ts
    middleware/
      middleware.test.ts
```

---

## Phases

### Phase 1: Foundation

These sub-phases are sequential within Phase 1: `types.ts` → `config.ts` → `jwt.ts` → `storage/token-store.ts`.

**1a. Install `openid-client` v6**

```bash
npm install openid-client@^6.0.0
```

Verify the exact v6 API surface and document the function signatures in a code comment in `issuer.ts`:

```ts
// openid-client@^6 API surface verified:
// discovery(url: URL, clientId: string, clientMetadata?: object, clientAuth?: ClientAuth): Promise<Configuration>
// randomPKCECodeVerifier(): string
// calculatePKCECodeChallenge(codeVerifier: string): string
// buildAuthorizationUrl(configuration: Configuration, parameters?: Record<string, string>): URL
// authorizationCodeGrant(configuration: Configuration, url: URL, checkState?: boolean, options?: object): Promise<{ access_token: string, refresh_token?: string, expires_in?: number, ... }>
// refreshTokenGrant(configuration: Configuration, refreshToken: string, options?: object): Promise<{ access_token: string, refresh_token?: string, expires_in?: number, ... }>
```

**1b. `src/auth/config.ts`**

- Single exported function `getAuthConfig(options?: { stage?: boolean; local?: boolean }): AuthConfig`
- Returns `{ keycloakUrl, realm, clientId, apiBaseUrl }`
- Supports `BERGET_API_URL` environment override
- **Eliminates `process.argv.includes('--stage')`** from all services and client.

**1b-test. `src/auth/__tests__/config.test.ts`**

```ts
describe('getAuthConfig', () => {
  it('returns production URLs by default', () => {
    /* ... */
  });
  it('returns stage URLs when stage: true', () => {
    /* ... */
  });
  it('returns local URLs when local: true', () => {
    /* ... */
  });
  it('overrides apiBaseUrl with BERGET_API_URL env var', () => {
    /* vi.stubEnv */
  });
  it('does not read process.argv at module load', () => {
    // Design-regression guard: without options, must return prod even if argv contains --stage
    const originalArgv = process.argv;
    process.argv = ['node', 'berget', '--stage'];
    expect(getAuthConfig().apiBaseUrl).toBe('https://api.berget.ai');
    process.argv = originalArgv;
  });
});
```

**1c. `src/auth/types.ts`**

```ts
export type AuthMethod = 'oauth' | 'api_key';

export interface AuthState {
  method: AuthMethod;
  token: string; // access token or raw API key
  expiresAt?: number;
  refresh?: () => Promise<boolean>; // injected by resolver for middleware use
}

export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface AuthConfig {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  apiBaseUrl: string;
}

export interface BrowserAuthResult {
  accessToken?: string;
  error?: string;
  expiresIn?: number;
  refreshToken?: string;
  success: boolean;
}
```

**1d. `src/auth/jwt.ts`**

- Consolidates `decodeJwtPayload()`, `extractJwtExpiresAt()`, `isTokenExpired()`, `hasBergetCodeSeat()`.
- **Pure functions**; no side effects. No logging.
- Removes duplication between `token-manager.ts` and `auth-sync.ts`.

**1d-test. `src/auth/__tests__/jwt.test.ts`**

- Must verify the exact edge case from `auth-sync.test.ts` line 129: `decodeJwtPayload('header.bad\.base64.signature')` returns `null` (backslash in base64).
- Verifies `hasBergetCodeSeat` returns `false` for missing `realm_access`, missing role, and invalid JWT.
- Ensures `extractJwtExpiresAt` converts JWT `exp` (seconds) to milliseconds.

**1e. `src/auth/storage/token-store.ts`**

```ts
export interface TokenStore {
  get(): Promise<TokenData | null>;
  set(data: TokenData): Promise<void>;
  clear(): Promise<void>;
}
```

File-based implementation:

- Migrates `~/.berget/auth.json` read/write logic from `TokenManager`.
- Keeps exact same JSON shape and `0o600` permissions.
- Uses `fs/promises` (async I/O).
- **Replaces `TokenManager` entirely.** It is internal-only and has only 3 call sites, all rewritten in this plan.

**1e-test. `src/auth/__tests__/storage/token-store.test.ts`**

```ts
describe('FileTokenStore', () => {
  it('returns null when auth file does not exist', async () => {
    /* ... */
  });
  it('round-trips TokenData and preserves exact JSON shape', async () => {
    /* ... */
  });
  it('sets 0o600 permissions on write', async () => {
    /* ... */
  });
  it('clears by unlinking the file', async () => {
    /* ... */
  });
  it('returns null for malformed JSON', async () => {
    /* ... */
  });
});
```

> **Why real disk I/O:** `FakeFileStore` (used by `auth-sync.test.ts`) is just a Map. It won't catch JSON shape drift or permission bugs. Test against `os.tmpdir()` and assert with `fs.stat`.

> **Design note: TokenStore vs. FileStore**
> `auth-sync.ts` currently reads/writes `~/.berget/auth.json` through the `FileStore` port (a hexagonal architecture abstraction used for testability). `TokenStore` is a concrete `fs/promises` implementation. To preserve the `FileStore` port boundary in `auth-sync.ts` (which keeps its tests using `FakeFileStore` without mocking `fs`), **do not** replace `FileStore` usage in `auth-sync.ts` with `TokenStore`. Instead:
>
> - Import only `decodeJwtPayload()`, `extractJwtExpiresAt()`, `isTokenExpired()`, and `hasBergetCodeSeat()` from `src/auth/jwt.ts` into `auth-sync.ts`.
> - Keep `readCliAuth()` and `syncOAuthToTool()` using the `FileStore` port for I/O.
> - This is documented in Phase 8.

---

## Testing Strategy

Tests are written **alongside** implementation, not deferred to a final phase. Every new module in `src/auth/` gets a unit test file created in the same PR as the module itself. This prevents regressions and locks in boundary contracts that existing tests (`auth-sync.test.ts`, `setup-flow.test.ts`) depend on.

| Module Under Test               | Test File                               | Created In | What It Guards                                                                                |
| ------------------------------- | --------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `config.ts`                     | `__tests__/config.test.ts`              | Phase 1b   | `process.argv` elimination, env var override, URL correctness                                 |
| `jwt.ts`                        | `__tests__/jwt.test.ts`                 | Phase 1d   | Pure function contracts (`decodeJwtPayload`, `hasBergetCodeSeat`) that `auth-sync.ts` imports |
| `storage/token-store.ts`        | `__tests__/storage/token-store.test.ts` | Phase 1e   | Disk I/O, `0o600` perms, exact JSON shape backward compat                                     |
| `issuer.ts`                     | `__tests__/issuer.test.ts`              | Phase 2a   | Discovery caching, `clearConfigurationCache()`                                                |
| `oauth/token-refresh.ts`        | `__tests__/token-refresh.test.ts`       | Phase 2b   | In-flight dedup, token rotation, 401/403 handling                                             |
| `oauth/pkce-flow.ts`            | `__tests__/pkce-flow.test.ts`           | Phase 3a   | Port fallback, PKCE param generation, `BrowserAuthResult` shape                               |
| `credentials/api-key.ts`        | `__tests__/api-key.test.ts`             | Phase 5a   | Env var / flag / default manager precedence                                                   |
| `credentials/resolver.ts`       | `__tests__/resolver.test.ts`            | Phase 5b   | Full `AuthState` precedence chain                                                             |
| `middleware/auth-middleware.ts` | `__tests__/middleware.test.ts`          | Phase 4a   | Header injection, 401→retry, no-overwrite, network error throw                                |

### Existing Test Preservation

The following existing tests must continue to pass without modification. The refactor preserves their port boundaries:

- **`src/commands/code/__tests__/auth-sync.test.ts`** (482 lines): Depends on `decodeJwtPayload` and `hasBergetCodeSeat` being pure functions with identical signatures. `FileStore` port remains untouched.
- **`src/commands/code/__tests__/setup-flow.test.ts`** (640 lines): Depends on `AuthServicePort` interface (`loginInteractive` returning `BrowserAuthResult`). The concrete `AuthService` must still satisfy this port.
- **`tests/commands/chat.test.ts`** (120 lines): Currently shallow. Should be expanded to verify auth resolution has moved to command layer (see Phase 6a below).

### New Test Coverage Checklist

The table above lists all new test files. In addition, verify these critical behaviors:

1. **Network error propagation** (Phase 4a): Add test asserting that `client.GET()` throws on `fetch` failure instead of returning `{ error: { message } }`. The old Proxy wrapped network errors; the new middleware must let them throw.
2. **`BrowserAuthResult` shape** (Phase 3a): Assert that `pkce-flow.ts` returns `expiresIn` as `number`, not `string`, to keep `FakeAuthService` and `setup-flow.test.ts` compatible.
3. **Silent OAuth token reuse** (Phase 5b): In `resolver.test.ts`, verify that a valid, non-expired OAuth token returns an `AuthState` with a `refresh` function available but not eagerly called — this matches the `configureAuth` shortcut path in `setup-flow.test.ts` where an existing valid CLI token bypasses `loginInteractive()`.

---

### Phase 2: openid-client Integration (Medium Risk)

**2a. `src/auth/issuer.ts`**

- Discovers issuer via `openid-client.discovery()` using Keycloak well-known endpoint.
- Caches `Configuration` instance in module scope.
- Static import `openid-client` — no dynamic `import()` needed (project is ESM).

```ts
import { discovery } from 'openid-client';

let cachedConfig: Configuration | null = null;

export async function getConfiguration(config: AuthConfig): Promise<Configuration> {
  if (cachedConfig) return cachedConfig;
  // ... discovery ...
}

export function clearConfigurationCache(): void {
  cachedConfig = null;
}
```

**2b. `src/auth/oauth/token-refresh.ts`**

- Uses `refreshTokenGrant()` instead of manual `fetch`.
- Deduplicates in-flight refreshes: single `Promise` shared across callers.
- Handles refresh-token rotation: stores new refresh token if returned.
- On invalid/expired refresh token (401/403 from Keycloak), calls `tokenStore.clear()` and returns `false`.
- Accepts `TokenStore` as a parameter (injected, not imported) for testability.

---

### Phase 3: OAuth Flow Refactor

**3a. `src/auth/oauth/pkce-flow.ts`**

- Uses `randomPKCECodeVerifier()` and `calculatePKCECodeChallenge()`.
- Starts local HTTP callback server **first**, then discovers the bound port.
- **Port binding strategy:**
  1. Attempt `server.listen(8787)`.
  2. Listen for the `'error'` event on the server. If `error.code === 'EADDRINUSE'`, close the server and re-attempt `server.listen(0)` (random available port).
  3. On successful `'listening'` event, read `server.address().port` to get the actual bound port.
  4. Only after the actual port is known, call `buildAuthorizationUrl()` using `redirect_uri = http://localhost:${actualPort}/callback`.

  > **Implementation note:** `server.listen()` errors are emitted asynchronously via the `'error'` event. Do not rely on try/catch around `listen()`. Use a Promise that resolves on `'listening'` and rejects on `'error'`, with `EADDRINUSE` triggering a second listen attempt with port `0`.

- On callback, exchanges code via `authorizationCodeGrant()`.
- Returns `BrowserAuthResult` matching existing shape.
- Inject `createServer` for testability (defaults to `http.createServer`).

**3b. Delete `src/services/browser-auth.ts`**

- Replaced by `pkce-flow.ts`.

---

### Phase 4: Replace Proxy with Middleware

**Prerequisite:** Phase 3 (pkce-flow) must be complete so the middleware has a `TokenStore` to read from.

**4a. `src/auth/middleware/auth-middleware.ts`**

- Implements as `openapi-fetch` middleware.
- **openapi-fetch middleware API (v0.9.x):**

  ```ts
  export interface Middleware {
    onRequest?: (
      req: MiddlewareRequest,
      options: MergedOptions,
    ) => Request | undefined | Promise<Request | undefined>;
    onResponse?: (
      res: Response,
      options: MergedOptions,
      req: MiddlewareRequest,
    ) => Response | undefined | Promise<Response | undefined>;
  }
  ```

  Important: `onResponse` **must** return a `Response` (not the typed `{ data, error }` tuple) when modifying the response. Returning anything else throws: `"Middleware must return new Response() when modifying the response"`.

- Pre-request: reads current token from `TokenStore`, injects `Authorization` header (`Bearer <token>` for OAuth; raw key for API key). Skips injection if caller already provided `Authorization` in request headers.
- Post-401: triggers `refresh()` from `AuthState` (injected at client creation time), then:
  1. `request.headers.set('Authorization', \`Bearer ${newToken}\`)`—`Request` headers are mutable in modern fetch.
  2. `return fetch(request)` to retry. `fetch()` returns a `Response`, which satisfies the middleware contract.
  3. `openapi-fetch` then parses the retry response and returns the typed `{ data, response }` or `{ error, response }` tuple to the caller.

```ts
export function authMiddleware(options: { config: AuthConfig }): Middleware {
  return {
    async onRequest(req) {
      const token = await getCurrentToken();
      if (token && !req.headers.get('Authorization')) {
        req.headers.set('Authorization', `Bearer ${token}`);
      }
      return req;
    },
    async onResponse(res, _options, req) {
      if (res.status === 401 && refresh) {
        const ok = await refresh();
        if (ok) {
          const newToken = await getCurrentToken();
          req.headers.set('Authorization', `Bearer ${newToken}`);
          return fetch(req);
        }
      }
      return undefined; // no modification
    },
  };
}
```

- **Dropped behavior: Proxy request error wrapping.** The current Proxy catches `requestError` (network errors like `ECONNREFUSED`, `ENOTFOUND`) and wraps them in `{ error: { message: ... } }`. `openapi-fetch` handles network errors natively: they propagate as thrown exceptions. This is acceptable because all existing callers already wrap `client.GET/POST/etc.` in `try/catch` (e.g., `api-key-service.ts`, `cluster-service.ts`). The Proxy's error wrapping was actually hiding stack traces and making debugging harder.

- **The middleware must be empirically verified:** Add a test in `middleware.test.ts` that mocks the underlying `fetch`, returns 401 on first call and 200 on second, and asserts that `client.GET()` returns the 200 response data (the `{ data, response }` tuple, not a raw `Response`).

**4b. `src/client.ts` — Factory Pattern**
Replace module-level `apiClient` and `createAuthenticatedClient()` with factory functions accepting `options?: { stage?: boolean; local?: boolean }`.

```ts
export function createClient(options?: { stage?: boolean; local?: boolean }) {
  const config = getAuthConfig(options);
  return createClientBase<paths>({ baseUrl: config.apiBaseUrl });
}

export function createAuthenticatedClient(options?: { stage?: boolean; local?: boolean }) {
  const config = getAuthConfig(options);
  const client = createClientBase<paths>({ baseUrl: config.apiBaseUrl });
  client.use(authMiddleware({ config }));
  return client;
}
```

- Deprecate `getAuthToken()`, `saveAuthToken()`, `clearAuthToken()` — redirect to `FileTokenStore` or remove entirely.
- No module-level `process.argv` reading.
- No `Proxy`. No `any`.

---

### Phase 5: Credential Resolution

**Prerequisite:** Phase 4 must be complete (the factory pattern on `createAuthenticatedClient` provides the dependency injection point).

These can run in parallel with Phase 6 and Phase 7 once Phase 4 is done.

**5a. `src/auth/credentials/api-key.ts`**

- Extract env var check (`BERGET_API_KEY`) from `ChatService`/`chat.ts`.
- Extract `DefaultApiKeyManager` prompt logic from `ChatService`.
- `resolveApiKey(options?: { apiKey?: string }): Promise<string | null>`

**5b. `src/auth/credentials/resolver.ts`**

- `resolveAuth(options?: { apiKey?: string; stage?: boolean; local?: boolean }): Promise<AuthState>`
- **This is the sole composition root** where `TokenStore`, `tokenRefresh()`, and `getConfiguration()` meet. No other module should compose these three.
- Precedence:
  1. `BERGET_API_KEY` env var (chat context only)
  2. Explicit `--api-key` option (chat context only)
  3. OAuth token (with auto-refresh via middleware)
  4. Default API key manager (chat context only, last resort)
- `AuthState` carries the access token/API key, plus a `refresh` function bound to `TokenStore` and `tokenRefresh()`. The refresh token never leaks as a string to callers.

---

### Phase 6: Command-Layer Refactor (Medium Risk)

**6a. `src/commands/chat.ts`**

- **Auth resolution moves to command layer.**
- Single call before `chatService.createCompletion()`:
  ```ts
  const auth = await resolveAuth({ apiKey: options.apiKey });
  ```
- Pass resolved `apiKey` (if any) into `ChatCompletionOptions`.
- Remove all inline env var checking, default API key prompting, and `TokenManager` access from the command file.
- Keep the readline interactive loop and `apiKeyId` resolution (rotate-to-use) logic — this is UI orchestration, not auth resolution.

**6b. `src/commands/auth.ts`**

- `login`: calls new `AuthService.login({ stage: options.stage })`.
- `logout`: calls `tokenStore.clear()`; optionally call `client.revoke()` for server-side invalidation.
- `whoami`: calls new `AuthService.whoami({ stage: options.stage })`.

---

### Phase 7: Service Refactors (Medium Risk)

**7a. `src/services/auth-service.ts`**

- Accept `StageOptions` in all public methods.
- `login({ stage?, debug? })`: orchestrate `startPkceFlow()`, store tokens via `FileTokenStore`, fetch profile via `whoami()`, print status.
- `loginInteractive({ stage? })`: orchestrate `startPkceFlow()`, store tokens, return silent `BrowserAuthResult`.
- `whoami({ stage? })`: use `resolveAuth()` + `createAuthenticatedClient({ stage })`.
- Remove `makeBrowserAuth()` — logic lives in `pkce-flow.ts`.

**7b. `src/services/chat-service.ts`**

- Remove **all** inline auth logic from `createCompletion()` (~140 lines).
- `createCompletion` accepts `apiKey?: string` in `ChatCompletionOptions` (already present). No OAuth logic.
- Remove direct imports of `TokenManager` and `DefaultApiKeyManager`.
- Keep streaming logic (`handleStreamingResponse`) unchanged.

**7c. `src/utils/token-manager.ts`**

- **Delete.** Replaced by `src/auth/storage/token-store.ts`.
- All 3 internal call sites (`client.ts`, `auth-service.ts`, `chat-service.ts`) are rewritten.

---

### Phase 8: Tool Sync & Cleanup

**8a. `src/commands/code/auth-sync.ts`**

- Import JWT utilities from `src/auth/jwt.ts`.
- **Keep `FileStore` port usage unchanged.** Do not replace `readCliAuth()` or `syncOAuthToTool()` file I/O with `TokenStore`. The `FileStore` port preserves testability via `FakeFileStore`. Only pure functions (`decodeJwtPayload`, `extractJwtExpiresAt`, `isTokenExpired`, `hasBergetCodeSeat`) are imported from `auth/`.
- Remove the duplicate implementations of the four JWT functions from `auth-sync.ts` itself.

---

### Phase 9: Integration & Final Verification

> **Note:** Unit tests for each module were written alongside implementation in Phases 1–8 (see Testing Strategy). Phase 9 is reserved for integration-level validation.

**9a. Verify all new unit tests pass:**

```bash
npm run test:run -- src/auth/__tests__
```

**9b. Verify existing tests still pass:**

```bash
npm run test:run -- src/commands/code/__tests__
npm run test:run -- tests/commands/chat.test.ts
```

**9c. Typecheck the entire project:**

```bash
npm run typecheck
```

**9d. Manual smoke tests:**

- `berget auth login` (production PKCE flow)
- `berget auth whoami`
- `berget auth logout`
- `berget chat run` (OAuth token)
- `BERGET_API_KEY=xxx berget chat run` (API key override)

---

## File Inventory

| Action     | Path                                                                |
| ---------- | ------------------------------------------------------------------- |
| **Create** | `src/auth/index.ts`                                                 |
| **Create** | `src/auth/config.ts`                                                |
| **Create** | `src/auth/types.ts`                                                 |
| **Create** | `src/auth/jwt.ts`                                                   |
| **Create** | `src/auth/issuer.ts`                                                |
| **Create** | `src/auth/storage/token-store.ts`                                   |
| **Create** | `src/auth/oauth/pkce-flow.ts`                                       |
| **Create** | `src/auth/oauth/token-refresh.ts`                                   |
| **Create** | `src/auth/credentials/resolver.ts`                                  |
| **Create** | `src/auth/credentials/api-key.ts`                                   |
| **Create** | `src/auth/middleware/auth-middleware.ts`                            |
| **Create** | `src/auth/__tests__/config.test.ts`                                 |
| **Create** | `src/auth/__tests__/jwt.test.ts`                                    |
| **Create** | `src/auth/__tests__/issuer.test.ts`                                 |
| **Create** | `src/auth/__tests__/pkce-flow.test.ts`                              |
| **Create** | `src/auth/__tests__/token-refresh.test.ts`                          |
| **Create** | `src/auth/__tests__/storage/token-store.test.ts`                    |
| **Create** | `src/auth/__tests__/credentials/api-key.test.ts`                    |
| **Create** | `src/auth/__tests__/credentials/resolver.test.ts`                   |
| **Create** | `src/auth/__tests__/middleware/middleware.test.ts`                  |
| **Modify** | `src/services/auth-service.ts`                                      |
| **Modify** | `src/services/chat-service.ts`                                      |
| **Modify** | `src/client.ts`                                                     |
| **Modify** | `src/commands/auth.ts`                                              |
| **Modify** | `src/commands/chat.ts`                                              |
| **Modify** | `src/commands/code/auth-sync.ts`                                    |
| **Delete** | `src/utils/token-manager.ts` (replaced by `storage/token-store.ts`) |
| **Delete** | `src/services/browser-auth.ts` (replaced by `oauth/pkce-flow.ts`)   |
| **Modify** | `package.json` (add `openid-client`)                                |

---

## Import Site Inventory (Verified)

All of the following call sites will be rewritten during the plan execution. There are **no external consumers** — every import is within this repository.

### Symbols deleted from `src/client.ts`

| Symbol                      | Imported by                       | Action in plan                                              |
| --------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `createAuthenticatedClient` | `src/services/auth-service.ts`    | Update to `createAuthenticatedClient({ stage })`            |
| `createAuthenticatedClient` | `src/services/chat-service.ts`    | Update to `createAuthenticatedClient()` (no stage for chat) |
| `createAuthenticatedClient` | `src/services/api-key-service.ts` | Update to `createAuthenticatedClient()`                     |
| `createAuthenticatedClient` | `src/services/cluster-service.ts` | Update to `createAuthenticatedClient()`                     |
| `createAuthenticatedClient` | `src/commands/models.ts`          | Update to `createAuthenticatedClient()`                     |
| `createAuthenticatedClient` | `src/commands/users.ts`           | Update to `createAuthenticatedClient()`                     |
| `createAuthenticatedClient` | `src/commands/billing.ts`         | Update to `createAuthenticatedClient()`                     |
| `saveAuthToken`             | `src/services/auth-service.ts`    | Replace with `tokenStore.set()`                             |
| `clearAuthToken`            | `src/commands/auth.ts`            | Replace with `tokenStore.clear()`                           |
| `clearAuthToken`            | `src/services/auth-service.ts`    | Replace with `tokenStore.clear()`                           |
| `getAuthToken`              | _(no direct consumers)_           | Remove entirely                                             |

### `TokenManager` (class from `src/utils/token-manager.ts`)

| Imported by                    | Action in plan                                                    |
| ------------------------------ | ----------------------------------------------------------------- |
| `src/client.ts`                | Delete — logic moves to `TokenStore` interface + `FileTokenStore` |
| `src/services/chat-service.ts` | Remove dynamic import and all `tokenManager` usage                |

### `BrowserAuth` (class from `src/services/browser-auth.ts`)

| Imported by                    | Action in plan                                                    |
| ------------------------------ | ----------------------------------------------------------------- |
| `src/services/auth-service.ts` | Replace with `startPkceFlow()` from `src/auth/oauth/pkce-flow.ts` |

---

## Backward Compatibility

- `~/.berget/auth.json` format is unchanged.
- `BrowserAuthResult` shape is unchanged.
- `createAuthenticatedClient()` and `saveAuthToken()` are **removed** from `src/client.ts` exports. They are internal-only with no external consumers — all call sites are listed in the [Import Site Inventory](#import-site-inventory-verified) above. `npm run typecheck` will catch any undetected import.
- **API behavior change:** Network errors (e.g., `ECONNREFUSED`, `ENOTFOUND`) now propagate as thrown exceptions instead of being wrapped in `{ error: { message: ... } }` by the Proxy. This is acceptable because all callers already `try/catch` client calls. A regression test in `middleware.test.ts` explicitly asserts this throw behavior.
- **`AuthServicePort` interface:** `loginInteractive()` return type remains `BrowserAuthResult` (unchanged). The `FakeAuthService` test helper continues to work without modification.

---

## Acceptance Criteria

- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm run test:run` passes (new tests + existing `auth-sync.test.ts`, `setup-flow.test.ts`).
- [ ] `berget auth login` works via browser PKCE on production.
- [ ] `berget auth logout` clears local tokens.
- [ ] `berget auth whoami` returns profile when logged in.
- [ ] `berget chat run` resolves OAuth token correctly.
- [ ] `BERGET_API_KEY=xxx berget chat run` uses API key instead of OAuth.
- [ ] No `process.argv` scraping in service files.
- [ ] No hand-rolled `crypto` PKCE code.
- [ ] No `Proxy` wrapper on `apiClient`.
- [ ] Middleware test empirically verifies that a 401 → refresh → retry cycle returns the successful response to the caller.
