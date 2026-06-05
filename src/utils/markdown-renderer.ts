import chalk from 'chalk';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

// Configure marked to use the terminal renderer
// @types/marked-terminal is outdated; cast to suppress type error
marked.use(
  markedTerminal({
    blockquote: chalk.gray.italic,
    // Customize the rendering options
    code: chalk.cyan,
    // Customize code block rendering
    codespan: chalk.cyan,
    em: chalk.italic,
    heading: chalk.bold.blueBright,
    hr: chalk.gray,
    link: chalk.blue.underline,
    listitem: chalk.yellow,
    strong: chalk.bold,
    table: chalk.white,
    // Adjust the width to fit the terminal
    width: process.stdout.columns || 80,
  }) as any,
);

/**
 * Check if a string contains markdown formatting
 * @param text The text to check
 * @returns True if the text contains markdown formatting
 */
export function containsMarkdown(text: string): boolean {
  if (!text) return false;

  // Check for common markdown patterns
  const markdownPatterns = [
    /^#+\s+/m, // Headers
    /\*\*.*?\*\*/, // Bold
    /\*.*?\*/, // Italic
    /`.*?`/, // Inline code
    /```[\s\S]*?```/, // Code blocks
    /\[.*?\]\(.*?\)/, // Links
    /^\s*[-*+]\s+/m, // Lists
    /^\s*\d+\.\s+/m, // Numbered lists
    /^\s*>\s+/m, // Blockquotes
    /\|.*\|.*\|/, // Tables
    /^---+$/m, // Horizontal rules
    /^===+$/m, // Alternative headers
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}

/**
 * Render markdown text to terminal-friendly formatted text
 * @param markdown The markdown text to render
 * @returns Formatted text for terminal display
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown) return '';

  try {
    // Convert markdown to terminal-friendly text
    // marked.parse() can return Promise<string> when async extensions are used,
    // but markedTerminal is synchronous so we cast
    return marked.parse(markdown) as string;
  } catch (error) {
    // If rendering fails, return the original text
    console.error(`Error rendering markdown: ${error}`);
    return markdown;
  }
}
