import { createAuthenticatedClient } from '../client'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'

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

/**
 * Service for managing Flux CD
 * Command group: flux
 */
export class FluxService {
  private static instance: FluxService
  private client = createAuthenticatedClient()

  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.FLUX

  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.FLUX

  private constructor() {}

  public static getInstance(): FluxService {
    if (!FluxService.instance) {
      FluxService.instance = new FluxService()
    }
    return FluxService.instance
  }

  /**
   * Install Flux CD
   * Command: berget flux install
   * This endpoint is not available in the API
   */
  public async install(options: FluxInstallOptions): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }

  /**
   * Bootstrap Flux CD
   * Command: berget flux bootstrap
   * This endpoint is not available in the API
   */
  public async bootstrap(options: FluxBootstrapOptions): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }
}
