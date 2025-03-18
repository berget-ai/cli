#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

// Set version and description
program
  .name('berget')
  .description('CLI for interacting with the Swedish cloud provider Berget')
  .version('0.0.3');

// Login command
program
  .command('login')
  .description('Loggar in med BankID')
  .action(() => {
    console.log('... loggar in med BankID');
    console.log('✓ Successfully logged in to Berget');
  });

// Cluster commands
const cluster = program
  .command('cluster')
  .description('Manage Berget clusters');

cluster
  .command('create')
  .description('Create a new Berget cluster')
  .action(() => {
    console.log('Done! 5 nodes created.');
    console.log('Assigned DNS: ideal-palmtree.berget.cloud');
    console.log('Nu är ditt kluster redo att användas. Nu kan du börja köra dina applikationer. Du kan peka ett CNAME till klustret.');
  });

cluster
  .command('list')
  .description('List all Berget clusters')
  .action(() => {
    console.log('NAME                   STATUS    NODES    CREATED');
    console.log('ideal-palmtree         Running   5        2 days ago');
    console.log('curious-elephant       Running   3        1 week ago');
  });

// Autocomplete command
program
  .command('autocomplete')
  .command('install')
  .description('Install shell autocompletion')
  .action(() => {
    console.log('✓ Berget autocomplete installed in your shell');
    console.log('✓ Shell completion for kubectl also installed');
    console.log('');
    console.log('Restart your shell or run:');
    console.log('  source ~/.bashrc');
  });

// Flux commands
const flux = program
  .command('flux')
  .description('Manage FluxCD for GitOps workflows');

flux
  .command('install')
  .description('Install FluxCD on a cluster')
  .option('--cluster <name>', 'Cluster name')
  .action((options) => {
    console.log('Installing Flux components...');
    console.log('✓ Flux components installed successfully');
    console.log('');
    console.log('Now you can bootstrap Flux with your Git repository:');
  });

flux
  .command('bootstrap')
  .description('Bootstrap FluxCD with a Git repository')
  .argument('<provider>', 'Git provider (github, gitlab, etc.)')
  .option('--owner <owner>', 'Repository owner')
  .option('--repository <repo>', 'Repository name')
  .option('--path <path>', 'Path within the repository')
  .option('--personal', 'Use personal access token')
  .action((provider, options) => {
    console.log('► connecting to github.com');
    console.log('► cloning repository');
    console.log('► generating manifests');
    console.log('► committing changes');
    console.log('✓ bootstrap completed');
    console.log('');
    console.log('Now Flux will automatically sync your repository with your cluster.');
    console.log('Any changes you push to the repository will be applied to your cluster.');
  });

// Collaborator commands
const collaborator = program
  .command('collaborator')
  .description('Manage collaborators for your Berget clusters');

collaborator
  .command('add')
  .description('Add a collaborator to a cluster')
  .option('--cluster <name>', 'Cluster name')
  .option('--github-username <username>', 'GitHub username of the collaborator')
  .action((options) => {
    console.log(`Invitation sent to ${options['github-username']}`);
    console.log('They will receive an email with instructions to accept the invitation');
    console.log('');
    console.log(`Current collaborators on ${options.cluster}:`);
    console.log('USERNAME      ROLE       STATUS');
    console.log('you           Owner      Active');
    console.log(`${options['github-username']}    Editor     Pending`);
  });

collaborator
  .command('list')
  .description('List collaborators for a cluster')
  .option('--cluster <name>', 'Cluster name')
  .action((options) => {
    console.log('USERNAME      ROLE       STATUS');
    console.log('you           Owner      Active');
    console.log('kollega123    Editor     Pending');
  });

// Helm commands
const helm = program
  .command('helm')
  .description('Manage Helm charts on your Berget clusters');

const helmRepo = helm
  .command('repo')
  .description('Manage Helm repositories');

helmRepo
  .command('add')
  .description('Add a Helm repository')
  .argument('<name>', 'Repository name')
  .argument('<url>', 'Repository URL')
  .action((name, url) => {
    console.log(`"${name}" has been added to your repositories`);
  });

helm
  .command('install')
  .description('Install a Helm chart')
  .argument('<name>', 'Release name')
  .argument('<chart>', 'Chart name')
  .option('-n, --namespace <namespace>', 'Namespace')
  .option('--set <values>', 'Set values on the command line')
  .action((name, chart, options) => {
    console.log(`NAME: ${name}`);
    console.log(`NAMESPACE: ${options.namespace || 'default'}`);
    console.log('STATUS: deployed');
    console.log('REVISION: 1');
    
    if (chart.includes('mongodb')) {
      console.log('MongoDB can be accessed on the following DNS name from within your cluster:');
      console.log(`${name}.${options.namespace || 'default'}.svc.cluster.local`);
    } else if (chart.includes('supabase')) {
      console.log('NOTES:');
      console.log('Supabase has been installed. Check its status by running:');
      console.log(`  kubectl --namespace ${options.namespace} get pods`);
    }
  });

// Kubernetes-like commands
program
  .command('create')
  .command('namespace')
  .description('Create a namespace')
  .argument('<name>', 'Namespace name')
  .action((name) => {
    console.log(`namespace/${name} created`);
  });

program
  .command('apply')
  .description('Apply a configuration to a resource')
  .option('-f, --filename <filename>', 'Filename, directory, or URL to files')
  .action((options) => {
    console.log(`Applied configuration from ${options.filename}`);
  });

program
  .command('get')
  .description('Display one or many resources')
  .argument('<resource>', 'Resource type (pods, services, etc.)')
  .option('-n, --namespace <namespace>', 'Namespace')
  .action((resource, options) => {
    if (resource === 'pods') {
      console.log('NAME                      READY   STATUS    RESTARTS   AGE');
      console.log('mongodb-75f59d57c-xm7q9   1/1     Running   0          45s');
    } else if (resource === 'svc' && options.namespace === 'supabase') {
      console.log('NAME                TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)          AGE');
      console.log('supabase-db         ClusterIP   10.100.158.24    <none>        5432/TCP         1m');
      console.log('supabase-kong       ClusterIP   10.100.33.125    <none>        8000/TCP         1m');
      console.log('supabase-studio     ClusterIP   10.100.107.238   <none>        3000/TCP         1m');
    }
  });

// Auto-detect .bergetconfig and switch clusters
const checkBergetConfig = () => {
  const configPath = path.join(process.cwd(), '.bergetconfig');
  if (fs.existsSync(configPath)) {
    try {
      const config = fs.readFileSync(configPath, 'utf8');
      const match = config.match(/cluster:\s*(.+)/);
      if (match && match[1]) {
        const clusterName = match[1].trim();
        console.log(`🔄 Berget: Switched to cluster "${clusterName}"`);
        console.log('✓ kubectl config updated');
        console.log('');
      }
    } catch (error) {
      // Silently ignore errors reading config
    }
  }
};

// Check for .bergetconfig if not running a command
if (process.argv.length <= 2) {
  checkBergetConfig();
}

program.parse(process.argv);
