# Plan: Move Authentication to First Wizard Step

## Goal

Move the authentication step to the top of `berget code init` so it is the first step. It must use the same browser-based PKCE login logic as `berget auth login`. If the user is already authenticated (has a valid `~/.berget/auth.json`), skip the step silently. After tool and scope selection, ask whether to authenticate with subscription or API key.

## Files to Change

1. `src/commands/code/auth-sync.ts`
2. `src/commands/code/init.ts`
3. `src/commands/code/__tests__/auth-sync.test.ts`
4. `src/commands/code/__tests__/setup-flow.test.ts`

---

## 1. Extract CLI authentication into a reusable step

In `auth-sync.ts`, create a new exported function `ensureCliAuth()`.

```typescript
export async function ensureCliAuth(
  deps: Pick<AuthDeps, 'authService' | 'files' | 'homeDir' | 'prompter'>,
): Promise<CliAuth | null>;
```

**Behavior:**

- Read `~/.berget/auth.json` with `readCliAuth()`.
- If present and not expired (`!isTokenExpired(...)`), return the parsed `CliAuth`.
- If missing/expired:
  - Show a note: `Authentication required to use Berget AI.` (title: `Connect your account`, using `prompter.note`).
  - Start `authService.loginInteractive({ debug: process.env.LOG_LEVEL === 'debug' })` with a spinner titled `Waiting for browser login...`.
  - On failure:
    - Stop spinner with `Login failed.`.
    - Show failure note via `prompter.note(...)`. Use `title: 'Authentication Failed'` and the same body as existing code.
    - Return `null`.
  - On success:
    - Stop spinner with `Successfully logged in to Berget.`.
    - Validate the JWT expiry with `extractJwtExpiresAt(...)`.
      - If invalid (returns `0`):
        - Stop spinner with `Login succeeded but received invalid token.`.
        - Show note: `Please try logging in again or contact support.` (title: `Authentication Error`).
        - Return `null`.
      - Otherwise return the new `CliAuth`.

> **Important**: Preserve the same note titles and spinner wording that exist in `configureAuth` today to keep UI consistency.

---

## 2. Simplify `configureAuth`

Change signature to accept the pre-fetched CLI auth and narrow dependencies (no longer needs `authService`):

```typescript
export async function configureAuth(
  deps: Pick<AuthDeps, 'apiKeyService' | 'files' | 'homeDir' | 'prompter'>,
  tool: 'opencode' | 'pi',
  cliAuth: CliAuth | null,
): Promise<AuthResult>;
```

**Behavior changes:**

- Keep the tool auth check (`isToolAuthenticated`) and the `keep` / `reconfigure` prompt exactly as-is.
- **Remove** the block that reads `~/.berget/auth.json` (line 66).
- **Remove** the block that calls `authService.loginInteractive(...)` (lines 68-99).
- In the `else` branch (not already tool-authenticated), **only** show `prompter.note('Authentication required to use Berget AI.', 'Connect your account')` when `cliAuth !== null`. This prevents a double note when `ensureCliAuth()` has already alerted the user and failed.
- **After** the `keep` / `reconfigure` logic, if `cliAuth === null`, return `{ authenticated: false }` immediately.
  - This means: if user chose `keep`, we return `true` regardless of `cliAuth`. If they chose `reconfigure` or were not yet tool-authenticated, and `cliAuth` is null, return `false`.
- Keep the seat detection, subscription/API-key choice, and API-key creation logic.

---

## 3. Reorder steps in `init.ts`

Change `runInit` order:

```
1. const cliAuth = await ensureCliAuth(deps)  // FIRST STEP - login if needed
2. const tool = await prompter.select(...)
3. const scope = await prompter.select(...)
4. const authResult = await configureAuth(deps, tool, cliAuth)
// rest unchanged
```

Imports:

- Keep the existing import for `configureAuth` (it is still called).
- Add a new import for `ensureCliAuth`.

---

## 4. Update tests

### `auth-sync.test.ts`

- Refactor every `configureAuth` call to pass a pre-built `CliAuth` as the **third** argument.
- Remove the `authService` dependency from `makeAuthDeps` inside the `configureAuth` describe block (or pass a dummy) since `configureAuth` no longer uses it.
- Add a new `describe` block for `ensureCliAuth` covering:
  - Valid existing token → returns it without calling `loginInteractive`.
  - Expired existing token → calls `loginInteractive`.
  - No existing token + successful login → returns auth.
  - No existing token + failed login → returns `null`.
  - Invalid JWT after login → returns `null` **and** emits the `Authentication Error` note.

- **Important** — reinterpret these existing test cases:
  - `Case A reconfigure: already authenticated — reconfigure with fresh browser login`: after the refactor, `configureAuth` never calls `loginInteractive`. Instead, pass a manually-built `CliAuth` as the third argument, select `reconfigure`, then select `subscription`. Assert `authenticated: true`.
  - `Case E: login fails`: now handled entirely by `ensureCliAuth`. In `configureAuth` tests, pass `cliAuth: null` and assert `{ authenticated: false }`. Also assert no further prompts (e.g., `prompter.select` for subscription/API key) were consumed.
  - `fails authentication when jwt decode fails`: after login, `ensureCliAuth` validates the JWT; this test belongs to `ensureCliAuth`. In `configureAuth` tests, simply pass an invalid `CliAuth` object and assert `{ authenticated: false }`.

### `setup-flow.test.ts`

Update every `runInit` test prompter script:

1. **Happy-path tests** (`sets up opencode project without existing config`, `sets up opencode globally`, `sets up pi project`, `skips agent selection`, etc.):
   - These currently don't seed `~/.berget/auth.json` and default to `FakeAuthService(false)`, which means `ensureCliAuth()` would attempt a failing login.
   - **Seed `~/.berget/auth.json`** with a valid, non-expired token so `ensureCliAuth()` silently succeeds.
   - **Do not** add new prompt entries to the `FakePrompter` script; `ensureCliAuth` consumes no prompts when a valid token exists.
   - Consider adding a test helper to reduce boilerplate:
     ```typescript
     function seedValidCliAuth(files: FakeFileStore, homeDir: string, hasSeat = false): void {
       const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 365;
       files.seed(
         `${homeDir}/.berget/auth.json`,
         JSON.stringify({
           access_token: makeJwt({
             exp,
             realm_access: {
               roles: hasSeat ? ['berget_code_seat'] : ['default-roles-berget'],
             },
           }),
           expires_at: exp * 1000,
           refresh_token: 'ref',
         }),
       );
     }
     ```

2. If the test expects auth to succeed (e.g. `already authenticated shows simplified message`, `uses subscription when berget_code_seat present`, `creates api key for pi when no seat`):
   - **Seed `~/.berget/auth.json`** with a valid, non-expired token, **OR**
   - Seed with an expired token and use a `FakeAuthService(true)` so `ensureCliAuth` performs a successful interactive login.
   - If you seed a valid token, the prompter script must **not** expect an extra prompt for `ensureCliAuth`; it silently returns the token.

3. If the test expects auth to fail (e.g. `login failure shows manual auth instructions`):
   - Use `FakeAuthService(false)` and do **not** seed a valid token.
   - The script array stays the same (no extra prompts consumed), since `ensureCliAuth` will call `loginInteractive` internally and return `null` silently.

4. For the **`already authenticated shows simplified message`** test specifically:
   - The test already seeds `~/.local/share/opencode/auth.json`.
   - **Also** seed `~/.berget/auth.json` with a valid token so `ensureCliAuth` skips.
   - The prompter script already has `select('keep')` after tool & scope selection; keep that in place.

5. For tests where no pre-existing CLI auth exists and auth should succeed:
   - Add a valid `~/.berget/auth.json` seed.
   - Do **not** add new prompt entries to the `FakePrompter` script.

---

## Notes

- Make **minimal** changes to `configureAuth`.
- Keep the same error handling and spinner wording.
- Existing `authService.login()` from `commands/auth.ts` is the wrapper that prints to stdout; we must continue using `loginInteractive()` inside the wizard to stay UI-agnostic and show spinners via clack.
- **Edge case**: if a user is already tool-authenticated (`alreadyAuth === true`) and chooses `keep`, they bypass `configureAuth`'s null-check and return `true`, even if `ensureCliAuth` failed earlier. This preserves the current behavior.
- **Edge case**: if a user is already tool-authenticated and chooses `reconfigure`, they now land at `cliAuth === null → return false` when the browser login failed. This is acceptable because they explicitly asked to reconfigure and `ensureCliAuth` already showed the failure note.
