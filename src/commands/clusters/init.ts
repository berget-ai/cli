import chalk from 'chalk';

import type { CommandRunner } from '../code/ports/command-runner';
import type { FileStore } from '../code/ports/file-store';
import type { Prompter } from '../code/ports/prompter';

import { CancelledError, CommandFailedError, PrerequisiteError } from '../code/errors';

import {
  type ComponentConfig,
  generateComponentManifest,
  getAvailableComponents,
  getComponentDescription,
} from './yaml-generator';

export interface ClusterInitDeps {
  commands: CommandRunner;
  cwd: string;
  files: FileStore;
  prompter: Prompter;
}

export interface ClusterInitOptions {
  clusterName?: string;
  components?: string[];
  domain?: string;
  repoUrl?: string;
  templateRepo?: boolean;
}

/**
 * Run the interactive cluster initialization wizard
 */
export async function runClusterInit(
  deps: ClusterInitDeps,
  options: ClusterInitOptions = {},
): Promise<void> {
  const { commands, prompter } = deps;

  prompter.intro(`${chalk.bgGreen.black(' berget clusters init ')}`);
  prompter.note(
    `This wizard will set up FluxCD GitOps and infrastructure components on your Kubernetes cluster.\n\nPrerequisites:\n  • kubectl configured and pointing to your cluster\n  • flux CLI installed\n  • git configured with SSH key for GitHub`,
    'Cluster Initialization',
  );

  // Check prerequisites
  await checkPrerequisites(commands, prompter);

  // Get cluster configuration
  const clusterName =
    options.clusterName || (await promptClusterName(prompter));
  const domain = options.domain || (await promptDomain(prompter));

  // Determine repository setup
  const repoConfig = await promptRepositorySetup(prompter, options);

  // Select components
  const selectedComponents =
    options.components || (await promptComponents(prompter));

  if (selectedComponents.length === 0) {
    prompter.note('No components selected. Exiting.', 'Cancelled');
    return;
  }

  // Confirm configuration
  const config: ComponentConfig = {
    clusterName,
    domain,
  };

  const confirmed = await confirmConfiguration(prompter, {
    clusterName,
    components: selectedComponents,
    domain,
    repoUrl: repoConfig.url,
  });

  if (!confirmed) {
    throw new CancelledError();
  }

  // Execute setup
  if (repoConfig.type === 'template') {
    await setupFromTemplate(deps, config, selectedComponents, repoConfig);
  } else {
    await setupFromExistingRepo(deps, config, selectedComponents, repoConfig);
  }

  prompter.outro('Cluster initialization complete!');
  prompter.note(
    `Next steps:\n` +
      `  1. Commit and push the generated files to your repository\n` +
      `  2. FluxCD will automatically sync the components to your cluster\n` +
      `  3. Run 'flux get kustomizations -A' to monitor progress\n\n` +
      `For secrets (external-dns TSIG, grafana admin):\n` +
      `  kubectl create secret generic external-dns-tsig -n external-dns \\\n` +
      `    --from-literal=tsig-secret-keyname=external-dns \\\n` +
      `    --from-literal=tsig-secret-secret=YOUR_SECRET`,
    'Post-Setup',
  );
}

async function checkPrerequisites(
  commands: CommandRunner,
  prompter: Prompter,
): Promise<void> {
  const s = prompter.spinner();
  s.start('Checking prerequisites...');

  const checks = ['kubectl', 'flux', 'git'];
  const missing: string[] = [];

  for (const binary of checks) {
    const installed = await commands.checkInstalled(binary);
    if (!installed) {
      missing.push(binary);
    }
  }

  if (missing.length > 0) {
    s.stop(`Missing prerequisites: ${missing.join(', ')}`);
    throw new PrerequisiteError(missing[0]);
  }

  s.stop('All prerequisites found.');
}

async function promptClusterName(prompter: Prompter): Promise<string> {
  const name = await prompter.text({
    message: 'What is your cluster name?',
    placeholder: 'my-cluster',
  });

  if (!name || name.trim().length === 0) {
    throw new CancelledError();
  }

  // Validate cluster name (DNS-compatible)
  if (!/^[a-z0-9-]+$/.test(name)) {
    prompter.note(
      'Cluster name must contain only lowercase letters, numbers, and hyphens.',
      'Invalid name',
    );
    return promptClusterName(prompter);
  }

  return name;
}

async function promptDomain(prompter: Prompter): Promise<string> {
  const domain = await prompter.text({
    message: 'What is your base domain?',
    placeholder: 'example.com',
  });

  if (!domain || domain.trim().length === 0) {
    throw new CancelledError();
  }

  return domain;
}

interface RepoConfig {
  branch: string;
  path: string;
  type: 'existing' | 'new' | 'template';
  url: string;
}

async function promptRepositorySetup(
  prompter: Prompter,
  options: ClusterInitOptions,
): Promise<RepoConfig> {
  if (options.templateRepo) {
    return {
      branch: 'main',
      path: `clusters/${options.clusterName || 'my-cluster'}`,
      type: 'template',
      url: 'https://github.com/berget-ai/berget-k8s-template',
    };
  }

  if (options.repoUrl) {
    return {
      branch: 'main',
      path: `clusters/${options.clusterName || 'my-cluster'}`,
      type: 'existing',
      url: options.repoUrl,
    };
  }

  const choice = await prompter.select<'template' | 'existing' | 'new'>({
    message: 'How do you want to set up the GitOps repository?',
    options: [
      {
        hint: 'Use the official Berget cluster template (recommended)',
        label: 'Use berget-k8s-template',
        value: 'template',
      },
      {
        hint: 'Use an existing repository you have access to',
        label: 'Use existing repository',
        value: 'existing',
      },
      {
        hint: 'Create a new repository for this cluster',
        label: 'Create new repository',
        value: 'new',
      },
    ],
  });

  if (choice === 'template') {
    return {
      branch: 'main',
      path: `clusters/${options.clusterName || 'my-cluster'}`,
      type: 'template',
      url: 'https://github.com/berget-ai/berget-k8s-template',
    };
  }

  if (choice === 'existing') {
    const url = await prompter.text({
      message: 'Repository URL (SSH or HTTPS):',
      placeholder: 'git@github.com:org/repo.git',
    });

    if (!url) {
      throw new CancelledError();
    }

    return {
      branch: 'main',
      path: `clusters/${options.clusterName || 'my-cluster'}`,
      type: 'existing',
      url,
    };
  }

  // New repository
  const repoName = await prompter.text({
    message: 'New repository name:',
    placeholder: 'my-cluster-infra',
  });

  if (!repoName) {
    throw new CancelledError();
  }

  const owner = await prompter.text({
    message: 'GitHub owner/organization:',
    placeholder: 'my-org',
  });

  if (!owner) {
    throw new CancelledError();
  }

  return {
    branch: 'main',
    path: `clusters/${options.clusterName || 'my-cluster'}`,
    type: 'new',
    url: `git@github.com:${owner}/${repoName}.git`,
  };
}

async function promptComponents(prompter: Prompter): Promise<string[]> {
  const components = getAvailableComponents();

  prompter.note(
    'Select the infrastructure components to install.\nSpace to toggle, Enter to confirm.',
    'Component Selection',
  );

  const options = components.map((component) => ({
    hint: getComponentDescription(component),
    label: component,
    value: component,
  }));

  const selected = await prompter.multiselect({
    message: 'Which components do you want to install?',
    options,
    required: false,
  });

  return selected;
}

async function confirmConfiguration(
  prompter: Prompter,
  config: {
    clusterName: string;
    components: string[];
    domain: string;
    repoUrl: string;
  },
): Promise<boolean> {
  prompter.note(
    `Cluster: ${config.clusterName}\n` +
      `Domain: ${config.domain}\n` +
      `Repository: ${config.repoUrl}\n` +
      `Components:\n` +
      config.components.map((c) => `  • ${c}`).join('\n'),
    'Configuration Summary',
  );

  return prompter.confirm({
    initialValue: true,
    message: 'Proceed with this configuration?',
  });
}

async function setupFromTemplate(
  deps: ClusterInitDeps,
  config: ComponentConfig,
  components: string[],
  repoConfig: RepoConfig,
): Promise<void> {
  const { commands, cwd, files, prompter } = deps;
  const s = prompter.spinner();

  // Clone template repository
  const tempDir = `${cwd}/.berget-cluster-init-${Date.now()}`;
  s.start('Cloning berget-k8s-template...');
  try {
    await commands.run('git', [
      'clone',
      '--depth',
      '1',
      'https://github.com/berget-ai/berget-k8s-template.git',
      tempDir,
    ]);
    s.stop('Template cloned.');
  } catch (error) {
    s.stop('Failed to clone template.');
    throw new CommandFailedError('git clone', 1);
  }

  // Copy cluster directory structure
  const clusterDir = `${cwd}/clusters`;
  s.start('Setting up cluster directory...');

  await files.mkdir(clusterDir);
  await files.mkdir(`${clusterDir}/flux-system`);
  await files.mkdir(`${clusterDir}/infrastructure`);
  await files.mkdir(`${clusterDir}/infrastructure/cert-manager`);
  await files.mkdir(`${clusterDir}/infrastructure/external-dns`);
  await files.mkdir(`${clusterDir}/infrastructure/ingress-nginx`);
  await files.mkdir(`${clusterDir}/infrastructure/monitoring`);
  await files.mkdir(`${clusterDir}/infrastructure/operators`);
  await files.mkdir(`${clusterDir}/infrastructure/operators/cloudnative-pg`);
  await files.mkdir(`${clusterDir}/infrastructure/operators/redis`);
  await files.mkdir(`${clusterDir}/apps`);

  // Generate gotk-sync.yaml
  const gotkSync = generateGotkSync(config.clusterName, repoConfig);
  await files.writeFile(`${clusterDir}/flux-system/gotk-sync.yaml`, gotkSync);

  // Generate component manifests
  for (const component of components) {
    const manifest = generateComponentManifest(component, config);
    let targetDir: string;

    if (component === 'cert-manager') {
      targetDir = `${clusterDir}/infrastructure/cert-manager`;
    } else if (component === 'external-dns') {
      targetDir = `${clusterDir}/infrastructure/external-dns`;
    } else if (component === 'ingress-nginx') {
      targetDir = `${clusterDir}/infrastructure/ingress-nginx`;
    } else if (component === 'cloudnative-pg') {
      targetDir = `${clusterDir}/infrastructure/operators/cloudnative-pg`;
    } else if (component === 'redis-operator') {
      targetDir = `${clusterDir}/infrastructure/operators/redis`;
    } else if (component === 'prometheus' || component === 'grafana') {
      targetDir = `${clusterDir}/infrastructure/monitoring`;
    } else {
      targetDir = `${clusterDir}/infrastructure`;
    }

    await files.writeFile(`${targetDir}/${manifest.filename}`, manifest.content);
  }

  s.stop('Cluster directory created.');

  // Cleanup temp directory
  try {
    await commands.run('rm', ['-rf', tempDir]);
  } catch {
    // Ignore cleanup errors
  }

  // Optionally run flux bootstrap
  const shouldBootstrap = await prompter.confirm({
    initialValue: true,
    message: 'Run flux bootstrap now? (requires cluster access)',
  });

  if (shouldBootstrap) {
    await runFluxBootstrap(deps, repoConfig, config.clusterName);
  }
}

async function setupFromExistingRepo(
  deps: ClusterInitDeps,
  config: ComponentConfig,
  components: string[],
  repoConfig: RepoConfig,
): Promise<void> {
  const { cwd, files, prompter } = deps;
  const s = prompter.spinner();

  const clusterDir = `${cwd}/clusters`;
  s.start('Generating component manifests...');

  // Ensure directory structure exists
  await files.mkdir(clusterDir);
  await files.mkdir(`${clusterDir}/flux-system`);
  await files.mkdir(`${clusterDir}/infrastructure`);

  // Generate gotk-sync.yaml
  const gotkSync = generateGotkSync(config.clusterName, repoConfig);
  await files.writeFile(`${clusterDir}/flux-system/gotk-sync.yaml`, gotkSync);

  // Generate component manifests
  for (const component of components) {
    const manifest = generateComponentManifest(component, config);
    const targetDir = `${clusterDir}/infrastructure`;
    await files.mkdir(targetDir);
    await files.writeFile(`${targetDir}/${manifest.filename}`, manifest.content);
  }

  s.stop('Manifests generated.');

  // Optionally run flux bootstrap
  const shouldBootstrap = await prompter.confirm({
    initialValue: true,
    message: 'Run flux bootstrap now? (requires cluster access)',
  });

  if (shouldBootstrap) {
    await runFluxBootstrap(deps, repoConfig, config.clusterName);
  }
}

async function runFluxBootstrap(
  deps: ClusterInitDeps,
  repoConfig: RepoConfig,
  _clusterName: string,
): Promise<void> {
  const { commands, prompter } = deps;
  const s = prompter.spinner();

  s.start('Running flux bootstrap...');

  try {
    const args = [
      'bootstrap',
      'github',
      '--owner',
      extractOwner(repoConfig.url),
      '--repository',
      extractRepoName(repoConfig.url),
      '--branch',
      repoConfig.branch,
      '--path',
      repoConfig.path,
      '--personal',
    ];

    await commands.run('flux', args);
    s.stop('Flux bootstrap completed.');
  } catch (error) {
    s.stop('Flux bootstrap failed.');
    throw new CommandFailedError('flux bootstrap', 1);
  }
}

function generateGotkSync(_clusterName: string, repoConfig: RepoConfig): string {
  return `---
# FluxCD GitOps Configuration
# Generated by berget clusters init
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: flux-system
  namespace: flux-system
spec:
  interval: 1h
  ref:
    branch: ${repoConfig.branch}
  secretRef:
    name: flux-system
  url: ${repoConfig.url}
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: flux-system
  namespace: flux-system
spec:
  interval: 10m
  path: ./${repoConfig.path}
  prune: true
  sourceRef:
    kind: GitRepository
    name: flux-system
`;
}

function extractOwner(repoUrl: string): string {
  // Handle both SSH and HTTPS URLs
  // git@github.com:owner/repo.git -> owner
  // https://github.com/owner/repo.git -> owner
  const match = repoUrl.match(/github\.com[:/]([^/]+)/);
  return match ? match[1] : 'unknown';
}

function extractRepoName(repoUrl: string): string {
  // git@github.com:owner/repo.git -> repo
  // https://github.com/owner/repo.git -> repo
  const match = repoUrl.match(/github\.com[:/][^/]+\/(.+?)(?:\.git)?$/);
  return match ? match[1] : 'infra';
}
