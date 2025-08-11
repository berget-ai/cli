# Berget CLI

A command-line tool for interacting with Berget AI's infrastructure and AI models.

## Installation

```bash
npm install -g berget
# or use directly with npx
npx berget --help
```

## Authentication

Before you can use the CLI, you need to authenticate:

```bash
# Login with OAuth
npx berget auth login

# Create an API key
npx berget api-keys create --name "My CLI Key"

# Or use environment variable
export BERGET_API_KEY=sk_ber_your_api_key_here
```

## Chat Command

### Basic Usage

```bash
# Interactive chat session
npx berget chat run

# Use specific model
npx berget chat run openai/gpt-oss

# Send direct message
npx berget chat run openai/gpt-oss "Explain what Docker is"

# Use pipe for input
echo "What is Kubernetes?" | npx berget chat run openai/gpt-oss
```

### Practical Use Cases

#### 1. Git Commit Messages

```bash
# Generate commit message from git diff
git diff | npx berget chat run openai/gpt-oss "Create a conventional commit message for this diff. Reply with only the message:"

# Use as alias
alias gitcommit='git diff | npx berget chat run openai/gpt-oss "Generate a conventional commit message for this diff. Reply with only the commit message, nothing else:"'
```

#### 2. Code Review and Explanations

```bash
# Explain code
cat src/main.js | npx berget chat run openai/gpt-oss "Explain what this code does:"

# Find bugs
cat problematic-file.py | npx berget chat run openai/gpt-oss "Analyze this code and find potential bugs:"

# Improvement suggestions
git diff | npx berget chat run openai/gpt-oss "Give suggestions for improvements to this code change:"
```

#### 3. Documentation

```bash
# Generate README
ls -la | npx berget chat run openai/gpt-oss "Create a README.md for this project based on the file structure:"

# Comment code
cat uncommented-code.js | npx berget chat run openai/gpt-oss "Add JSDoc comments to this code:"
```

#### 4. System Administration

```bash
# Analyze logs
tail -n 100 /var/log/nginx/error.log | npx berget chat run openai/gpt-oss "Analyze these error logs and suggest solutions:"

# Explain commands
npx berget chat run openai/gpt-oss "Explain what this bash command does: find . -name '*.js' -exec grep -l 'TODO' {} \;"
```

## Useful Bash/Zsh Aliases

Add these to your `~/.bashrc`, `~/.zshrc` or similar:

```bash
# Git-related aliases
alias gai='git diff | npx berget chat run openai/gpt-oss "Generate a conventional commit message for this diff. Reply with only the commit message, nothing else:"'
alias gexplain='git log --oneline -10 | npx berget chat run openai/gpt-oss "Explain what these commits do:"'
alias gsec='~/bin/security-check'

# Code-related aliases
alias explain='npx berget chat run openai/gpt-oss "Explain this code:"'
alias review='npx berget chat run openai/gpt-oss "Review this code and give improvement suggestions:"'
alias debug='npx berget chat run openai/gpt-oss "Find and explain potential bugs in this code:"'

# Documentation aliases
alias docgen='npx berget chat run openai/gpt-oss "Generate documentation for this code:"'
alias readme='ls -la | npx berget chat run openai/gpt-oss "Create a README.md for this project:"'

# System aliases
alias loganalyze='npx berget chat run openai/gpt-oss "Analyze these logs and suggest solutions:"'
alias cmdexplain='npx berget chat run openai/gpt-oss "Explain this command:"'

# Quick AI assistant
alias ai='npx berget chat run openai/gpt-oss'
alias ask='npx berget chat run openai/gpt-oss'
```

## Advanced Examples

See the `examples/` folder for complete scripts:

- **smart-commit.sh** - Automatic generation of conventional commit messages
- **ai-review.sh** - AI-driven code review
- **security-check.sh** - Security review of commits

```bash
# Copy example scripts
cp examples/*.sh ~/bin/
chmod +x ~/bin/*.sh

# Use them
~/bin/smart-commit.sh
~/bin/ai-review.sh src/main.js
~/bin/security-check.sh
```

## Environment Variables

```bash
# API key (recommended)
export BERGET_API_KEY=sk_ber_your_api_key_here

# Debug mode
export LOG_LEVEL=debug

# Custom API base URL (if using your own instance)
export API_BASE_URL=https://your-custom-api.example.com
```

## Tips and Tricks

1. **Use pipes**: Combine with other Unix tools for powerful workflows
2. **Short prompts**: Be specific but concise in your prompts for best results
3. **Streaming**: Streaming is enabled by default for faster responses
4. **Model selection**: Experiment with different models for different tasks
5. **Aliases**: Create aliases for common use cases to save time

## Command Reference

- `auth login` - Login to Berget
- `auth logout` - Logout from Berget
- `auth whoami` - Show current user information
- `api-keys list` - List API keys
- `api-keys create` - Create a new API key
- `models list` - List available AI models
- `chat run` - Start a chat session with an AI model
- `chat list` - List available chat models

For a complete list of commands, run:

```bash
npx berget --help
```

## Troubleshooting

```bash
# Enable debug mode
npx berget --debug chat run openai/gpt-oss "test"

# Check authentication
npx berget auth whoami

# List available models
npx berget chat list

# Check API key status
npx berget api-keys list
```

## Development

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/berget-ai/cli.git
cd cli
npm install
```

### Test Locally

Use the `start` script to test the CLI locally with the `--local` flag:

```bash
npm start -- <command> [options]
```

For example:

```bash
# Test login
npm start -- auth login

# Test whoami
npm start -- auth whoami

# Test with debug output
npm start -- auth whoami --debug
```

## Contributing

Berget CLI is open source. Contributions are welcome!

- GitHub: [berget-ai/cli](https://github.com/berget-ai/cli)
- Issues: [Report bugs](https://github.com/berget-ai/cli/issues)
- Documentation: [docs.berget.ai](https://docs.berget.ai)
