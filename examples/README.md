# Berget CLI Examples

This folder contains practical examples of how you can use Berget CLI for various automation tasks.

## Scripts

### smart-commit.sh
Automatic generation of conventional commit messages based on git diff.

```bash
# Make the script executable
chmod +x examples/smart-commit.sh

# Use it
git add .
./examples/smart-commit.sh
```

### ai-review.sh
AI-driven code review that analyzes files for quality, bugs, and security aspects.

```bash
# Make the script executable
chmod +x examples/ai-review.sh

# Review a file
./examples/ai-review.sh src/main.js
```

### security-check.sh
Security review of git commits that blocks commits with critical security risks.

```bash
# Make the script executable
chmod +x examples/security-check.sh

# Run security check
git add .
./examples/security-check.sh
```

## Installation

To use these scripts:

1. Copy them to your `~/bin` folder or another location in your PATH
2. Make them executable with `chmod +x`
3. Make sure you have Berget CLI installed and configured

```bash
# Copy to ~/bin
cp examples/*.sh ~/bin/

# Make them executable
chmod +x ~/bin/smart-commit.sh ~/bin/ai-review.sh ~/bin/security-check.sh
```

## Global Security Hook

For maximum security, you can install a global git hook that automatically runs security checks before every push:

```bash
# Install the global security hook
chmod +x examples/install-global-security-hook.sh
./examples/install-global-security-hook.sh
```

This will:
- Create a global pre-push hook that runs on all repositories
- Automatically analyze commits for security vulnerabilities using OWASP Top 20
- Block pushes with critical security issues
- Warn about medium-risk issues and allow you to choose

The hook will run automatically before every `git push`. To bypass it temporarily (not recommended):
```bash
git push --no-verify
```

## Git Aliases

You can also add these as git aliases:

```bash
git config --global alias.ai-commit '!~/bin/smart-commit.sh'
git config --global alias.ai-review '!~/bin/ai-review.sh'
git config --global alias.security-check '!~/bin/security-check.sh'
```

Then you can use:

```bash
git ai-commit
git ai-review src/main.js
git security-check
```
