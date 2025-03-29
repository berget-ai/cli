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

  // This endpoint is not available in the API
  public async createNamespace(name: string): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }

  // This endpoint is not available in the API
  public async applyConfiguration(filename: string): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }

  // This endpoint is not available in the API
  public async getResources(
    resource: string,
    namespace?: string
  ): Promise<any[]> {
    throw new Error('This functionality is not available in the API')
  }
}
