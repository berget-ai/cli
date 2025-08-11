#!/bin/bash
# AI code review using Berget AI
# Usage: ./ai-review.sh <filename>
set -e

if [[ $# -eq 0 ]]; then
    echo "Användning: ai-review <fil>"
    exit 1
fi

FILE="$1"

if [[ ! -f "$FILE" ]]; then
    echo "Fel: Filen '$FILE' finns inte"
    exit 1
fi

echo "🔍 Granskar $FILE med AI..."
echo "================================"

cat "$FILE" | npx berget chat run openai/gpt-oss "
Granska denna kod och ge feedback på:
1. Kodkvalitet och läsbarhet
2. Potentiella buggar eller problem
3. Prestandaförbättringar
4. Best practices
5. Säkerhetsaspekter

Ge konkreta förslag på förbättringar:
"
