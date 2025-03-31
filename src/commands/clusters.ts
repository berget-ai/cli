import { Command } from 'commander'
import { ClusterService, Cluster } from '../services/cluster-service'
import { handleError } from '../utils/error-handler'

/**
 * Register cluster commands
 */
export function registerClusterCommands(program: Command): void {
  const cluster = program
    .command(ClusterService.COMMAND_GROUP)
    .description('Manage Berget clusters')

  cluster
    .command(ClusterService.COMMANDS.LIST)
    .description('List all Berget clusters')
    .action(async () => {
      try {
        const clusterService = ClusterService.getInstance()
        const clusters = await clusterService.list()

        console.log('NAME                   STATUS    NODES    CREATED')
        clusters.forEach((cluster: Cluster) => {
          console.log(
            `${cluster.name.padEnd(22)} ${cluster.status.padEnd(9)} ${String(
              cluster.nodes
            ).padEnd(8)} ${cluster.created}`
          )
        })
      } catch (error) {
        handleError('Failed to list clusters', error)
      }
    })

  cluster
    .command(ClusterService.COMMANDS.GET_USAGE)
    .description('Get usage metrics for a specific cluster')
    .argument('<clusterId>', 'Cluster ID')
    .action(async (clusterId) => {
      try {
        const clusterService = ClusterService.getInstance()
        const usage = await clusterService.getUsage(clusterId)

        console.log('Cluster Usage:')
        console.log(JSON.stringify(usage, null, 2))
      } catch (error) {
        handleError('Failed to get cluster usage', error)
      }
    })

  cluster
    .command(ClusterService.COMMANDS.DESCRIBE)
    .description('Get detailed information about a cluster')
    .argument('<clusterId>', 'Cluster ID')
    .action(async (clusterId) => {
      try {
        const clusterService = ClusterService.getInstance()
        const clusterInfo = await clusterService.describe(clusterId)

        console.log('Cluster Details:')
        console.log(JSON.stringify(clusterInfo, null, 2))
      } catch (error) {
        handleError('Failed to describe cluster', error)
      }
    })
}
