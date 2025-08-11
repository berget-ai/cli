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
