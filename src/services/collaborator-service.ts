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

  public async addCollaborator(
    clusterId: string,
    githubUsername: string
  ): Promise<Collaborator[]> {
    try {
      // In a real implementation, this would call the API to add a collaborator
      // For demo purposes, we'll return mock data

      // const { data, error } = await this.client.POST(`/v1/clusters/${clusterId}/collaborators`, {
      //   json: { username: githubUsername, role: 'Editor' }
      // });

      // if (error) throw new Error(error.message);
      // return data;

      return [
        { username: 'you', role: 'Owner', status: 'Active' },
        { username: githubUsername, role: 'Editor', status: 'Pending' },
      ]
    } catch (error) {
      console.error('Failed to add collaborator:', error)
      throw error
    }
  }

  public async listCollaborators(clusterId: string): Promise<Collaborator[]> {
    try {
      // In a real implementation, this would call the API to list collaborators
      // For demo purposes, we'll return mock data

      // const { data, error } = await this.client.GET(`/v1/clusters/${clusterId}/collaborators`);
      // if (error) throw new Error(error.message);
      // return data;

      return [
        { username: 'you', role: 'Owner', status: 'Active' },
        { username: 'kollega123', role: 'Editor', status: 'Pending' },
      ]
    } catch (error) {
      console.error('Failed to list collaborators:', error)
      throw error
    }
  }
}
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

  public async addCollaborator(
    clusterId: string,
    githubUsername: string
  ): Promise<Collaborator[]> {
    try {
      // In a real implementation, this would call the API to add a collaborator
      // For demo purposes, we'll return mock data

      // const { data, error } = await this.client.POST(`/v1/clusters/${clusterId}/collaborators`, {
      //   json: { username: githubUsername, role: 'Editor' }
      // });

      // if (error) throw new Error(error.message);
      // return data;

      return [
        { username: 'you', role: 'Owner', status: 'Active' },
        { username: githubUsername, role: 'Editor', status: 'Pending' },
      ]
    } catch (error) {
      console.error('Failed to add collaborator:', error)
      throw error
    }
  }

  public async listCollaborators(clusterId: string): Promise<Collaborator[]> {
    try {
      // In a real implementation, this would call the API to list collaborators
      // For demo purposes, we'll return mock data

      // const { data, error } = await this.client.GET(`/v1/clusters/${clusterId}/collaborators`);
      // if (error) throw new Error(error.message);
      // return data;

      return [
        { username: 'you', role: 'Owner', status: 'Active' },
        { username: 'kollega123', role: 'Editor', status: 'Pending' },
      ]
    } catch (error) {
      console.error('Failed to list collaborators:', error)
      throw error
    }
  }
}
