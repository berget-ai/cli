#!/bin/bash
# Security check for git commits using Berget AI
# Usage: ./security-check.sh
set -e

echo "🔒 Security review of commits..."
echo "===================================="

# Check if there are staged changes
if [[ -z $(git diff --cached) ]]; then
    echo "No staged changes found. Run 'git add' first."
    exit 1
fi

# Get diff for security review
DIFF=$(git diff --cached)

echo "Analyzing security risks in staged changes..."

SECURITY_REPORT=$(echo "$DIFF" | npx berget chat run openai/gpt-oss "
Analyze this git diff for security risks and vulnerabilities:

1. **Sensitive information**: API keys, passwords, tokens, secrets
2. **Injection risks**: SQL injection, XSS, command injection
3. **Authentication/authorization**: Weak controls, privilege escalation
4. **Cryptography**: Weak encryption, hardcoded keys
5. **Input validation**: Insufficient validation, buffer overflows
6. **File handling**: Path traversal, unsafe file operations
7. **Network security**: Insecure connections, CSRF
8. **Logging**: Sensitive data in logs, information disclosure

Provide a security assessment:
- 🟢 SAFE: No security risks identified
- 🟡 WARNING: Minor security risks that should be addressed
- 🔴 CRITICAL: Serious security risks that MUST be addressed

Format:
**SECURITY ASSESSMENT: [🟢/🟡/🔴] [SAFE/WARNING/CRITICAL]**

**IDENTIFIED RISKS:**
- [List specific risks if any]

**RECOMMENDATIONS:**
- [Concrete actions to address the risks]

Diff:
\`\`\`diff
$DIFF
\`\`\`
")

echo "$SECURITY_REPORT"
echo ""

# Extract security level from report
if echo "$SECURITY_REPORT" | grep -q "🔴.*CRITICAL"; then
    echo "❌ CRITICAL security risks identified!"
    echo "Commit blocked. Address security issues before continuing."
    exit 1
elif echo "$SECURITY_REPORT" | grep -q "🟡.*WARNING"; then
    echo "⚠️  Security warnings identified."
    read -p "Do you want to continue with commit despite warnings? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Commit cancelled. Address security issues first."
        exit 1
    fi
elif echo "$SECURITY_REPORT" | grep -q "🟢.*SAFE"; then
    echo "✅ No security risks identified. Safe to continue!"
else
    echo "⚠️  Could not determine security status. Review manually."
    read -p "Do you want to continue with commit? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Commit cancelled."
        exit 1
    fi
fi

echo "Security review complete. You can now run 'git commit'."
