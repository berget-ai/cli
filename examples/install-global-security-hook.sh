#!/bin/bash
# Install global git security hook
# This script sets up a global pre-push hook that runs security checks on all repositories

set -e

echo "🔧 Installing global git security hook..."

# Create global git hooks directory
GLOBAL_HOOKS_DIR="$HOME/.git-hooks"
mkdir -p "$GLOBAL_HOOKS_DIR"

# Create the pre-push hook
cat > "$GLOBAL_HOOKS_DIR/pre-push" << 'EOF'
#!/bin/bash
# Global pre-push security hook using Berget AI
# This hook runs automatically before every git push

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔒 Running security check before push...${NC}"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not in a git repository${NC}"
    exit 1
fi

# Check if there are any commits to push
if [[ -z $(git log @{u}.. --oneline 2>/dev/null) ]]; then
    echo -e "${GREEN}✅ No new commits to push${NC}"
    exit 0
fi

# Get the diff of commits being pushed
DIFF=$(git diff @{u}.. 2>/dev/null || git diff HEAD~1)

if [[ -z "$DIFF" ]]; then
    echo -e "${GREEN}✅ No changes to analyze${NC}"
    exit 0
fi

echo -e "${BLUE}Analyzing security risks in commits being pushed...${NC}"

# Check if Berget CLI is available
if ! command -v npx > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  npx not found. Skipping security check.${NC}"
    echo -e "${YELLOW}Install Node.js and npm to enable security checks.${NC}"
    exit 0
fi

# Run security analysis
SECURITY_REPORT=$(echo "$DIFF" | npx berget chat run openai/gpt-oss "
Analyze this git diff for security vulnerabilities using OWASP Top 20 Code Review recommendations:

**OWASP Top 20 Security Categories to Check:**

1. **A01 - Broken Access Control**: Authorization bypasses, privilege escalation, insecure direct object references
2. **A02 - Cryptographic Failures**: Weak encryption, hardcoded keys, insecure random number generation, plain text storage
3. **A03 - Injection**: SQL injection, NoSQL injection, command injection, LDAP injection, XSS
4. **A04 - Insecure Design**: Missing security controls, threat modeling gaps, insecure architecture patterns
5. **A05 - Security Misconfiguration**: Default credentials, unnecessary features enabled, verbose error messages
6. **A06 - Vulnerable Components**: Outdated dependencies, known vulnerable libraries, unpatched components
7. **A07 - Authentication Failures**: Weak passwords, session management flaws, credential stuffing vulnerabilities
8. **A08 - Software Integrity Failures**: Unsigned code, insecure CI/CD pipelines, auto-update without verification
9. **A09 - Logging Failures**: Insufficient logging, sensitive data in logs, log injection
10. **A10 - Server-Side Request Forgery**: SSRF vulnerabilities, unvalidated URLs, internal service access

**Additional Critical Areas:**
11. **Input Validation**: Insufficient sanitization, buffer overflows, format string vulnerabilities
12. **Output Encoding**: XSS prevention, content type validation, encoding bypasses
13. **File Operations**: Path traversal, file upload vulnerabilities, insecure file permissions
14. **Network Security**: Insecure protocols, certificate validation, CSRF protection
15. **Session Management**: Session fixation, insecure cookies, session timeout issues
16. **Error Handling**: Information disclosure, stack traces in production, verbose error messages
17. **Business Logic**: Race conditions, workflow bypasses, price manipulation
18. **API Security**: Rate limiting, input validation, authentication on all endpoints
19. **Mobile Security**: Insecure data storage, weak encryption, certificate pinning
20. **Cloud Security**: Misconfigured permissions, exposed storage, insecure defaults

**Assessment Criteria:**
- 🟢 SAFE: No security risks identified according to OWASP guidelines
- 🟡 WARNING: Minor security risks that should be addressed (OWASP Medium risk)
- 🔴 CRITICAL: Serious security risks that MUST be addressed immediately (OWASP High/Critical risk)

**Required Response Format:**
**SECURITY ASSESSMENT: [🟢/🟡/🔴] [SAFE/WARNING/CRITICAL]**

**OWASP CATEGORIES AFFECTED:**
- [List specific OWASP categories if any vulnerabilities found]

**IDENTIFIED RISKS:**
- [List specific vulnerabilities with OWASP category references]

**RECOMMENDATIONS:**
- [Concrete remediation steps following OWASP secure coding practices]

**COMPLIANCE NOTES:**
- [Any additional security considerations or compliance requirements]

Diff to analyze:
\`\`\`diff
$DIFF
\`\`\`
" 2>/dev/null)

if [[ $? -ne 0 ]] || [[ -z "$SECURITY_REPORT" ]]; then
    echo -e "${YELLOW}⚠️  Security analysis failed or unavailable. Proceeding with push.${NC}"
    echo -e "${YELLOW}Make sure you have BERGET_API_KEY set or are logged in with 'npx berget auth login'${NC}"
    exit 0
fi

echo "$SECURITY_REPORT"
echo ""

# Extract security level from report
if echo "$SECURITY_REPORT" | grep -q "🔴.*CRITICAL"; then
    echo -e "${RED}❌ CRITICAL security risks identified!${NC}"
    echo -e "${RED}Push blocked. Address security issues before pushing.${NC}"
    echo ""
    echo -e "${YELLOW}To bypass this check (NOT RECOMMENDED):${NC}"
    echo -e "${YELLOW}git push --no-verify${NC}"
    exit 1
elif echo "$SECURITY_REPORT" | grep -q "🟡.*WARNING"; then
    echo -e "${YELLOW}⚠️  Security warnings identified.${NC}"
    read -p "Do you want to continue with push despite warnings? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Push cancelled. Address security issues first.${NC}"
        echo ""
        echo -e "${YELLOW}To bypass this check (NOT RECOMMENDED):${NC}"
        echo -e "${YELLOW}git push --no-verify${NC}"
        exit 1
    fi
elif echo "$SECURITY_REPORT" | grep -q "🟢.*SAFE"; then
    echo -e "${GREEN}✅ No security risks identified. Safe to push!${NC}"
else
    echo -e "${YELLOW}⚠️  Could not determine security status. Proceeding with caution.${NC}"
fi

echo -e "${GREEN}Security check complete. Proceeding with push...${NC}"
EOF

# Make the hook executable
chmod +x "$GLOBAL_HOOKS_DIR/pre-push"

# Configure git to use the global hooks directory
git config --global core.hooksPath "$GLOBAL_HOOKS_DIR"

echo -e "${GREEN}✅ Global security hook installed successfully!${NC}"
echo ""
echo -e "${BLUE}The security hook will now run automatically before every 'git push' in all repositories.${NC}"
echo ""
echo -e "${YELLOW}Requirements:${NC}"
echo -e "  • Node.js and npm installed"
echo -e "  • Berget CLI configured (npx berget auth login or BERGET_API_KEY set)"
echo ""
echo -e "${YELLOW}To disable the hook temporarily:${NC}"
echo -e "  git push --no-verify"
echo ""
echo -e "${YELLOW}To uninstall the global hook:${NC}"
echo -e "  git config --global --unset core.hooksPath"
echo -e "  rm -rf $GLOBAL_HOOKS_DIR"
