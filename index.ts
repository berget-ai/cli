#!/usr/bin/env node

import { program } from 'commander'
import { registerCommands } from './src/commands'
import { checkBergetConfig } from './src/utils/config-checker'

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
}

program.parse(process.argv)
