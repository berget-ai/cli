import { Command } from 'commander'
import { COMMAND_GROUPS, SUBCOMMANDS } from '../constants/command-structure'
import { createAuthenticatedClient } from '../client'
import { handleError } from '../utils/error-handler'
import chalk from 'chalk'

/**
 * Register user commands
 */
export function registerUserCommands(program: Command): void {
  const users = program
    .command(COMMAND_GROUPS.USERS)
    .description('Manage users')

  users
    .command(SUBCOMMANDS.USERS.LIST)
    .description('List team members')
    .action(async () => {
      try {
        const client = createAuthenticatedClient()
        const { data, error } = await client.GET('/v1/users')
        if (error) throw new Error(JSON.stringify(error))

        console.log('Team Members:')
        console.log(
          'NAME                     EMAIL                           ROLE'
        )
        data.forEach((user: any) => {
          console.log(
            `${user.name.padEnd(24)} ${user.email.padEnd(30)} ${user.role}`
          )
        })
      } catch (error) {
        handleError('Failed to list team members', error)
      }
    })
}
