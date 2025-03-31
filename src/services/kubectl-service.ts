import { createAuthenticatedClient } from '../client'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'

/**
 * Service for managing Kubernetes resources
 * Command group: kubectl
 */
export class KubectlService {
  private static instance: KubectlService
  private client = createAuthenticatedClient()
  
  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.KUBECTL
  
  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.KUBECTL

  private constructor() {}

  public static getInstance(): KubectlService {
    if (!KubectlService.instance) {
      KubectlService.instance = new KubectlService()
    }
    return KubectlService.instance
  }

  /**
   * Create a Kubernetes namespace
   * Command: berget kubectl create-namespace
   * This endpoint is not available in the API
   */
  public async createNamespace(name: string): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }

  /**
   * Apply a Kubernetes configuration
   * Command: berget kubectl apply
   * This endpoint is not available in the API
   */
  public async apply(filename: string): Promise<boolean> {
    throw new Error('This functionality is not available in the API')
  }

  /**
   * Get Kubernetes resources
   * Command: berget kubectl get
   * This endpoint is not available in the API
   */
  public async get(
    resource: string,
    namespace?: string
  ): Promise<any[]> {
    throw new Error('This functionality is not available in the API')
  }
}
