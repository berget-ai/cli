import { createAuthenticatedClient } from '../client'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'

export interface Collaborator {
  username: string
  role: string
  status: string
}

/**
 * Service for managing collaborators
 * Command group: users
 */
export class CollaboratorService {
  private static instance: CollaboratorService
  private client = createAuthenticatedClient()

  // Command group name for this service
  public static readonly COMMAND_GROUP = COMMAND_GROUPS.USERS

  // Subcommands for this service
  public static readonly COMMANDS = SUBCOMMANDS.USERS

  private constructor() {}

  public static getInstance(): CollaboratorService {
    if (!CollaboratorService.instance) {
      CollaboratorService.instance = new CollaboratorService()
    }
    return CollaboratorService.instance
  }

  /**
   * Invite a new collaborator
   * Command: berget users invite
   * This endpoint is not available in the API
   */
  public async invite(
    clusterId: string,
    githubUsername: string,
  ): Promise<Collaborator[]> {
    throw new Error('This functionality is not available in the API')
  }

  /**
   * List all collaborators
   * Command: berget users list
   * This endpoint is not available in the API
   */
  public async list(clusterId: string): Promise<Collaborator[]> {
    throw new Error('This functionality is not available in the API')
  }
}
