import chalk from 'chalk';
import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure.js';
import { ApiKeyService } from '../services/api-key-service.js';
import { handleError } from '../utils/error-handler.js';

const WORKFLOW_PATH = '.github/workflows/ai-review.yml';

/**
 * The workflow stamped out by `berget ai-review setup`.
 * MUST stay in sync with this repo's own .github/workflows/ai-review.yml —
 * enforced by src/commands/__tests__/ai-review.test.ts. The only difference:
 * the dogfooded file adds `github_app_*`/`approve` inputs for the org-wide
 * Berget AI app (approvals); customers use the key-only (comment) mode by
 * default and can opt into approvals later.
 */
export const WORKFLOW_TEMPLATE = `name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  issue_comment:
    types: [created]
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write
  issues: write

concurrency:
  group: ai-review-\${{ github.event_name }}-\${{ github.event.pull_request.number || github.event.issue.number || github.run_id }}
  cancel-in-progress: true

jobs:
  review:
    name: AI Review
    runs-on: ubuntu-latest
    if: |
      github.event_name == 'pull_request' ||
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'issue_comment' &&
       github.event.issue.pull_request &&
       contains(github.event.comment.body, '@berget') &&
       contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'),
                github.event.comment.author_association))
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: >-
            \${{
              github.event.pull_request.head.sha ||
              (github.event.issue.pull_request && format('refs/pull/{0}/merge', github.event.issue.number)) ||
              github.sha
            }}
      - uses: berget-ai/ai-review-action@1400f87fac1db96181eea507e7d86997d6c02ba1 # v1.3 (@berget trigger)
        with:
          api_key: \${{ secrets.BERGET_API_KEY }}
          use_dora: 'false'
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

const PR_BODY = `Adds [berget-ai/ai-review-action](https://github.com/berget-ai/ai-review-action), an AI code reviewer running on EU-sovereign GPU infrastructure (Berget AI).

## How to use

- Open a PR — the review appears automatically within a couple of minutes
- Comment **\`@berget\`** on any PR to re-run it (incrementally — only new commits are reviewed)
- Comment **\`@berget focus on error handling\`** for a full review with a specific focus
- Only repo owners, members, and collaborators can trigger it

The \`BERGET_API_KEY\` secret has already been added to this repo by \`berget ai-review setup\`.

## Why

- Inline findings on the diff + structured summary
- Diffs never leave Europe (Swedish GPU infrastructure)
- Usage is billed to your Berget account (free tier included)

Created with [\`berget ai-review setup\`](https://github.com/berget-ai/cli).
`;

interface SetupOptions {
  branch: string;
  dryRun: boolean;
  keyName?: string;
  overwrite: boolean;
  skipKey: boolean;
}

export function parseGitHubRepo(remoteUrl: string): null | { owner: string; repo: string } {
  // Handles https://github.com/o/r.git and git@github.com:o/r.git
  const m = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Register the ai-review setup command
 */
export function registerAiReviewCommands(program: Command): void {
  const group = program
    .command(COMMAND_GROUPS.AI_REVIEW)
    .description('Set up the Berget AI code review bot in a GitHub repository');

  group
    .command(SUBCOMMANDS.AI_REVIEW.SETUP)
    .description(
      'Create a Berget API key, register it as BERGET_API_KEY repo secret, and open a PR adding the AI review workflow. Run inside the target git repository.',
    )
    .option('--key-name <name>', 'Name for the created API key (default: ai-review-<repo>)')
    .option('--branch <name>', 'Branch name for the setup PR', 'chore/ai-review')
    .option('--overwrite', 'Overwrite the workflow file if it already exists', false)
    .option('--skip-key', 'Skip API key creation AND secret registration entirely', false)
    .option('--dry-run', 'Print what would be done without changing anything', false)
    .action(async (options: SetupOptions) => {
      try {
        await setup(options);
      } catch (error) {
        handleError('Failed to set up AI review', error);
      }
    });
}

function run(cmd: string, args: string[], opts: { cwd: string; input?: string }): string {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    input: opts.input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    const err = new Error(
      `${cmd} ${args.join(' ')} failed:\n${res.stderr || res.stdout}`,
    ) as Error & {
      stderr?: string;
    };
    err.stderr = res.stderr ?? '';
    throw err;
  }
  return (res.stdout ?? '').trim();
}

async function setup(options: SetupOptions): Promise<void> {
  const cwd = process.cwd();

  // --- Preflight -----------------------------------------------------------
  console.log(chalk.bold('🔍 Preflight checks'));

  if (!existsSync(join(cwd, '.git'))) {
    throw new Error('Not a git repository. Run this inside the repo you want to set up.');
  }
  console.log(chalk.dim('  ✓ inside a git repository'));

  const remoteUrl = tryRun('git', ['remote', 'get-url', 'origin'], { cwd });
  const gh = remoteUrl ? parseGitHubRepo(remoteUrl) : null;
  if (!gh) {
    throw new Error(`Could not parse a GitHub remote from origin (${remoteUrl ?? 'none'}).`);
  }
  console.log(chalk.dim(`  ✓ GitHub repo: ${gh.owner}/${gh.repo}`));

  if (tryRun('gh', ['--version'], { cwd }) === null) {
    throw new Error('gh CLI not found. Install it first: https://cli.github.com');
  }
  const authStatus = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: 'pipe' });
  if (authStatus.status !== 0) {
    throw new Error('gh CLI is not authenticated. Run `gh auth login` first.');
  }
  console.log(chalk.dim('  ✓ gh CLI authenticated'));

  // Verify we can administer the repo BEFORE creating a billed API key.
  if (tryRun('gh', ['secret', 'list', '-R', `${gh.owner}/${gh.repo}`], { cwd }) === null) {
    throw new Error(`Cannot read secrets on ${gh.owner}/${gh.repo} — need write/admin access.`);
  }

  const workflowPath = join(cwd, WORKFLOW_PATH);
  const workflowExists = existsSync(workflowPath);
  if (workflowExists && !options.overwrite) {
    console.log(
      chalk.yellow(
        `\n${WORKFLOW_PATH} already exists — nothing to do.\nPass --overwrite to replace it${options.skipKey ? ' (with --skip-key the secret is left untouched)' : ''}.`,
      ),
    );
    return;
  }
  console.log(
    workflowExists
      ? chalk.dim('  ✓ existing workflow will be overwritten (--overwrite)')
      : chalk.dim('  ✓ no existing review workflow'),
  );

  const keyName = options.keyName ?? `ai-review-${gh.repo}`;

  if (options.dryRun) {
    console.log(chalk.bold('\n🧪 Dry run — these steps would be executed:'));
    if (!options.skipKey) {
      console.log(`  1. Create API key "${keyName}" in your Berget account`);
      console.log(`  2. Register it as secret BERGET_API_KEY on ${gh.owner}/${gh.repo}`);
    }
    console.log(`  3. Write ${WORKFLOW_PATH}`);
    console.log(`  4. Push branch "${options.branch}" and open a setup PR`);
    return;
  }

  // --- 1+2. API key + secret ------------------------------------------------
  if (!options.skipKey) {
    console.log(chalk.bold('\n🔑 Creating Berget API key'));
    const apiKeyService = ApiKeyService.getInstance();
    const created = await apiKeyService.create({ name: keyName });

    console.log(chalk.bold('🤫 Registering repository secret BERGET_API_KEY'));
    // Value is passed on stdin, never on the command line.
    run('gh', ['secret', 'set', 'BERGET_API_KEY', '-R', `${gh.owner}/${gh.repo}`], {
      cwd,
      input: created.key,
    });
    console.log(chalk.dim('  ✓ secret registered (key id: ' + created.id + ')'));
  }

  // --- 3. Workflow file -----------------------------------------------------
  console.log(chalk.bold('\n📝 Writing ' + WORKFLOW_PATH));
  mkdirSync(dirname(workflowPath), { recursive: true });
  writeFileSync(workflowPath, WORKFLOW_TEMPLATE);

  // --- 4. Branch (from default branch head), commit, PR ----------------------
  console.log(chalk.bold('🌿 Creating branch + PR'));
  const defaultBranch =
    tryRun(
      'gh',
      [
        'repo',
        'view',
        `${gh.owner}/${gh.repo}`,
        '--json',
        'defaultBranchRef',
        '-q',
        '.defaultBranchRef.name',
      ],
      {
        cwd,
      },
    ) ?? 'main';
  run('git', ['fetch', 'origin', defaultBranch], { cwd });
  run('git', ['checkout', '-B', options.branch, `origin/${defaultBranch}`], { cwd });
  run('git', ['add', WORKFLOW_PATH], { cwd });
  run(
    'git',
    ['commit', '-m', 'ci: add Berget AI code review\n\nSet up with `berget ai-review setup`.'],
    {
      cwd,
    },
  );

  try {
    run('git', ['push', '-u', 'origin', options.branch], { cwd });
  } catch (error) {
    const stderr = (error as Error & { stderr?: string }).stderr ?? '';
    if (!/non-fast-forward|rejected/.test(stderr)) throw error;
    run('git', ['push', '--force-with-lease', '-u', 'origin', options.branch], { cwd });
  }

  const prUrl = run(
    'gh',
    [
      'pr',
      'create',
      '-R',
      `${gh.owner}/${gh.repo}`,
      '--title',
      'ci: add Berget AI code review',
      '--body',
      PR_BODY,
      '--head',
      options.branch,
    ],
    { cwd },
  );

  console.log('');
  console.log(chalk.green('✅ Setup PR created: ') + chalk.cyan(prUrl));
  console.log(chalk.dim('Merge it, then comment "@berget" on any PR to trigger a review.'));
  console.log(chalk.dim('Docs: https://github.com/berget-ai/ai-review-action'));
}

function tryRun(cmd: string, args: string[], opts: { cwd: string }): null | string {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
}
