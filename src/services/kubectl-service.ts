import { createAuthenticatedClient } from '../client'

export class KubectlService {
  private static instance: KubectlService
  private client = createAuthenticatedClient()

  private constructor() {}

  public static getInstance(): KubectlService {
    if (!KubectlService.instance) {
      KubectlService.instance = new KubectlService()
    }
    return KubectlService.instance
  }

  public async createNamespace(name: string): Promise<boolean> {
    try {
      // In a real implementation, this would call the API to create a namespace
      // For demo purposes, we'll simulate a successful operation

      // const { data, error } = await this.client.POST(`/v1/kubernetes/namespaces`, {
      //   json: { name }
      // });

      // if (error) throw new Error(error.message);
      // return true;

      return true
    } catch (error) {
      console.error('Failed to create namespace:', error)
      throw error
    }
  }

  public async applyConfiguration(filename: string): Promise<boolean> {
    try {
      // In a real implementation, this would read the file and send its contents to the API
      // For demo purposes, we'll simulate a successful operation

      // const fileContent = fs.readFileSync(filename, 'utf8');
      // const { data, error } = await this.client.POST(`/v1/kubernetes/apply`, {
      //   json: { content: fileContent }
      // });

      // if (error) throw new Error(error.message);
      // return true;

      return true
    } catch (error) {
      console.error('Failed to apply configuration:', error)
      throw error
    }
  }

  public async getResources(
    resource: string,
    namespace?: string
  ): Promise<any[]> {
    try {
      // In a real implementation, this would call the API to get resources
      // For demo purposes, we'll return mock data based on the resource type

      // const { data, error } = await this.client.GET(`/v1/kubernetes/${resource}`, {
      //   params: { query: { namespace } }
      // });

      // if (error) throw new Error(error.message);
      // return data;

      if (resource === 'pods') {
        return [
          {
            name: 'mongodb-75f59d57c-xm7q9',
            ready: '1/1',
            status: 'Running',
            restarts: 0,
            age: '45s',
          },
        ]
      } else if (resource === 'svc' && namespace === 'supabase') {
        return [
          {
            name: 'supabase-db',
            type: 'ClusterIP',
            clusterIp: '10.100.158.24',
            externalIp: '<none>',
            ports: '5432/TCP',
            age: '1m',
          },
          {
            name: 'supabase-kong',
            type: 'ClusterIP',
            clusterIp: '10.100.33.125',
            externalIp: '<none>',
            ports: '8000/TCP',
            age: '1m',
          },
          {
            name: 'supabase-studio',
            type: 'ClusterIP',
            clusterIp: '10.100.107.238',
            externalIp: '<none>',
            ports: '3000/TCP',
            age: '1m',
          },
        ]
      }

      return []
    } catch (error) {
      console.error(`Failed to get ${resource}:`, error)
      throw error
    }
  }
}
