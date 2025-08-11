#!/bin/bash
# Smart commit generator using Berget AI
# Usage: ./smart-commit.sh
set -e

# Check if there are staged changes
if [[ -z $(git diff --cached) ]]; then
    echo "No staged changes found. Run 'git add' first."
    exit 1
fi

# Generate commit message
COMMIT_MSG=$(git diff --cached | npx berget chat run openai/gpt-oss "Generate a conventional commit message for this staged diff. Reply with only the commit message, nothing else:")

echo "Suggested commit message:"
echo "  $COMMIT_MSG"
echo

read -p "Do you want to use this message? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git commit -m "$COMMIT_MSG"
    echo "✅ Commit created!"
else
    echo "❌ Commit cancelled"
fi
