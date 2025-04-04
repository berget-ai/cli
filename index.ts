#!/usr/bin/env node

import { program } from 'commander'
import { registerCommands } from './src/commands'
import { checkBergetConfig } from './src/utils/config-checker'
import chalk from 'chalk'

// Set version and description
program
  .name('berget')
  .description(
    `______                     _      ___  _____ 
| ___ \\                   | |    / _ \\|_   _|
| |_/ / ___ _ __ __ _  ___| |_  / /_\\ \\ | |  
| ___ \\/ _ \\ '__/ _\` |/ _ \\ __| |  _  | | |  
| |_/ /  __/ | | (_| |  __/ |_  | | | |_| |_ 
\\____/ \\___|_|  \\__, |\\___|\\_\\_ \\_| |_/\\___/ 
                 __/ |                      
                |___/   AI on European terms`
  )
  .version(process.env.npm_package_version || '0.0.1', '-v, --version')
  .option('--local', 'Use local API endpoint (hidden)', false)
  .option('--debug', 'Enable debug output', false)

// Register all commands
registerCommands(program)

// Check for .bergetconfig if not running a command
if (process.argv.length <= 2) {
  checkBergetConfig()
  
  // Show helpful welcome message
  console.log(chalk.blue('\nWelcome to the Berget CLI!'));
  console.log(chalk.blue('Common commands:'));
  console.log(chalk.blue(`  ${chalk.bold('berget auth login')}      - Log in to Berget`));
  console.log(chalk.blue(`  ${chalk.bold('berget models list')}     - List available AI models`));
  console.log(chalk.blue(`  ${chalk.bold('berget chat run')}        - Start a chat session`));
  console.log(chalk.blue(`  ${chalk.bold('berget api-keys list')}   - List your API keys`));
  console.log(chalk.blue(`\nRun ${chalk.bold('berget --help')} for a complete list of commands.`));
}

// Add helpful suggestions for common command mistakes
const commonMistakes = {
  'login': 'auth login',
  'logout': 'auth logout',
  'whoami': 'auth whoami',
  'list-models': 'models list',
  'list-keys': 'api-keys list',
  'create-key': 'api-keys create',
  'list-clusters': 'clusters list',
  'usage': 'billing usage'
};

// Add error handler for unknown commands
program.on('command:*', (operands) => {
  const unknownCommand = operands[0];
  console.error(chalk.red(`Error: unknown command '${unknownCommand}'`));
  
  // Check if this is a known mistake and suggest the correct command
  if (commonMistakes[unknownCommand]) {
    console.log(chalk.yellow(`Did you mean? ${chalk.bold(`berget ${commonMistakes[unknownCommand]}`)}`));
  } else {
    // Try to find similar commands
    const availableCommands = program.commands.map(cmd => cmd.name());
    const similarCommands = availableCommands.filter(cmd => 
      cmd.includes(unknownCommand) || unknownCommand.includes(cmd)
    );
    
    if (similarCommands.length > 0) {
      console.log(chalk.yellow('Similar commands:'));
      similarCommands.forEach(cmd => {
        console.log(chalk.yellow(`  ${chalk.bold(`berget ${cmd}`)}`));
      });
    }
    
    console.log(chalk.blue('\nRun `berget --help` for a list of available commands.'));
  }
  
  process.exit(1);
});

program.parse(process.argv)
