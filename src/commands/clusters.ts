import { Command } from 'commander';

import { Cluster, ClusterService } from '../services/cluster-service';
import { handleError } from '../utils/error-handler';
import { runClusterInitCommand } from './clusters/init-command';

/**
 * Register cluster commands
 */
export function registerClusterCommands(program: Command): void {
  const cluster = program
    .command(ClusterService.COMMAND_GROUP)
    .description('Manage Berget clusters');

  cluster
    .command('init')
    .description('Initialize a new Kubernetes cluster with FluxCD GitOps and infrastructure components')
    .option('--cluster-name <name>', 'Cluster name (skip interactive prompt)')
    .option('--domain <domain>', 'Base domain for the cluster (skip interactive prompt)')
    .option('--repo-url <url>', 'Git repository URL for FluxCD')
    .option('--template-repo', 'Use the official berget-k8s-template repository')
    .option(
      '--components <components>',
      'Comma-separated list of components to install (e.g., cert-manager,external-dns,ingress-nginx)',
    )
    .action(async (options) => {
      try {
        await runClusterInitCommand(options);
      } catch (error) {
        handleError('Failed to initialize cluster', error);
      }
    });

  cluster
    .command(ClusterService.COMMANDS.LIST)
    .description('List all Berget clusters')
    .action(async () => {
      try {
        const clusterService = ClusterService.getInstance();
        const clusters = await clusterService.list();

        console.log('NAME                   STATUS    NODES    CREATED');
        clusters.forEach((cluster: Cluster) => {
          console.log(
            `${cluster.name.padEnd(22)} ${cluster.status.padEnd(9)} ${String(cluster.nodes).padEnd(
              8,
            )} ${cluster.created}`,
          );
        });
      } catch (error) {
        handleError('Failed to list clusters', error);
      }
    });

  cluster
    .command(ClusterService.COMMANDS.GET_USAGE)
    .description('Get usage metrics for a specific cluster')
    .argument('<clusterId>', 'Cluster ID')
    .action(async (clusterId) => {
      try {
        const clusterService = ClusterService.getInstance();
        const usage = await clusterService.getUsage(clusterId);

        console.log('Cluster Usage:');
        console.log(JSON.stringify(usage, null, 2));
      } catch (error) {
        handleError('Failed to get cluster usage', error);
      }
    });

  cluster
    .command(ClusterService.COMMANDS.DESCRIBE)
    .description('Get detailed information about a cluster')
    .argument('<clusterId>', 'Cluster ID')
    .action(async (clusterId) => {
      try {
        const clusterService = ClusterService.getInstance();
        const clusterInfo = await clusterService.describe(clusterId);

        console.log('Cluster Details:');
        console.log(JSON.stringify(clusterInfo, null, 2));
      } catch (error) {
        handleError('Failed to describe cluster', error);
      }
    });
}
