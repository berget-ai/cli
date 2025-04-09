import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'
import chalk from 'chalk'

// Configure marked to use the terminal renderer
marked.setOptions({
  renderer: new TerminalRenderer({
    // Customize the rendering options
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    table: chalk.white,
    listitem: chalk.yellow,
    strong: chalk.bold,
    em: chalk.italic,
    heading: chalk.bold.blueBright,
    hr: chalk.gray,
    link: chalk.blue.underline,
    // Adjust the width to fit the terminal
    width: process.stdout.columns || 80,
    // Use true colors if supported
    colors: true,
    // Customize code block rendering
    codespan: chalk.cyan,
    // Customize list bullet style
    bullet: '• '
  })
})

/**
 * Render markdown text to terminal-friendly formatted text
 * @param markdown The markdown text to render
 * @returns Formatted text for terminal display
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown) return ''
  
  try {
    // Convert markdown to terminal-friendly text
    return marked(markdown)
  } catch (error) {
    // If rendering fails, return the original text
    console.error(`Error rendering markdown: ${error}`)
    return markdown
  }
}

/**
 * Check if a string contains markdown formatting
 * @param text The text to check
 * @returns True if the text contains markdown formatting
 */
export function containsMarkdown(text: string): boolean {
  if (!text) return false
  
  // Check for common markdown patterns
  const markdownPatterns = [
    /^#+\s+/m,                // Headers
    /\*\*.*?\*\*/,            // Bold
    /\*.*?\*/,                // Italic
    /`.*?`/,                  // Inline code
    /```[\s\S]*?```/,         // Code blocks
    /\[.*?\]\(.*?\)/,         // Links
    /^\s*[-*+]\s+/m,          // Lists
    /^\s*\d+\.\s+/m,          // Numbered lists
    /^\s*>\s+/m,              // Blockquotes
    /\|.*\|.*\|/,             // Tables
    /^---+$/m,                // Horizontal rules
    /^===+$/m                 // Alternative headers
  ]
  
  return markdownPatterns.some(pattern => pattern.test(text))
}
