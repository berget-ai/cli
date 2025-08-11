# Berget CLI Examples

Denna mapp innehåller praktiska exempel på hur du kan använda Berget CLI för olika automatiseringsuppgifter.

## Skript

### smart-commit.sh
Automatisk generering av conventional commit-meddelanden baserat på git diff.

```bash
# Gör skriptet körbart
chmod +x examples/smart-commit.sh

# Använd det
git add .
./examples/smart-commit.sh
```

### ai-review.sh
AI-driven kodgranskning som analyserar filer för kvalitet, buggar och säkerhetsaspekter.

```bash
# Gör skriptet körbart
chmod +x examples/ai-review.sh

# Granska en fil
./examples/ai-review.sh src/main.js
```

### security-check.sh
Säkerhetsgranskning av git commits som blockerar commits med kritiska säkerhetsrisker.

```bash
# Gör skriptet körbart
chmod +x examples/security-check.sh

# Kör säkerhetskontroll
git add .
./examples/security-check.sh
```

## Installation

För att använda dessa skript:

1. Kopiera dem till din `~/bin` mapp eller annan plats i din PATH
2. Gör dem körbara med `chmod +x`
3. Se till att du har Berget CLI installerat och konfigurerat

```bash
# Kopiera till ~/bin
cp examples/*.sh ~/bin/

# Gör dem körbara
chmod +x ~/bin/smart-commit.sh ~/bin/ai-review.sh ~/bin/security-check.sh
```

## Git Aliases

Du kan också lägga till dessa som git aliases:

```bash
git config --global alias.ai-commit '!~/bin/smart-commit.sh'
git config --global alias.ai-review '!~/bin/ai-review.sh'
git config --global alias.security-check '!~/bin/security-check.sh'
```

Sedan kan du använda:

```bash
git ai-commit
git ai-review src/main.js
git security-check
```
