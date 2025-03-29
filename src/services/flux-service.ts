import { createAuthenticatedClient } from '../client'

export interface FluxInstallOptions {
  cluster: string
}

export interface FluxBootstrapOptions {
  provider: string
  owner?: string
  repository?: string
  path?: string
  personal?: boolean
}

export class FluxService {
  private static instance: FluxService
  private client = createAuthenticatedClient()

  private constructor() {}

  public static getInstance(): FluxService {
    if (!FluxService.instance) {
      FluxService.instance = new FluxService()
    }
    return FluxService.instance
  }

  // This endpoint is not available in the API
  public async installFlux(options: FluxInstallOptions): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }

  // This endpoint is not available in the API
  public async bootstrapFlux(options: FluxBootstrapOptions): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }
}
