/**
 * Documentation generator for AGENTS.md
 * Single source of truth for agent documentation
 */

import * as fs from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'
import chalk from 'chalk'

/**
 * Generate the AGENTS.md content
 * This is the single source of truth for agent documentation
 */
export function createAgentsMdContent(projectName: string): string {
  return `# Berget Code Agents

This document describes the specialized agents available in this project for use with OpenCode.

## Available Agents

### Primary Agents

#### fullstack
Router/coordinator agent for full-stack development with schema-driven architecture. Handles routing between different personas based on file paths and task requirements.

**Use when:**
- Working across multiple parts of a monorepo
- Need to coordinate between frontend, backend, devops, and app
- Starting new projects and need to determine tech stack

**Key features:**
- Schema-driven development (database → OpenAPI → types)
- Automatic routing to appropriate persona
- Tech stack discovery and recommendations

#### frontend
Builds Scandinavian, type-safe UIs with React, Tailwind, and Shadcn.

**Use when:**
- Working with React components (.tsx files)
- Frontend development in /apps/frontend
- UI/UX implementation

**Key features:**
- Design system integration
- Semantic tokens and accessibility
- Props-first component architecture

#### backend
Functional, modular Koa + TypeScript services with schema-first approach and code quality focus.

**Use when:**
- Working with Koa routers and services
- Backend development in /services
- API development and database work

**Key features:**
- Zod validation and OpenAPI generation
- Code quality and refactoring principles
- PR workflow integration

#### devops
Declarative GitOps infrastructure with FluxCD, Kustomize, Helm, and operators.

**Use when:**
- Working with Kubernetes manifests
- Infrastructure in /infra or /k8s
- CI/CD and deployment configurations

**Key features:**
- GitOps workflows
- Operator-first approach
- SemVer with release candidates

**Helm Values Configuration Process:**
1. Documentation First Approach: Always fetch official documentation from Artifact Hub/GitHub for the specific chart version before writing values. Search Artifact Hub for exact chart version documentation, check the chart's GitHub repository for official docs and examples, verify the exact version being used in the deployment.
2. Validation Requirements: Check for available validation schemas before committing YAML files. Use Helm's built-in validation tools (helm lint, helm template). Validate against JSON schema if available for the chart. Ensure YAML syntax correctness with linters.
3. Standard Workflow: Identify chart name and exact version. Fetch official documentation from Artifact Hub/GitHub. Check for available schemas and validation tools. Write values according to official documentation. Validate against schema (if available). Test with helm template or helm lint. Commit validated YAML files.
4. Quality Assurance: Never commit unvalidated Helm values. Use helm dependency update when adding new charts. Test rendering with helm template --dry-run before deployment. Document any custom values with comments referencing official docs.

#### app
Expo + React Native applications with props-first architecture and offline awareness.

**Use when:**
- Mobile app development with Expo
- React Native projects in /apps/app
- Cross-platform mobile development

**Key features:**
- Shared design tokens with frontend
- Offline-first architecture
- Expo integration

### Subagents

#### security
Security specialist for penetration testing, OWASP compliance, and vulnerability assessments.

**Use when:**
- Need security review of code changes
- OWASP Top 10 compliance checks
- Vulnerability assessments

**Key features:**
- OWASP standards compliance
- Security best practices
- Actionable remediation strategies

#### quality
Quality assurance specialist for testing, building, and PR management.

**Use when:**
- Need to run test suites and build processes
- Creating or updating pull requests
- Monitoring GitHub for reviewer comments
- Ensuring code quality standards

**Key features:**
- Comprehensive testing and building workflows
- PR creation and management
- GitHub integration for reviewer feedback
- CLI command expertise for quality assurance

## Usage

### Switching Agents
Use the \`<tab>\` key to cycle through primary agents during a session.

### Manual Agent Selection
Use commands to switch to specific agents:
- \`/fullstack\` - Switch to Fullstack agent
- \`/frontend\` - Switch to Frontend agent  
- \`/backend\` - Switch to Backend agent
- \`/devops\` - Switch to DevOps agent
- \`/app\` - Switch to App agent
- \`/quality\` - Switch to Quality agent for testing and PR management

### Using Subagents
Mention subagents with \`@\` symbol:
- \`@security review this authentication implementation\`
- \`@quality run tests and create PR for these changes\`

## Routing Rules

The fullstack agent automatically routes tasks based on file patterns:

- \`/apps/frontend\` or \`.tsx\` files → frontend
- \`/apps/app\` or Expo/React Native → app  
- \`/infra\`, \`/k8s\`, FluxCD, Helm → devops
- \`/services\`, Koa routers → backend

## Configuration

All agents are configured in \`opencode.json\` with:
- Specialized prompts and temperature settings
- Appropriate tool permissions
- Model optimizations for their specific tasks

## Environment Setup

Configure \`.env\` with your API key:
\`\`\`
BERGET_API_KEY=your_api_key_here
\`\`\`

## Workflow

All agents follow these principles:
- Never work directly in main branch
- Follow branch strategy and commit conventions
- Create PRs for new functionality
- Run tests before committing
- Address reviewer feedback promptly

---

*Generated by berget code init for ${projectName}*
`
}

/**
 * Write AGENTS.md file if it doesn't exist
 * @returns true if file was created, false if it already existed
 */
export async function writeAgentsMd(
  projectPath: string,
  projectName: string,
  forceOverwrite = false
): Promise<boolean> {
  const agentsMdPath = path.join(projectPath, 'AGENTS.md')

  if (fs.existsSync(agentsMdPath) && !forceOverwrite) {
    console.log(
      chalk.yellow('⚠ AGENTS.md already exists, skipping creation')
    )
    return false
  }

  const content = createAgentsMdContent(projectName)
  await writeFile(agentsMdPath, content)
  console.log(chalk.green('✓ Created AGENTS.md'))
  console.log(chalk.dim('  Documentation for available agents and usage'))
  return true
}

/**
 * Ensure .gitignore contains .env entry
 */
export async function ensureGitignoreHasEnv(projectPath: string): Promise<boolean> {
  const gitignorePath = path.join(projectPath, '.gitignore')
  let gitignoreContent = ''

  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
  }

  if (!gitignoreContent.includes('.env')) {
    gitignoreContent +=
      (gitignoreContent.endsWith('\n') ? '' : '\n') + '.env\n'
    await writeFile(gitignorePath, gitignoreContent)
    console.log(chalk.green('✓ Added .env to .gitignore'))
    return true
  }

  return false
}
