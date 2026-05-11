# Berget Code Setup — Authentication Integration Plan

## Goal

Make `berget code setup` **self-contained**. By the end of the flow, the user is fully authenticated for the selected tool (OpenCode or Pi). No manual `/connect`, `/login`, or prior `berget auth login` required.

## Current State

After setup, the user sees instructions like:

```
1. Run: opencode
2. Type: /connect
3. Choose your auth method
```

This creates friction. The user must exit the wizard, start another program, and figure out auth themselves.

## Auth File Formats

### 1. Berget CLI (`~/.berget/auth.json`)

Written by `berget auth login` / `AuthService`.

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzUxMiIs...",
  "expires_at": 1778503828552
}
```

The `access_token` is a JWT. Decoding the payload reveals the user's roles, including whether they have a `berget_code_seat`.

### 2. OpenCode (`~/.local/share/opencode/auth.json`)

Managed by OpenCode internally. We write DIRECTLY to this file during setup.

**OAuth format:**

```json
{
  "berget": {
    "type": "oauth",
    "access": "eyJhbGciOiJSUzI1NiIs...",
    "refresh": "eyJhbGciOiJIUzUxMiIs...",
    "expires": 1778503828552
  }
}
```

**API key format:**

```json
{
  "berget": {
    "type": "api",
    "key": "sk_ber_..."
  }
}
```

### 3. Pi (`~/.pi/agent/auth.json`)

Managed by the Pi framework's `AuthStorage`. We write DIRECTLY to this file during setup.

**OAuth format:**

```json
{
  "berget": {
    "type": "oauth",
    "refresh": "eyJhbGciOiJIUzUxMiIs...",
    "access": "eyJhbGciOiJSUzI1NiIs...",
    "expires": 1778503828552
  }
}
```

**API key format:**

```json
{
  "berget": {
    "type": "api_key",
    "key": "sk_ber_..."
  }
}
```

### Mapping from CLI to Tools

| CLI Field       | OpenCode Field | Pi Field  |
| --------------- | -------------- | --------- |
| `access_token`  | `access`       | `access`  |
| `refresh_token` | `refresh`      | `refresh` |
| `expires_at`    | `expires`      | `expires` |

The OpenCode and Pi auth files are **provider-indexed objects** (keyed by `"berget"`). They may contain OTHER providers (OpenAI, Anthropic, etc.), so we must **merge** — not overwrite.

**Type mapping per tool:**

- OpenCode API key: `"type": "api"`
- Pi API key: `"type": "api_key"`

These formats are dictated by the respective tools and cannot be changed by us.

### Detecting Berget Code Plan

Decode the JWT `access_token` payload (split `.`, base64 decode). Check:

```json
{
  "realm_access": {
    "roles": ["berget_code_seat", "default-roles-berget", ...]
  }
}
```

If `"berget_code_seat"` is present → user has a Berget Code subscription.

## Architecture

### New Port: `AuthServicePort`

```typescript
export interface AuthServicePort {
  login(): Promise<boolean>;
}
```

Implemented by `AuthService` (existing) via duck typing. The setup flow calls this to perform the browser PKCE login.

### New Port: `ApiKeyServicePort`

```typescript
export interface ApiKeyServicePort {
  create(options: { name: string; description?: string }): Promise<{ key: string }>;
}
```

Implemented by `ApiKeyService` (existing) via duck typing. Called when a non-Berget-Code user agrees to create an API key.

### Extended Port: `Prompter`

Add `text()` method for future use (e.g., manually pasting an API key):

```typescript
text(opts: { message: string; placeholder?: string }): Promise<string>
```

Implemented by `ClackPrompter` (wraps `@clack/prompts`'s `text()`) and `FakePrompter` (test double).

### Extended Port: `FileStore`

Add `chmod()` for `0o600` permissions on auth files:

```typescript
chmod(path: string, mode: number): Promise<void>
```

Implemented by `FsFileStore` (delegates to `fs.promises.chmod()`) and `FakeFileStore`.

### New Module: `auth-sync.ts`

Pure functions + async file I/O. No side effects except file writes.

```typescript
// Reads ~/.berget/auth.json
function readCliAuth(files: FileStore, homeDir: string): CliAuth | null;

// Checks if tool already has "berget" entry in its auth.json
function isToolAuthenticated(files: FileStore, homeDir: string, tool: "opencode" | "pi"): boolean;

// Decodes JWT payload (no signature verification)
function decodeJwtPayload(token: string): any | null;

// Checks for "berget_code_seat" role in JWT
function hasBergetCodeSeat(accessToken: string): boolean;

// Maps CLI tokens to tool format and merges into auth file
async function syncOAuthToTool(
  files: FileStore,
  homeDir: string,
  tool: "opencode" | "pi",
  cliAuth: CliAuth
): Promise<void>;

// Writes API key to tool auth file (merges with existing)
async function syncApiKeyToTool(
  files: FileStore,
  homeDir: string,
  tool: "opencode" | "pi",
  apiKey: string
): Promise<void>;

// Main orchestration — called from setup.ts
async function configureAuth(deps: WizardDeps, tool: "opencode" | "pi"): Promise<AuthResult>;
```

### Updated: `setup.ts`

**Extended `WizardDeps`:**

```typescript
export interface WizardDeps {
  prompter: Prompter;
  files: FileStore;
  commands: CommandRunner;
  authService: AuthServicePort;
  apiKeyService: ApiKeyServicePort;
  homeDir: string;
  cwd: string;
}
```

**Integration point:**

After `tool` and `scope` are selected, call `configureAuth(deps, tool)`. Receive `AuthResult`.

**Conditional post-setup message:**

- If `authResult.authenticated === true` → Show simplified next steps (no `/connect` or `/login`)
- If `authResult.authenticated === false` → Show original instructions with `/connect` or `/login`

**Production entry point:** Wire real services:

```typescript
import { AuthService } from "../../services/auth-service";
import { ApiKeyService } from "../../services/api-key-service";

await runSetup({
  prompter: new ClackPrompter(),
  files: new FsFileStore(),
  commands: new SpawnCommandRunner(),
  authService: AuthService.getInstance(),
  apiKeyService: ApiKeyService.getInstance(),
  homeDir: os.homedir(),
  cwd: process.cwd(),
});
```

## User Flow

### Case A: Already Authenticated

```
Checking authentication... already connected ✓
```

Skip auth entirely. Show "You're authenticated and ready to go!"

### Case B: Not Authenticated → Log In → Has Berget Code

```
Authentication required to use Berget AI.

┌─────────────────────────────┐
│ Connect your account        │
└─────────────────────────────┘

Initiating login process...
Browser opened for authentication...
✓ Successfully logged in to Berget

You have a Berget Code subscription. How do you want to authenticate?
  ◉ Use my Berget Code subscription
  ○ Use an API key instead

Authenticating with Berget AI via subscription...
✓ Authenticated.
```

Map OAuth tokens from `~/.berget/auth.json` to the tool's auth file.

### Case C: Not Authenticated → Log In → No Berget Code → Creates API Key

```
Authentication required to use Berget AI.

┌─────────────────────────────┐
│ Connect your account        │
└─────────────────────────────┘

Initiating login process...
Browser opened for authentication...
✓ Successfully logged in to Berget

You do not have a Berget Code subscription. Would you like to create a new API key?
  ◉ Yes
  ○ No

Creating API key...
✓ API key created and saved to OpenCode.
```

Map API key to the tool's auth file. The key is saved to the tool auth file and not displayed.

### Case D: Not Authenticated → Log In → No Berget Code → Declines API Key

```
You do not have a Berget Code subscription. Would you like to create a new API key?
  ○ Yes
  ◉ No

Authentication skipped. You'll need to set up authentication manually:
1. Run: berget api-keys create --name "My Key"
2. Set BERGET_API_KEY environment variable, or
3. Run `berget auth login` and try again
```

### Case E: Login Fails

```
Initiating login process...

┌─────────────────────────────┐
│ Authentication Failed       │
│                             │
│ Login timed out or was      │
│ cancelled.                  │
└─────────────────────────────┘

Please run `berget auth login` manually, then run `berget code setup` again.
```

Continue with setup but show original post-setup instructions.

## Implementation Steps

1. **Extend ports**
   - `prompter.ts`: add `text()`
   - `file-store.ts`: add `chmod()` (async, delegates to `fs.promises.chmod()`)
   - `ports/auth-services.ts`: create `AuthServicePort`, `ApiKeyServicePort` (duck typing, existing services don't need `implements`)

2. **Update adapters**
   - `clack-prompter.ts`: implement `text()`
   - `fs-file-store.ts`: implement `chmod()`

3. **Create `auth-sync.ts`**
   - Read CLI auth (`~/.berget/auth.json`)
   - Detect existing tool auth
   - JWT decode + `berget_code_seat` detection
   - Merge-write to OpenCode/Pi auth files with `0o600`
   - Tool-specific type mapping (`api` for OpenCode, `api_key` for Pi)

4. **Update `setup.ts`**
   - Add `authService` and `apiKeyService` to `WizardDeps`
   - Insert `configureAuth()` call after tool/scope selection
   - Update post-setup messages conditionally
   - Wire real services in `runSetupCommand()`

5. **Update tests**
   - `FakePrompter`: add `text()`
   - `FakeFileStore`: add `chmod()`
   - Create `FakeAuthService` and `FakeApiKeyService` for tests
   - Add test cases for all 5 user flows
   - Update existing test `makeDeps()` to include auth service fakes
   - Split auth tests: `auth-sync.test.ts` (unit tests for pure functions) + `setup-flow.test.ts` (integration tests)

## Test Coverage

| #   | Scenario                                                  | Test File          | Mocks                                                                                          |
| --- | --------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| 1   | Already authenticated in tool                             | setup-flow.test.ts | Seed tool auth.json with `"berget"` entry                                                      |
| 2   | Login success + `berget_code_seat` → chooses subscription | setup-flow.test.ts | FakeAuthService.login → true, FakePrompter selects "subscription"                              |
| 3   | Login success + `berget_code_seat` → chooses API key      | setup-flow.test.ts | FakeAuthService.login → true, FakePrompter selects "api_key", text() returns key               |
| 4   | Login success + no seat → creates API key                 | setup-flow.test.ts | FakeAuthService.login → true, FakePrompter confirms true, FakeApiKeyService.create returns key |
| 5   | Login success + no seat → declines API key                | setup-flow.test.ts | FakeAuthService.login → true, FakePrompter confirms false                                      |
| 6   | Login fails                                               | setup-flow.test.ts | FakeAuthService.login → false                                                                  |
| 7   | Existing config preserved                                 | auth-sync.test.ts  | Seed auth.json with `"openai"` entry, verify it remains after writing `"berget"`               |
| 8   | `0o600` permissions                                       | auth-sync.test.ts  | Verify `chmod()` called with `0o600` on auth file writes                                       |
| 9   | `readCliAuth` returns correct shape                       | auth-sync.test.ts  | Seed `~/.berget/auth.json`                                                                     |
| 10  | `decodeJwtPayload` decodes correctly                      | auth-sync.test.ts  | Pass known JWT, assert payload                                                                 |
| 11  | `hasBergetCodeSeat` detects role                          | auth-sync.test.ts  | Pass token with/without `berget_code_seat`                                                     |
| 12  | JWT decode failure fallback                               | auth-sync.test.ts  | Pass invalid token, verify OAuth still synced                                                  |

## API Key Naming Convention

When auto-creating an API key:

```typescript
{
  name: `${toolName} (created by berget CLI)`,
  description: "Created by berget code setup"
}
```

Examples:

- OpenCode: `"OpenCode (created by berget CLI)"`
- Pi: `"Pi (created by berget CLI)"`

## Error Handling

- **Login fails** → Show note, continue setup, but auth remains `false`. Post-setup instructions include manual auth steps.
- **API key creation fails** → Show error note, auth remains `false`.
- **File write fails** → Throw as usual (setup error).
- **JWT decode fails** → Sync OAuth tokens anyway and show warning. Do NOT force API key creation — the tokens are valid even if we can't verify the subscription role.

## Security Considerations

- Auth files are written with `0o600` permissions (owner read/write only)
- `~/.berget/auth.json` is never modified by the setup flow, only read
- API keys are written to tool auth files; they are not displayed to stdout
- Other providers' entries in tool auth files are preserved during merge
