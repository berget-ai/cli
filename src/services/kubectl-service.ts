import { COMMAND_GROUPS, SUBCOMMANDS } from "../constants/command-structure";

/**
 * Service for managing Kubernetes resources
 * Command group: kubectl
 */
export class KubectlService {
  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.KUBECTL;

  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.KUBECTL;

  private static instance: KubectlService;

  private constructor() {}

  public static getInstance(): KubectlService {
    if (!KubectlService.instance) {
      KubectlService.instance = new KubectlService();
    }
    return KubectlService.instance;
  }

  /**
   * Apply a Kubernetes configuration
   * Command: berget kubectl apply
   * This endpoint is not available in the API
   */
  public async apply(_filename: string): Promise<boolean> {
    throw new Error("This functionality is not available in the API");
  }

  /**
   * Create a Kubernetes namespace
   * Command: berget kubectl create-namespace
   * This endpoint is not available in the API
   */
  public async createNamespace(_name: string): Promise<boolean> {
    throw new Error("This functionality is not available in the API");
  }

  /**
   * Get Kubernetes resources
   * Command: berget kubectl get
   * This endpoint is not available in the API
   */
  public async get(_resource: string, _namespace?: string): Promise<any[]> {
    throw new Error("This functionality is not available in the API");
  }
}
