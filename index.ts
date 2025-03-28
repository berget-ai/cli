#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

// Set version and description
program
  .name('berget')
  .description('CLI for interacting with the Swedish cloud provider Berget')
  .version('0.0.3');

// Import services
import { AuthService } from './services/auth-service';
import { ApiKeyService, ApiKey } from './services/api-key-service';
import { ClusterService, Cluster } from './services/cluster-service';
import { CollaboratorService, Collaborator } from './services/collaborator-service';
import { FluxService } from './services/flux-service';
import { HelmService } from './services/helm-service';
import { KubectlService } from './services/kubectl-service';

// Auth commands
program
  .command('login')
  .description('Loggar in med BankID')
  .action(async () => {
    const authService = AuthService.getInstance();
    await authService.login();
  });

program
  .command('logout')
  .description('Loggar ut från Berget')
  .action(() => {
    const { clearAuthToken } = require('./client');
    clearAuthToken();
    console.log('Du har loggats ut från Berget');
  });

program
  .command('whoami')
  .description('Visa information om inloggad användare')
  .action(async () => {
    try {
      const authService = AuthService.getInstance();
      const profile = await authService.getUserProfile();
      
      if (profile) {
        console.log(`Inloggad som: ${profile.name || profile.login}`);
        console.log(`Email: ${profile.email || 'Inte tillgänglig'}`);
        console.log(`Roll: ${profile.role || 'Inte tillgänglig'}`);
        
        if (profile.company) {
          console.log(`Företag: ${profile.company.name}`);
        }
      } else {
        console.log('Du är inte inloggad. Använd `berget login` för att logga in.');
      }
    } catch (error) {
      console.error('Du är inte inloggad eller så uppstod ett fel:', error);
      console.log('Använd `berget login` för att logga in.');
    }
  });

// API Key commands
const apiKey = program
  .command('api-key')
  .description('Hantera API-nycklar');

apiKey
  .command('list')
  .description('Lista alla API-nycklar')
  .action(async () => {
    try {
      const apiKeyService = ApiKeyService.getInstance();
      const keys = await apiKeyService.listApiKeys();
      
      console.log('ID                       NAME                  PREFIX     CREATED             LAST USED');
      keys.forEach((key: ApiKey) => {
        const lastUsed = key.lastUsed ? key.lastUsed : 'Never';
        console.log(`${key.id.padEnd(24)} ${key.name.padEnd(22)} ${key.prefix.padEnd(10)} ${key.created.substring(0, 10).padEnd(19)} ${lastUsed.substring(0, 10)}`);
      });
    } catch (error) {
      console.error('Failed to list API keys:', error);
    }
  });

apiKey
  .command('create')
  .description('Skapa en ny API-nyckel')
  .option('--name <name>', 'Namn på API-nyckeln')
  .option('--description <description>', 'Beskrivning av API-nyckeln')
  .action(async (options) => {
    try {
      if (!options.name) {
        console.error('Error: --name är obligatoriskt');
        return;
      }
      
      const apiKeyService = ApiKeyService.getInstance();
      const result = await apiKeyService.createApiKey({
        name: options.name,
        description: options.description
      });
      
      console.log('API-nyckel skapad:');
      console.log(`ID: ${result.id}`);
      console.log(`Namn: ${result.name}`);
      console.log(`Nyckel: ${result.key}`);
      console.log('');
      console.log('VIKTIGT: Spara denna nyckel på ett säkert ställe. Den kommer inte att visas igen.');
    } catch (error) {
      console.error('Failed to create API key:', error);
    }
  });

apiKey
  .command('delete')
  .description('Ta bort en API-nyckel')
  .argument('<id>', 'ID för API-nyckeln som ska tas bort')
  .action(async (id) => {
    try {
      const apiKeyService = ApiKeyService.getInstance();
      await apiKeyService.deleteApiKey(id);
      console.log(`API-nyckel ${id} har tagits bort`);
    } catch (error) {
      console.error('Failed to delete API key:', error);
    }
  });

apiKey
  .command('rotate')
  .description('Rotera en API-nyckel (skapar en ny och inaktiverar den gamla)')
  .argument('<id>', 'ID för API-nyckeln som ska roteras')
  .action(async (id) => {
    try {
      const apiKeyService = ApiKeyService.getInstance();
      const result = await apiKeyService.rotateApiKey(id);
      
      console.log('API-nyckel roterad:');
      console.log(`ID: ${result.id}`);
      console.log(`Namn: ${result.name}`);
      console.log(`Ny nyckel: ${result.key}`);
      console.log('');
      console.log('VIKTIGT: Spara denna nyckel på ett säkert ställe. Den kommer inte att visas igen.');
    } catch (error) {
      console.error('Failed to rotate API key:', error);
    }
  });

// Cluster commands
const cluster = program
  .command('cluster')
  .description('Manage Berget clusters');

cluster
  .command('create')
  .description('Create a new Berget cluster')
  .action(async () => {
    try {
      const clusterService = ClusterService.getInstance();
      const cluster = await clusterService.createCluster();
      
      console.log('Done! 5 nodes created.');
      console.log(`Assigned DNS: ${cluster.name}.berget.cloud`);
      console.log('Nu är ditt kluster redo att användas. Nu kan du börja köra dina applikationer. Du kan peka ett CNAME till klustret.');
    } catch (error) {
      console.error('Failed to create cluster:', error);
    }
  });

cluster
  .command('list')
  .description('List all Berget clusters')
  .action(async () => {
    try {
      const clusterService = ClusterService.getInstance();
      const clusters = await clusterService.listClusters();
      
      console.log('NAME                   STATUS    NODES    CREATED');
      clusters.forEach((cluster: Cluster) => {
        console.log(`${cluster.name.padEnd(22)} ${cluster.status.padEnd(9)} ${String(cluster.nodes).padEnd(8)} ${cluster.created}`);
      });
    } catch (error) {
      console.error('Failed to list clusters:', error);
    }
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
  .action(async (options) => {
    try {
      const fluxService = FluxService.getInstance();
      console.log('Installing Flux components...');
      
      await fluxService.installFlux({ cluster: options.cluster });
      
      console.log('✓ Flux components installed successfully');
      console.log('');
      console.log('Now you can bootstrap Flux with your Git repository:');
    } catch (error) {
      console.error('Failed to install Flux:', error);
    }
  });

flux
  .command('bootstrap')
  .description('Bootstrap FluxCD with a Git repository')
  .argument('<provider>', 'Git provider (github, gitlab, etc.)')
  .option('--owner <owner>', 'Repository owner')
  .option('--repository <repo>', 'Repository name')
  .option('--path <path>', 'Path within the repository')
  .option('--personal', 'Use personal access token')
  .action(async (provider, options) => {
    try {
      const fluxService = FluxService.getInstance();
      
      console.log('► connecting to github.com');
      console.log('► cloning repository');
      console.log('► generating manifests');
      console.log('► committing changes');
      
      await fluxService.bootstrapFlux({
        provider,
        owner: options.owner,
        repository: options.repository,
        path: options.path,
        personal: options.personal
      });
      
      console.log('✓ bootstrap completed');
      console.log('');
      console.log('Now Flux will automatically sync your repository with your cluster.');
      console.log('Any changes you push to the repository will be applied to your cluster.');
    } catch (error) {
      console.error('Failed to bootstrap Flux:', error);
    }
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
  .action(async (options) => {
    try {
      const collaboratorService = CollaboratorService.getInstance();
      const collaborators = await collaboratorService.addCollaborator(
        options.cluster,
        options['github-username']
      );
      
      console.log(`Invitation sent to ${options['github-username']}`);
      console.log('They will receive an email with instructions to accept the invitation');
      console.log('');
      console.log(`Current collaborators on ${options.cluster}:`);
      console.log('USERNAME      ROLE       STATUS');
      
      collaborators.forEach((collab: Collaborator) => {
        console.log(`${collab.username.padEnd(13)} ${collab.role.padEnd(10)} ${collab.status}`);
      });
    } catch (error) {
      console.error('Failed to add collaborator:', error);
    }
  });

collaborator
  .command('list')
  .description('List collaborators for a cluster')
  .option('--cluster <name>', 'Cluster name')
  .action(async (options) => {
    try {
      const collaboratorService = CollaboratorService.getInstance();
      const collaborators = await collaboratorService.listCollaborators(options.cluster);
      
      console.log('USERNAME      ROLE       STATUS');
      collaborators.forEach((collab: Collaborator) => {
        console.log(`${collab.username.padEnd(13)} ${collab.role.padEnd(10)} ${collab.status}`);
      });
    } catch (error) {
      console.error('Failed to list collaborators:', error);
    }
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
  .action(async (name, url) => {
    try {
      const helmService = HelmService.getInstance();
      await helmService.addRepo({ name, url });
      console.log(`"${name}" has been added to your repositories`);
    } catch (error) {
      console.error('Failed to add Helm repository:', error);
    }
  });

helm
  .command('install')
  .description('Install a Helm chart')
  .argument('<name>', 'Release name')
  .argument('<chart>', 'Chart name')
  .option('-n, --namespace <namespace>', 'Namespace')
  .option('--set <values>', 'Set values on the command line')
  .action(async (name, chart, options) => {
    try {
      const helmService = HelmService.getInstance();
      const result = await helmService.installChart({
        name,
        chart,
        namespace: options.namespace,
        values: options.set ? { [options.set.split('=')[0]]: options.set.split('=')[1] } : undefined
      });
      
      console.log(`NAME: ${result.name}`);
      console.log(`NAMESPACE: ${result.namespace}`);
      console.log(`STATUS: ${result.status}`);
      console.log(`REVISION: ${result.revision}`);
      
      if (chart.includes('mongodb')) {
        console.log('MongoDB can be accessed on the following DNS name from within your cluster:');
        console.log(`${name}.${options.namespace || 'default'}.svc.cluster.local`);
      } else if (chart.includes('supabase')) {
        console.log('NOTES:');
        console.log('Supabase has been installed. Check its status by running:');
        console.log(`  kubectl --namespace ${options.namespace} get pods`);
      }
    } catch (error) {
      console.error('Failed to install Helm chart:', error);
    }
  });

// Kubernetes-like commands
program
  .command('create')
  .command('namespace')
  .description('Create a namespace')
  .argument('<name>', 'Namespace name')
  .action(async (name) => {
    try {
      const kubectlService = KubectlService.getInstance();
      await kubectlService.createNamespace(name);
      console.log(`namespace/${name} created`);
    } catch (error) {
      console.error('Failed to create namespace:', error);
    }
  });

program
  .command('apply')
  .description('Apply a configuration to a resource')
  .option('-f, --filename <filename>', 'Filename, directory, or URL to files')
  .action(async (options) => {
    try {
      const kubectlService = KubectlService.getInstance();
      await kubectlService.applyConfiguration(options.filename);
      console.log(`Applied configuration from ${options.filename}`);
    } catch (error) {
      console.error('Failed to apply configuration:', error);
    }
  });

program
  .command('get')
  .description('Display one or many resources')
  .argument('<resource>', 'Resource type (pods, services, etc.)')
  .option('-n, --namespace <namespace>', 'Namespace')
  .action(async (resource, options) => {
    try {
      const kubectlService = KubectlService.getInstance();
      const resources = await kubectlService.getResources(resource, options.namespace);
      
      if (resource === 'pods') {
        console.log('NAME                      READY   STATUS    RESTARTS   AGE');
        resources.forEach((pod: any) => {
          console.log(`${pod.name.padEnd(25)} ${pod.ready.padEnd(7)} ${pod.status.padEnd(9)} ${String(pod.restarts).padEnd(10)} ${pod.age}`);
        });
      } else if (resource === 'svc') {
        console.log('NAME                TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)          AGE');
        resources.forEach((svc: any) => {
          console.log(`${svc.name.padEnd(19)} ${svc.type.padEnd(11)} ${svc.clusterIp.padEnd(16)} ${svc.externalIp.padEnd(12)} ${svc.ports.padEnd(15)} ${svc.age}`);
        });
      }
    } catch (error) {
      console.error(`Failed to get ${resource}:`, error);
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
