import { ClackPrompter } from '../code/adapters/clack-prompter';
import { FsFileStore } from '../code/adapters/fs-file-store';
import { SpawnCommandRunner } from '../code/adapters/spawn-command-runner';

import { CancelledError, CommandFailedError, PrerequisiteError } from '../code/errors';

import { runClusterInit } from './init';

export interface InitCommandOptions {
  clusterName?: string;
  components?: string;
  domain?: string;
  repoUrl?: string;
  templateRepo?: boolean;
}

export async function runClusterInitCommand(
  options: InitCommandOptions = {},
): Promise<void> {
  try {
    // Parse components if provided as comma-separated string
    const components = options.components
      ? options.components.split(',').map((c) => c.trim())
      : undefined;

    await runClusterInit(
      {
        commands: new SpawnCommandRunner(),
        cwd: process.cwd(),
        files: new FsFileStore(),
        prompter: new ClackPrompter(),
      },
      {
        clusterName: options.clusterName,
        components,
        domain: options.domain,
        repoUrl: options.repoUrl,
        templateRepo: options.templateRepo,
      },
    );

    process.exit(0);
  } catch (error) {
    if (error instanceof CancelledError) {
      console.log('\nOperation cancelled by user.');
      process.exit(130);
    }
    if (error instanceof PrerequisiteError) {
      console.error(`\nMissing required tool: ${error.binary}`);
      console.error(`Please install ${error.binary} and try again.`);
      process.exit(2);
    }
    if (error instanceof CommandFailedError) {
      console.error(`\nCommand failed: ${error.message}`);
      process.exit(error.exitCode);
    }
    throw error;
  }
}
