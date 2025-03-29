import { createAuthenticatedClient } from '../client'

export interface Collaborator {
  username: string
  role: string
  status: string
}

export class CollaboratorService {
  private static instance: CollaboratorService
  private client = createAuthenticatedClient()

  private constructor() {}

  public static getInstance(): CollaboratorService {
    if (!CollaboratorService.instance) {
      CollaboratorService.instance = new CollaboratorService()
    }
    return CollaboratorService.instance
  }

  // This endpoint is not available in the API
  public async addCollaborator(
    clusterId: string,
    githubUsername: string
  ): Promise<Collaborator[]> {
    throw new Error('This functionality is not available in the API')
  }

  // This endpoint is not available in the API
  public async listCollaborators(clusterId: string): Promise<Collaborator[]> {
    throw new Error('This functionality is not available in the API')
  }
}
