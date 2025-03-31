import { Command } from 'commander'
import chalk from 'chalk'
import { AuthService } from '../services/auth-service'
import { clearAuthToken } from '../client'
import { handleError } from '../utils/error-handler'

/**
 * Register authentication commands
 */
export function registerAuthCommands(program: Command): void {
  const auth = program
    .command(AuthService.COMMAND_GROUP)
    .description('Manage authentication and authorization')

  auth
    .command(AuthService.COMMANDS.LOGIN)
    .description('Log in to Berget')
    .action(async () => {
      const authService = AuthService.getInstance()
      await authService.login()
    })

  auth
    .command(AuthService.COMMANDS.LOGOUT)
    .description('Log out from Berget')
    .action(() => {
      clearAuthToken()
      console.log(chalk.green('You have been logged out from Berget'))
    })

  auth
    .command(AuthService.COMMANDS.WHOAMI)
    .description('Show information about the logged in user')
    .action(async () => {
      try {
        const authService = AuthService.getInstance()
        const profile = await authService.whoami()

        if (profile) {
          console.log(
            chalk.bold(`Logged in as: ${profile.name || profile.login}`)
          )
          console.log(`Email: ${chalk.cyan(profile.email || 'Not available')}`)
          console.log(`Role: ${chalk.cyan(profile.role || 'Not available')}`)

          if (profile.company) {
            console.log(`Company: ${chalk.cyan(profile.company.name)}`)
          }
        } else {
          console.log(
            chalk.yellow('You are not logged in. Use `berget login` to log in.')
          )
        }
      } catch (error) {
        handleError('You are not logged in or an error occurred', error)
      }
    })
}
