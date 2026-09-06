import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseGitHubRepo, WORKFLOW_TEMPLATE } from '../ai-review.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('parseGitHubRepo', () => {
  it('parses https remotes', () => {
    expect(parseGitHubRepo('https://github.com/berget-ai/cli.git')).toEqual({
      owner: 'berget-ai',
      repo: 'cli',
    });
  });

  it('parses ssh remotes', () => {
    expect(parseGitHubRepo('git@github.com:berget-ai/cli.git')).toEqual({
      owner: 'berget-ai',
      repo: 'cli',
    });
  });

  it('parses remotes without .git suffix', () => {
    expect(parseGitHubRepo('https://github.com/berget-ai/cli')).toEqual({
      owner: 'berget-ai',
      repo: 'cli',
    });
  });

  it('returns null for non-GitHub remotes', () => {
    expect(parseGitHubRepo('https://gitlab.com/a/b.git')).toBeNull();
  });
});

describe('WORKFLOW_TEMPLATE', () => {
  it('stays in sync with the dogfooded .github/workflows/ai-review.yml', () => {
    const dogfooded = readFileSync(join(REPO_ROOT, '.github/workflows/ai-review.yml'), 'utf8');

    // The shipped workflow adds the org-wide approve/app inputs; the CLI
    // template targets external users in key-only (comment) mode. Everything
    // else — action pin, triggers, gating, concurrency — must be identical.
    const stripped = dogfooded
      .split('\n')
      .filter(
        (line) =>
          !line.includes('approve:') &&
          !line.includes('github_app_id:') &&
          !line.includes('github_app_private_key:'),
      )
      .join('\n');

    expect(WORKFLOW_TEMPLATE).toBe(stripped);
  });

  it('pins the action to a commit SHA', () => {
    expect(WORKFLOW_TEMPLATE).toMatch(/uses: berget-ai\/ai-review-action@[0-9a-f]{40}/);
  });

  it('triggers on @berget with author association gating', () => {
    expect(WORKFLOW_TEMPLATE).toContain("contains(github.event.comment.body, '@berget')");
    expect(WORKFLOW_TEMPLATE).toContain('author_association');
  });
});
