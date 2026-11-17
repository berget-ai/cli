import { randomUUID } from 'node:crypto';

import type { CommandRunner } from './ports/command-runner.js';
import type { Prompter } from './ports/prompter.js';

import { extractJwtExpiresAt } from '../../auth/jwt.js';
import { logger } from '../../utils/logger.js';

/**
 * OpenCode V2 credential bridge.
 *
 * OpenCode v2 stores credentials in its own database and never reads the V1
 * `auth.json` on fresh installs (its legacy-import migration only runs when
 * upgrading an *existing* older-V2 database). Running only the wizard's own
 * CLI login therefore leaves V2 users unauthenticated: "berget code init"
 * says the seat is ready, but OpenCode asks the user to log in again on
 * first launch.
 *
 * Fix: hand the wizard-resolved credential to OpenCode through its official
 * `opencode auth import` channel — the same JSON shape `opencode auth export`
 * prints. This is version-proof (no writes to the tool's private storage
 * format) and keeps V1 unaffected: V1 binaries have no `auth import`
 * subcommand and are detected by version + skipped. The import is
 * best-effort and never fails the wizard.
 */

export type CredentialToImport = ApiKeyCredential | OAuthCredential;
export interface OpencodeImportResult {
  /** true when `opencode auth import` reported success. */
  imported: boolean;
  /** Human-readable explanation when imported=false. 'skipped-v1' when V1 is not affected. */
  reason?: string;
}

type ApiKeyCredential = { key: string; kind: 'key' };

type OAuthCredential = { access: string; kind: 'oauth'; refresh: string };

/**
 * Imports the credential into OpenCode v2's credential store. Failures are
 * logged, surfaced as imported=false, and the user gets `manualInstructions`
 * as a fallback note — the wizard must not block on this.
 */
export async function importCredentialToOpencode(
  deps: { commands: CommandRunner; prompter: Prompter },
  credential: CredentialToImport,
  manualInstructions?: string,
): Promise<OpencodeImportResult> {
  let versionOutput: string;
  try {
    versionOutput = await deps.commands.run('opencode', ['--version']);
  } catch (error) {
    logger.warn('Could not determine OpenCode version', String(error));
    return { imported: false, reason: 'opencode --version failed' };
  }

  const major = parseOpencodeVersionMajor(versionOutput);
  if (major === null) {
    logger.warn('Could not parse OpenCode version output', versionOutput.trim());
    return { imported: false, reason: 'could not parse opencode version' };
  }
  if (major < 2) {
    // OpenCode 1.x has no `auth import`; its credential store IS the CLI's
    // sandbox (auth.json was never written for this tool on main). Keep the
    // manual /connect instructions as-is.
    return { imported: false, reason: 'skipped-v1' };
  }

  try {
    await deps.commands.run('opencode', ['auth', 'import'], {
      input: toAuthExportPayload(credential),
    });
  } catch (error) {
    const message = String(error);
    logger.warn('opencode auth import failed', message);
    deps.prompter.note(
      `OpenCode credential import failed.${manualInstructions ? ` To connect manually: ${manualInstructions}` : ''}`,
      'Heads up',
    );
    return { imported: false, reason: message };
  }

  return { imported: true };
}

/** Parses "opencode v2.0.32" (or "2.0.32") into the major version. */
export function parseOpencodeVersionMajor(versionOutput: string): null | number {
  // Anchored to the full version token so leading non-version digits (build
  // banners, dates) can never parse as a bogus major.
  const match = versionOutput.match(/\bv?\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  if (!match) return null;
  const major = Number.parseInt(match[0].replace(/^\D+/, ''), 10);
  return Number.isFinite(major) ? major : null;
}

/**
 * Formats the wizard-resolved credential in OpenCode's auth-export shape.
 * `methodID: 'oauth'` matches the PKCE method id the auth plugin registers,
 * so the imported credential refreshes through the right method.
 */
export function toAuthExportPayload(credential: CredentialToImport): string {
  const value =
    credential.kind === 'oauth'
      ? {
          access: credential.access,
          expires: extractJwtExpiresAt(credential.access),
          methodID: 'oauth',
          refresh: credential.refresh,
          type: 'oauth',
        }
      : { key: credential.key, type: 'key' };

  return (
    JSON.stringify([
      {
        active: true,
        // `auth import` requires an explicit id per credential (validated
        // against `opencode v2.0.32`: "Missing key @[0].id").
        id: `cred_${randomUUID()}`,
        integrationID: 'berget',
        label: 'Berget AI',
        value,
      },
    ]) + '\n'
  );
}
