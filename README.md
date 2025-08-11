# Berget CLI

En kommandoradsverktyg för att interagera med Berget AI:s infrastruktur och AI-modeller.

## Installation

```bash
npm install -g berget
# eller använd direkt med npx
npx berget --help
```

## Autentisering

Innan du kan använda CLI:t behöver du autentisera dig:

```bash
# Logga in med OAuth
npx berget auth login

# Skapa en API-nyckel
npx berget api-keys create --name "Min CLI-nyckel"

# Eller använd miljövariabel
export BERGET_API_KEY=sk_ber_your_api_key_here
```

## Chat-kommandot

### Grundläggande användning

```bash
# Interaktiv chat-session
npx berget chat run

# Använd specifik modell
npx berget chat run openai/gpt-oss

# Skicka direktmeddelande
npx berget chat run openai/gpt-oss "Förklara vad Docker är"

# Använd pipe för input
echo "Vad är Kubernetes?" | npx berget chat run openai/gpt-oss
```

### Praktiska användningsområden

#### 1. Git Commit-meddelanden

```bash
# Generera commit-meddelande från git diff
git diff | npx berget chat run openai/gpt-oss "Skapa ett conventional commit-meddelande för denna diff. Svara endast med meddelandet:"

# Använd som alias
alias gitcommit='git diff | npx berget chat run openai/gpt-oss "Generate a conventional commit message for this diff. Reply with only the commit message, nothing else:"'
```

#### 2. Kodgranskning och förklaringar

```bash
# Förklara kod
cat src/main.js | npx berget chat run openai/gpt-oss "Förklara vad denna kod gör:"

# Hitta buggar
cat problematic-file.py | npx berget chat run openai/gpt-oss "Analysera denna kod och hitta potentiella buggar:"

# Förbättringsförslag
git diff | npx berget chat run openai/gpt-oss "Ge förslag på förbättringar för denna kodändring:"
```

#### 3. Dokumentation

```bash
# Generera README
ls -la | npx berget chat run openai/gpt-oss "Skapa en README.md för detta projekt baserat på filstrukturen:"

# Kommentera kod
cat uncommented-code.js | npx berget chat run openai/gpt-oss "Lägg till JSDoc-kommentarer till denna kod:"
```

#### 4. Systemadministration

```bash
# Analysera loggar
tail -n 100 /var/log/nginx/error.log | npx berget chat run openai/gpt-oss "Analysera dessa felloggar och föreslå lösningar:"

# Förklara kommandon
npx berget chat run openai/gpt-oss "Förklara vad detta bash-kommando gör: find . -name '*.js' -exec grep -l 'TODO' {} \;"
```

## Användbara Bash/Zsh-alias

Lägg till dessa i din `~/.bashrc`, `~/.zshrc` eller liknande:

```bash
# Git-relaterade alias
alias gai='git diff | npx berget chat run openai/gpt-oss "Generate a conventional commit message for this diff. Reply with only the commit message, nothing else:"'
alias gexplain='git log --oneline -10 | npx berget chat run openai/gpt-oss "Förklara vad dessa commits gör:"'
alias gsec='~/bin/security-check'

# Kod-relaterade alias
alias explain='npx berget chat run openai/gpt-oss "Förklara denna kod:"'
alias review='npx berget chat run openai/gpt-oss "Granska denna kod och ge förbättringsförslag:"'
alias debug='npx berget chat run openai/gpt-oss "Hitta och förklara potentiella buggar i denna kod:"'

# Dokumentations-alias
alias docgen='npx berget chat run openai/gpt-oss "Generera dokumentation för denna kod:"'
alias readme='ls -la | npx berget chat run openai/gpt-oss "Skapa en README.md för detta projekt:"'

# System-alias
alias loganalyze='npx berget chat run openai/gpt-oss "Analysera dessa loggar och föreslå lösningar:"'
alias cmdexplain='npx berget chat run openai/gpt-oss "Förklara detta kommando:"'

# Snabb AI-assistent
alias ai='npx berget chat run openai/gpt-oss'
alias ask='npx berget chat run openai/gpt-oss'
```

## Avancerade exempel

Se `examples/` mappen för kompletta skript:

- **smart-commit.sh** - Automatisk generering av conventional commit-meddelanden
- **ai-review.sh** - AI-driven kodgranskning
- **security-check.sh** - Säkerhetsgranskning av commits

```bash
# Kopiera exempel-skript
cp examples/*.sh ~/bin/
chmod +x ~/bin/*.sh

# Använd dem
~/bin/smart-commit.sh
~/bin/ai-review.sh src/main.js
~/bin/security-check.sh
```

## Miljövariabler

```bash
# API-nyckel (rekommenderat)
export BERGET_API_KEY=sk_ber_your_api_key_here

# Debug-läge
export LOG_LEVEL=debug

# Anpassad API-bas-URL (om du använder egen instans)
export API_BASE_URL=https://your-custom-api.example.com
```

## Tips och tricks

1. **Använd pipes**: Kombinera med andra Unix-verktyg för kraftfulla workflows
2. **Korta prompter**: Var specifik men koncis i dina prompter för bästa resultat
3. **Streaming**: Streaming är aktiverat som standard för snabbare svar
4. **Modellval**: Experimentera med olika modeller för olika uppgifter
5. **Alias**: Skapa alias för vanliga användningsfall för att spara tid

## Kommandoreferens

- `auth login` - Logga in till Berget
- `auth logout` - Logga ut från Berget
- `auth whoami` - Visa aktuell användarinformation
- `api-keys list` - Lista API-nycklar
- `api-keys create` - Skapa en ny API-nyckel
- `models list` - Lista tillgängliga AI-modeller
- `chat run` - Starta en chat-session med en AI-modell
- `chat list` - Lista tillgängliga chat-modeller

För en komplett lista över kommandon, kör:

```bash
npx berget --help
```

## Felsökning

```bash
# Aktivera debug-läge
npx berget --debug chat run openai/gpt-oss "test"

# Kontrollera autentisering
npx berget auth whoami

# Lista tillgängliga modeller
npx berget chat list

# Kontrollera API-nyckel-status
npx berget api-keys list
```

## Development

### Setup

Klona repositoriet och installera beroenden:

```bash
git clone https://github.com/berget-ai/cli.git
cd cli
npm install
```

### Testa lokalt

Använd `start`-skriptet för att testa CLI:t lokalt med `--local`-flaggan:

```bash
npm start -- <command> [options]
```

Till exempel:

```bash
# Testa inloggning
npm start -- auth login

# Testa whoami
npm start -- auth whoami

# Testa med debug-output
npm start -- auth whoami --debug
```

## Bidra

Berget CLI är öppen källkod. Bidrag välkomnas!

- GitHub: [berget-ai/cli](https://github.com/berget-ai/cli)
- Issues: [Rapportera buggar](https://github.com/berget-ai/cli/issues)
- Dokumentation: [docs.berget.ai](https://docs.berget.ai)
