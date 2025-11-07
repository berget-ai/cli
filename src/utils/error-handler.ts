import chalk from 'chalk'

/**
 * Formats and prints error messages in a consistent way
 */
export function handleError(message: string, error: any): void {
  console.error(chalk.red(`Error: ${message}`))

  // If the error is a string (like JSON.stringify(error))
  if (typeof error === 'string') {
    try {
      // Try to parse it as JSON
      const parsedError = JSON.parse(error)
      if (parsedError.error) {
        console.error(chalk.dim(`Details: ${parsedError.error}`))
        if (parsedError.code) {
          console.error(chalk.dim(`Code: ${parsedError.code}`))
        }
      } else {
        console.error(chalk.dim(`Details: ${error}`))
      }
    } catch {
      // If it's not valid JSON, just print the string
      console.error(chalk.dim(`Details: ${error}`))
    }
  } else if (error && error.message) {
    // If it's an Error object
    console.error(chalk.dim(`Details: ${error.message}`))
  }

  // Check for authentication errors
  if (
    (typeof error === 'string' &&
      (error.includes('Unauthorized') ||
        error.includes('Authentication failed'))) ||
    (error &&
      error.message &&
      (error.message.includes('Unauthorized') ||
        error.message.includes('Authentication failed'))) ||
    (error &&
      error.code &&
      (error.code === 401 || error.code === 'AUTH_FAILED'))
  ) {
    console.error(
      chalk.yellow('\nYou need to be logged in to use this command.'),
    )
    console.error(chalk.yellow('Run `berget auth login` to authenticate.'))
  }
}
