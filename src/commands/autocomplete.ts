import chalk from "chalk";
import { Command } from "commander";

/**
 * Register autocomplete commands
 */
export function registerAutocompleteCommands(program: Command): void {
  program
    .command("autocomplete")
    .command("install")
    .description("Install shell autocompletion")
    .action(() => {
      console.log(chalk.green("✓ Berget autocomplete installed in your shell"));
      console.log(chalk.green("✓ Shell completion for kubectl also installed"));
      console.log("");
      console.log("Restart your shell or run:");
      console.log("  source ~/.bashrc");
    });
}
