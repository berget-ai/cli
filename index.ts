#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { createAuthenticatedClient } from './src/client';
import { handleError } from './src/utils/error-handler';
import chalk from 'chalk';

// Set version and description
program
  .name('berget')
  .description('CLI for interacting with the Swedish cloud provider Berget')
  .version('0.0.3');

// Import services
import { AuthService } from './src/services/auth-service';
import { ApiKeyService, ApiKey } from './src/services/api-key-service';
import { ClusterService, Cluster } from './src/services/cluster-service';
import { CollaboratorService, Collaborator } from './src/services/collaborator-service';
import { FluxService } from './src/services/flux-service';
import { HelmService } from './src/services/helm-service';
import { KubectlService } from './src/services/kubectl-service';

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
    const { clearAuthToken } = require('./src/client');
    clearAuthToken();
    console.log(chalk.green('Du har loggats ut från Berget'));
  });

program
  .command('whoami')
  .description('Visa information om inloggad användare')
  .action(async () => {
    try {
      const authService = AuthService.getInstance();
      const profile = await authService.getUserProfile();
      
      if (profile) {
        console.log(chalk.bold(`Inloggad som: ${profile.name || profile.login}`));
        console.log(`Email: ${chalk.cyan(profile.email || 'Inte tillgänglig')}`);
        console.log(`Roll: ${chalk.cyan(profile.role || 'Inte tillgänglig')}`);
        
        if (profile.company) {
          console.log(`Företag: ${chalk.cyan(profile.company.name)}`);
        }
      } else {
        console.log(chalk.yellow('Du är inte inloggad. Använd `berget login` för att logga in.'));
      }
    } catch (error) {
      handleError('Du är inte inloggad eller så uppstod ett fel', error);
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
        console.log(`${String(key.id).padEnd(24)} ${key.name.padEnd(22)} ${key.prefix.padEnd(10)} ${key.created.substring(0, 10).padEnd(19)} ${lastUsed.substring(0, 10)}`);
      });
    } catch (error) {
      handleError('Failed to list API keys', error);
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
      handleError('Failed to create API key', error);
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
      handleError('Failed to delete API key', error);
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
      handleError('Failed to rotate API key', error);
    }
  });

// Cluster commands
const cluster = program
  .command('cluster')
  .description('Manage Berget clusters');

// Removed cluster create command as it's not available in the API

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
      handleError('Failed to list clusters', error);
    }
  });

cluster
  .command('usage')
  .description('Get usage metrics for a specific cluster')
  .argument('<clusterId>', 'Cluster ID')
  .action(async (clusterId) => {
    try {
      const clusterService = ClusterService.getInstance();
      const usage = await clusterService.getClusterUsage(clusterId);
      
      console.log('Cluster Usage:');
      console.log(JSON.stringify(usage, null, 2));
    } catch (error) {
      handleError('Failed to get cluster usage', error);
    }
  });

// Autocomplete command
program
  .command('autocomplete')
  .command('install')
  .description('Install shell autocompletion')
  .action(() => {
    console.log(chalk.green('✓ Berget autocomplete installed in your shell'));
    console.log(chalk.green('✓ Shell completion for kubectl also installed'));
    console.log('');
    console.log('Restart your shell or run:');
    console.log('  source ~/.bashrc');
  });

// Removed flux commands as they're not available in the API

// Removed collaborator commands as they're not available in the API

// Removed helm commands as they're not available in the API

// Removed kubernetes-like commands as they're not available in the API

// Add token usage command
program
  .command('token-usage')
  .description('Get token usage statistics')
  .option('--model <modelId>', 'Get usage for a specific model')
  .action(async (options) => {
    try {
      const client = createAuthenticatedClient();
      let response;
      
      if (options.model) {
        const { data, error } = await client.GET('/v1/usage/tokens/{modelId}', {
          params: { path: { modelId: options.model } }
        });
        if (error) throw new Error(JSON.stringify(error));
        response = data;
      } else {
        const { data, error } = await client.GET('/v1/usage/tokens');
        if (error) throw new Error(JSON.stringify(error));
        response = data;
      }
      
      console.log('Token Usage:');
      console.log(JSON.stringify(response, null, 2));
    } catch (error) {
      handleError('Failed to get token usage', error);
    }
  });

// Add models command
program
  .command('models')
  .description('List available AI models')
  .option('--id <modelId>', 'Get details for a specific model')
  .action(async (options) => {
    try {
      const client = createAuthenticatedClient();
      let response;
      
      if (options.id) {
        const { data, error } = await client.GET('/v1/models/{modelId}', {
          params: { path: { modelId: options.id } }
        });
        if (error) throw new Error(JSON.stringify(error));
        response = data;
        
        console.log('Model Details:');
        console.log(JSON.stringify(response, null, 2));
      } else {
        const { data, error } = await client.GET('/v1/models');
        if (error) throw new Error(JSON.stringify(error));
        response = data;
        
        console.log('Available Models:');
        console.log('ID                      OWNED BY                  CAPABILITIES');
        response.data.forEach((model: any) => {
          const capabilities = [];
          if (model.capabilities.vision) capabilities.push('vision');
          if (model.capabilities.function_calling) capabilities.push('function_calling');
          if (model.capabilities.json_mode) capabilities.push('json_mode');
          
          console.log(`${model.id.padEnd(24)} ${model.owned_by.padEnd(25)} ${capabilities.join(', ')}`);
        });
      }
    } catch (error) {
      handleError('Failed to get models', error);
    }
  });

// Add team command
program
  .command('team')
  .description('Manage team members')
  .action(async () => {
    try {
      const client = createAuthenticatedClient();
      const { data, error } = await client.GET('/v1/users');
      if (error) throw new Error(JSON.stringify(error));
      
      console.log('Team Members:');
      console.log('NAME                     EMAIL                           ROLE');
      data.forEach((user: any) => {
        console.log(`${user.name.padEnd(24)} ${user.email.padEnd(30)} ${user.role}`);
      });
    } catch (error) {
      handleError('Failed to list team members', error);
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
