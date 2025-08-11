#!/bin/bash
# Security check for git commits using Berget AI
# Usage: ./security-check.sh
set -e

echo "🔒 Säkerhetsgranskning av commits..."
echo "===================================="

# Kontrollera om det finns staged ändringar
if [[ -z $(git diff --cached) ]]; then
    echo "Inga staged ändringar hittades. Kör 'git add' först."
    exit 1
fi

# Hämta diff för säkerhetsgranskning
DIFF=$(git diff --cached)

echo "Analyserar säkerhetsrisker i staged ändringar..."

SECURITY_REPORT=$(echo "$DIFF" | npx berget chat run openai/gpt-oss "
Analysera denna git diff för säkerhetsrisker och sårbarheter:

1. **Känslig information**: API-nycklar, lösenord, tokens, secrets
2. **Injektionsrisker**: SQL injection, XSS, command injection
3. **Autentisering/auktorisering**: Svaga kontroller, privilege escalation
4. **Kryptografi**: Svag kryptering, hårdkodade nycklar
5. **Input-validering**: Otillräcklig validering, buffer overflows
6. **Filhantering**: Path traversal, osäkra filoperationer
7. **Nätverkssäkerhet**: Osäkra anslutningar, CSRF
8. **Loggning**: Känslig data i loggar, information disclosure

Ge en säkerhetsbedömning:
- 🟢 SÄKER: Inga säkerhetsrisker identifierade
- 🟡 VARNING: Mindre säkerhetsrisker som bör åtgärdas
- 🔴 KRITISK: Allvarliga säkerhetsrisker som MÅSTE åtgärdas

Format:
**SÄKERHETSBEDÖMNING: [🟢/🟡/🔴] [SÄKER/VARNING/KRITISK]**

**IDENTIFIERADE RISKER:**
- [Lista specifika risker om några]

**REKOMMENDATIONER:**
- [Konkreta åtgärder för att åtgärda riskerna]

Diff:
\`\`\`diff
$DIFF
\`\`\`
")

echo "$SECURITY_REPORT"
echo ""

# Extrahera säkerhetsnivå från rapporten
if echo "$SECURITY_REPORT" | grep -q "🔴.*KRITISK"; then
    echo "❌ KRITISKA säkerhetsrisker identifierade!"
    echo "Commit blockerad. Åtgärda säkerhetsproblemen innan du fortsätter."
    exit 1
elif echo "$SECURITY_REPORT" | grep -q "🟡.*VARNING"; then
    echo "⚠️  Säkerhetsvarningar identifierade."
    read -p "Vill du fortsätta med commit trots varningarna? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Commit avbruten. Åtgärda säkerhetsproblemen först."
        exit 1
    fi
elif echo "$SECURITY_REPORT" | grep -q "🟢.*SÄKER"; then
    echo "✅ Inga säkerhetsrisker identifierade. Säkert att fortsätta!"
else
    echo "⚠️  Kunde inte avgöra säkerhetsstatus. Granska manuellt."
    read -p "Vill du fortsätta med commit? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Commit avbruten."
        exit 1
    fi
fi

echo "Säkerhetsgranskning klar. Du kan nu köra 'git commit'."
