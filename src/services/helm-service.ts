import { createAuthenticatedClient } from '../client'

export interface HelmRepoAddOptions {
  name: string
  url: string
}

export interface HelmInstallOptions {
  name: string
  chart: string
  namespace?: string
  values?: Record<string, string>
}

export class HelmService {
  private static instance: HelmService
  private client = createAuthenticatedClient()

  private constructor() {}

  public static getInstance(): HelmService {
    if (!HelmService.instance) {
      HelmService.instance = new HelmService()
    }
    return HelmService.instance
  }

  // This endpoint is not available in the API
  public async addRepo(options: HelmRepoAddOptions): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }

  // This endpoint is not available in the API
  public async installChart(options: HelmInstallOptions): Promise<any> {
    throw new Error('This functionality is not available in the API')
  }
}
