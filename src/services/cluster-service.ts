import { createAuthenticatedClient } from '../client'

export interface Cluster {
  id: string
  name: string
  status: string
  nodes: number
  created: string
}

export class ClusterService {
  private static instance: ClusterService
  private client = createAuthenticatedClient()

  private constructor() {}

  public static getInstance(): ClusterService {
    if (!ClusterService.instance) {
      ClusterService.instance = new ClusterService()
    }
    return ClusterService.instance
  }

  public async getClusterUsage(clusterId: string): Promise<any> {
    try {
      const { data, error } = await this.client.GET(
        '/v1/clusters/{clusterId}/usage',
        {
          params: { path: { clusterId } },
        }
      )
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      console.error('Failed to get cluster usage:', error)
      throw error
    }
  }

  public async listClusters(): Promise<Cluster[]> {
    try {
      const { data, error } = await this.client.GET('/v1/clusters')
      if (error) throw new Error(JSON.stringify(error))
      return data?.data || []
    } catch (error) {
      console.error('Failed to list clusters:', error)
      throw error
    }
  }

  public async getClusterUsage(clusterId: string): Promise<any> {
    try {
      // Using a valid path from the API spec
      const { data, error } = await this.client.GET(
        '/v1/clusters/{clusterId}/usage',
        {
          params: { path: { clusterId } },
        }
      )
      if (error) throw new Error(JSON.stringify(error))
      return data
    } catch (error) {
      console.error('Failed to get cluster usage:', error)
      throw error
    }
  }
}
