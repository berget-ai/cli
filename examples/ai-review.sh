#!/bin/bash
# AI code review using Berget AI
# Usage: ./ai-review.sh <filename>
set -e

if [[ $# -eq 0 ]]; then
    echo "Usage: ai-review <file>"
    exit 1
fi

FILE="$1"

if [[ ! -f "$FILE" ]]; then
    echo "Error: File '$FILE' does not exist"
    exit 1
fi

echo "🔍 Reviewing $FILE with AI..."
echo "================================"

cat "$FILE" | npx berget chat run openai/gpt-oss "
Review this code and provide feedback on:
1. Code quality and readability
2. Potential bugs or issues
3. Performance improvements
4. Best practices
5. Security aspects

Provide concrete suggestions for improvements:
"
