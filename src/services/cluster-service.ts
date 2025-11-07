import { createAuthenticatedClient } from '../client'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'

export interface Cluster {
  id: string
  name: string
  status: string
  nodes: number
  created: string
}

/**
 * Service for managing Kubernetes clusters
 * Command group: clusters
 */
export class ClusterService {
  private static instance: ClusterService
  private client = createAuthenticatedClient()

  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.CLUSTERS

  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.CLUSTERS

  private constructor() {}

  public static getInstance(): ClusterService {
    if (!ClusterService.instance) {
      ClusterService.instance = new ClusterService()
    }
    return ClusterService.instance
  }

  /**
   * Get resource usage for a cluster
   * Command: berget clusters get-usage
   */
  public async getUsage(clusterId: string): Promise<any> {
    try {
      const { data, error } = await this.client.GET(
        '/v1/clusters/{clusterId}/usage',
        {
          params: { path: { clusterId } },
        },
      )
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      console.error('Failed to get cluster usage:', error)
      throw error
    }
  }

  /**
   * List all clusters
   * Command: berget clusters list
   */
  public async list(): Promise<Cluster[]> {
    try {
      const { data, error } = await this.client.GET('/v1/clusters')
      if (error) throw new Error(JSON.stringify(error))
      return data?.data || []
    } catch (error) {
      console.error('Failed to list clusters:', error)
      throw error
    }
  }

  /**
   * Get detailed information about a cluster
   * Command: berget clusters describe
   */
  public async describe(clusterId: string): Promise<Cluster | null> {
    try {
      // This is a placeholder since the API doesn't have a specific endpoint
      // In a real implementation, this would call a specific endpoint
      const clusters = await this.list()
      return clusters.find((cluster) => cluster.id === clusterId) || null
    } catch (error) {
      console.error('Failed to describe cluster:', error)
      throw error
    }
  }
}
