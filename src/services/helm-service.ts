import { COMMAND_GROUPS, SUBCOMMANDS } from "../constants/command-structure";

export interface HelmRepoAddOptions {
  name: string;
  url: string;
}

export interface HelmInstallOptions {
  name: string;
  chart: string;
  namespace?: string;
  values?: Record<string, string>;
}

/**
 * Service for managing Helm charts
 * Command group: helm
 */
export class HelmService {
  private static instance: HelmService;

  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.HELM;

  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.HELM;

  private constructor() {}

  public static getInstance(): HelmService {
    if (!HelmService.instance) {
      HelmService.instance = new HelmService();
    }
    return HelmService.instance;
  }

  /**
   * Add a Helm repository
   * Command: berget helm add-repo
   * This endpoint is not available in the API
   */
  public async addRepo(_options: HelmRepoAddOptions): Promise<boolean> {
    throw new Error("This functionality is not available in the API");
  }

  /**
   * Install a Helm chart
   * Command: berget helm install
   * This endpoint is not available in the API
   */
  public async install(_options: HelmInstallOptions): Promise<any> {
    throw new Error("This functionality is not available in the API");
  }
}
