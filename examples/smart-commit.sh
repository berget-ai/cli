#!/bin/bash
# Smart commit generator using Berget AI
# Usage: ./smart-commit.sh
set -e

# Kontrollera att det finns ändringar
if [[ -z $(git diff --cached) ]]; then
    echo "Inga staged ändringar hittades. Kör 'git add' först."
    exit 1
fi

# Generera commit-meddelande
COMMIT_MSG=$(git diff --cached | npx berget chat run openai/gpt-oss "Generate a conventional commit message for this staged diff. Reply with only the commit message, nothing else:")

echo "Föreslaget commit-meddelande:"
echo "  $COMMIT_MSG"
echo

read -p "Vill du använda detta meddelande? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    git commit -m "$COMMIT_MSG"
    echo "✅ Commit skapad!"
else
    echo "❌ Commit avbruten"
fi
