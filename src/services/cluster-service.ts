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

  public async createCluster(): Promise<Cluster> {
    try {
      // In a real implementation, this would call the API to create a cluster
      // For demo purposes, we'll return a mock response

      // const { data, error } = await this.client.POST('/v1/clusters', {
      //   json: { /* cluster configuration */ }
      // });

      // if (error) throw new Error(error.message);
      // return data;

      const mockCluster: Cluster = {
        id: 'clst_' + Math.random().toString(36).substring(2, 10),
        name: 'ideal-palmtree',
        status: 'Running',
        nodes: 5,
        created: new Date().toISOString(),
      }

      return mockCluster
    } catch (error) {
      console.error('Failed to create cluster:', error)
      throw error
    }
  }

  public async listClusters(): Promise<Cluster[]> {
    try {
      // In a real implementation, this would call the API to list clusters
      // For demo purposes, we'll return mock data

      // const { data, error } = await this.client.GET('/v1/clusters');
      // if (error) throw new Error(error.message);
      // return data;

      return [
        {
          id: 'clst_abc123',
          name: 'ideal-palmtree',
          status: 'Running',
          nodes: 5,
          created: '2 days ago',
        },
        {
          id: 'clst_def456',
          name: 'curious-elephant',
          status: 'Running',
          nodes: 3,
          created: '1 week ago',
        },
      ]
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

  public async createCluster(): Promise<Cluster> {
    try {
      // In a real implementation, this would call the API to create a cluster
      // For demo purposes, we'll return a mock response

      // const { data, error } = await this.client.POST('/v1/clusters', {
      //   json: { /* cluster configuration */ }
      // });

      // if (error) throw new Error(error.message);
      // return data;

      const mockCluster: Cluster = {
        id: 'clst_' + Math.random().toString(36).substring(2, 10),
        name: 'ideal-palmtree',
        status: 'Running',
        nodes: 5,
        created: new Date().toISOString(),
      }

      return mockCluster
    } catch (error) {
      console.error('Failed to create cluster:', error)
      throw error
    }
  }

  public async listClusters(): Promise<Cluster[]> {
    try {
      // In a real implementation, this would call the API to list clusters
      // For demo purposes, we'll return mock data

      // const { data, error } = await this.client.GET('/v1/clusters');
      // if (error) throw new Error(error.message);
      // return data;

      return [
        {
          id: 'clst_abc123',
          name: 'ideal-palmtree',
          status: 'Running',
          nodes: 5,
          created: '2 days ago',
        },
        {
          id: 'clst_def456',
          name: 'curious-elephant',
          status: 'Running',
          nodes: 3,
          created: '1 week ago',
        },
      ]
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
