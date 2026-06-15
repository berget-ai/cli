# Remove Agent Selection from Pi in the Init Command

## Goal

Stop prompting users to select and configure an agent during `berget code init` when they choose Pi. The Pi init flow should only install the provider and set `defaultProvider = 'berget'`.

## Background

Pi uses a single system prompt (`SYSTEM.md`), so the init wizard currently asks:

1. "Set up an agent for Pi?"
2. Choose an agent from a list
3. Write/replace `SYSTEM.md`

This adds friction. Pi users can configure agents manually; the init command should focus on auth + provider setup only.

OpenCode will keep its multi-agent selection flow (agents are stored as separate `.md` files).

## Files to Change

### 1. `src/commands/code/init.ts`

- Remove `initPiAgent` from the import from `./pi.js`
- In `configureTool()`, remove the `await initPiAgent({ cwd, files, homeDir, prompter, scope })` call

### 2. `src/commands/code/pi.ts`

- Delete the entire `initPiAgent` function
- Remove unused imports: `getAllAgents`, `toPiPrompt`
- `getPiAgentDir` is still used for auth/settings paths → **keep**

### 3. `src/agents/index.ts`

- Remove the `toPiPrompt` export (only used by `initPiAgent`)

### 4. `src/commands/code/__tests__/init.test.ts`

Update Pi-related tests to no longer include agent-selection prompts or assert `SYSTEM.md` creation.

| Action                   | Test(s)                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Remove agent prompts** | `sets up pi project with fresh install`, `preserves existing Pi settings when setting defaultProvider`, `creates api key for pi when no seat`, `login failure shows manual auth instructions`                                                             |
| **Delete**               | `skips agent selection for pi project` (rename or repurpose), `sets up agent for pi project`, `sets up agent for pi globally`, `overwrites pi SYSTEM.md when content differs`, `throws CancelledError when user cancels at agent write confirmation (pi)` |

## Verification

- [ ] `npm run test:run` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
