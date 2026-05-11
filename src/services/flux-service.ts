import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure';

export interface FluxBootstrapOptions {
  owner?: string;
  path?: string;
  personal?: boolean;
  provider: string;
  repository?: string;
}

export interface FluxInstallOptions {
  cluster: string;
}

/**
 * Service for managing Flux CD
 * Command group: flux
 */
export class FluxService {
  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.FLUX;

  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.FLUX;

  private static instance: FluxService;

  private constructor() {}

  public static getInstance(): FluxService {
    if (!FluxService.instance) {
      FluxService.instance = new FluxService();
    }
    return FluxService.instance;
  }

  /**
   * Bootstrap Flux CD
   * Command: berget flux bootstrap
   * This endpoint is not available in the API
   */
  public async bootstrap(_options: FluxBootstrapOptions): Promise<boolean> {
    throw new Error('This functionality is not available in the API');
  }

  /**
   * Install Flux CD
   * Command: berget flux install
   * This endpoint is not available in the API
   */
  public async install(_options: FluxInstallOptions): Promise<boolean> {
    throw new Error('This functionality is not available in the API');
  }
}
