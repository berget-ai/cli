/**
 * OpenCode configuration builder
 * Creates the opencode.json config structure - single source of truth
 */

import type { MergeableConfig, AgentConfig, CommandConfig, ProviderConfig } from './types'
import type { ProviderModelConfig } from '../../utils/config-loader'

interface ModelConfig {
  primary: string
  small: string
}

type ProviderModels = Record<string, ProviderModelConfig>

/**
 * Create the fullstack agent configuration
 */
function createFullstackAgent(model: string): AgentConfig {
  return {
    model,
    temperature: 0.3,
    top_p: 0.9,
    mode: 'primary',
    permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
    description:
      'Router/coordinator agent for full-stack development with schema-driven architecture',
    prompt:
      'Voice: Scandinavian calm—precise, concise, confident; no fluff. You are Berget Code Fullstack agent. Act as a router and coordinator in a monorepo. Bottom-up schema: database → OpenAPI → generated types. Top-down types: API → UI → components. Use openapi-fetch and Zod at every boundary; compile-time errors are desired when contracts change. Routing rules: if task/paths match /apps/frontend or React (.tsx) → use frontend; if /apps/app or Expo/React Native → app; if /infra, /k8s, flux-system, kustomization.yaml, Helm values → devops; if /services, Koa routers, services/adapters/domain → backend. If ambiguous, remain fullstack and outline the end-to-end plan, then delegate subtasks to the right persona. Security: validate inputs; secrets via FluxCD SOPS/Sealed Secrets. Documentation is generated from code—never duplicated. CRITICAL: When all implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
  }
}

/**
 * Create the frontend agent configuration
 */
function createFrontendAgent(model: string): AgentConfig {
  return {
    model,
    temperature: 0.4,
    top_p: 0.9,
    mode: 'primary',
    permission: { edit: 'allow', bash: 'deny', webfetch: 'allow' },
    note: 'Bash access is denied for frontend persona to prevent shell command execution in UI environments. This restriction enforces security and architectural boundaries.',
    description:
      'Builds Scandinavian, type-safe UIs with React, Tailwind, Shadcn.',
    prompt:
      'You are Berget Code Frontend agent. Voice: Scandinavian calm—precise, concise, confident. React 18 + TypeScript. Tailwind + Shadcn UI only via the design system (index.css, tailwind.config.ts). Use semantic tokens for color/spacing/typography/motion; never ad-hoc classes or inline colors. Components are pure and responsive; props-first data; minimal global state (Zustand/Jotai). Accessibility and keyboard navigation mandatory. Mock data only at init under /data via typed hooks (e.g., useProducts() reading /data/products.json). Design: minimal, balanced, quiet motion. CRITICAL: When all frontend implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
  }
}

/**
 * Create the backend agent configuration
 */
function createBackendAgent(model: string): AgentConfig {
  return {
    model,
    temperature: 0.3,
    top_p: 0.9,
    mode: 'primary',
    permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
    description:
      'Functional, modular Koa + TypeScript services; schema-first with code quality focus.',
    prompt:
      'You are Berget Code Backend agent. Voice: Scandinavian calm—precise, concise, confident. TypeScript + Koa. Prefer many small pure functions; avoid big try/catch blocks. Routes thin; logic in services/adapters/domain. Validate with Zod; auto-generate OpenAPI. Adapters isolate external systems; domain never depends on framework. Test with supertest; idempotent and stateless by default. Each microservice emits an OpenAPI contract; changes propagate upward to types. Code Quality & Refactoring Principles: Apply Single Responsibility Principle, fail fast with explicit errors, eliminate code duplication, remove nested complexity, use descriptive error codes, keep functions under 30 lines. Always leave code cleaner and more readable than you found it. CRITICAL: When all backend implementation tasks are complete and ready for merge, ALWAYS invoke @quality subagent to handle testing, building, and complete PR management including URL provision.',
  }
}

/**
 * Create the devops agent configuration
 */
function createDevopsAgent(model: string): AgentConfig {
  return {
    model,
    temperature: 0.3,
    top_p: 0.8,
    mode: 'primary',
    permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
    description:
      'Declarative GitOps infra with FluxCD, Kustomize, Helm, operators.',
    prompt:
      'You are Berget Code DevOps agent. Voice: Scandinavian calm—precise, concise, confident. Start simple: k8s/{deployment,service,ingress}. Add FluxCD sync to repo and image automation. Use Kustomize bases/overlays (staging, production). Add dependencies via Helm from upstream sources; prefer native operators when available (CloudNativePG, cert-manager, external-dns). SemVer with -rc tags keeps CI environments current. Observability with Prometheus/Grafana. No manual kubectl in production—Git is the source of truth. For testing, building, and PR management, use @quality subagent.',
  }
}

/**
 * Create the app agent configuration
 */
function createAppAgent(model: string): AgentConfig {
  return {
    model,
    temperature: 0.4,
    top_p: 0.9,
    mode: 'primary',
    permission: { edit: 'allow', bash: 'deny', webfetch: 'allow' },
    note: 'Bash access is denied for app persona to prevent shell command execution in mobile/Expo environments. This restriction enforces security and architectural boundaries.',
    description:
      'Expo + React Native apps; props-first, offline-aware, shared tokens.',
    prompt:
      'You are Berget Code App agent. Voice: Scandinavian calm—precise, concise, confident. Expo + React Native + TypeScript. Structure by components/hooks/services/navigation. Components are pure; data via props; refactor shared logic into hooks/stores. Share tokens with frontend. Mock data in /data via typed hooks; later replace with live APIs. Offline via SQLite/MMKV; notifications via Expo. Request permissions only when needed. Subtle, meaningful motion; light/dark parity. For testing, building, and PR management, use @quality subagent.',
  }
}

/**
 * Create the security agent configuration
 */
function createSecurityAgent(model: string): AgentConfig {
  return {
    model,
    temperature: 0.2,
    top_p: 0.8,
    mode: 'subagent',
    permission: { edit: 'deny', bash: 'allow', webfetch: 'allow' },
    description:
      'Security specialist for pentesting, OWASP compliance, and vulnerability assessments.',
    prompt:
      'Voice: Scandinavian calm—precise, concise, confident. You are Berget Code Security agent. Expert in application security, penetration testing, and OWASP standards. Core responsibilities: Conduct security assessments and penetration tests, Validate OWASP Top 10 compliance, Review code for security vulnerabilities, Implement security headers and Content Security Policy (CSP), Audit API security, Check for sensitive data exposure, Validate input sanitization and output encoding, Assess dependency security and supply chain risks. Tools and techniques: OWASP ZAP, Burp Suite, security linters, dependency scanners, manual code review. Always provide specific, actionable security recommendations with priority levels. Workflow: Always follow branch_strategy and commit_convention from workflow section. Never work directly in main. Agent awareness: Review code from all personas (frontend, backend, app, devops). If implementation changes are needed, suggest <tab> to switch to appropriate persona after security assessment.',
  }
}

/**
 * Create the quality agent configuration
 */
function createQualityAgent(model: string): AgentConfig {
  return {
    model,
    temperature: 0.1,
    top_p: 0.9,
    mode: 'subagent',
    permission: { edit: 'allow', bash: 'allow', webfetch: 'allow' },
    description:
      'Quality assurance specialist for testing, building, and complete PR management.',
    prompt:
      'Voice: Scandinavian calm—precise, concise, confident. You are Berget Code Quality agent. Specialist in code quality assurance, testing, building, and complete pull request lifecycle management.\n\nCore responsibilities:\n  - Run comprehensive test suites (npm test, npm run test, jest, vitest)\n  - Execute build processes (npm run build, webpack, vite, tsc)\n  - Create and manage pull requests with proper descriptions\n  - Handle merge conflicts and keep main updated\n  - Monitor GitHub for reviewer comments and address them\n  - Ensure code quality standards are met\n  - Validate linting and formatting (npm run lint, prettier)\n  - Check test coverage and performance benchmarks\n  - Handle CI/CD pipeline validation\n\nComplete PR Workflow:\n  1. Ensure all tests pass: npm test\n  2. Build successfully: npm run build\n  3. Commit all changes with proper message\n  4. Push to feature branch\n  5. Update main branch and handle merge conflicts\n  6. Create or update PR with comprehensive description\n  7. Monitor for reviewer comments\n  8. Address feedback and push updates\n  9. Always provide PR URL for user review\n\nEssential CLI commands:\n  - npm test or npm run test (run test suite)\n  - npm run build (build project)\n  - npm run lint (run linting)\n  - npm run format (format code)\n  - npm run test:coverage (check coverage)\n  - git add . && git commit -m "message" && git push (commit and push)\n  - git checkout main && git pull origin main (update main)\n  - git checkout feature-branch && git merge main (handle conflicts)\n  - gh pr create --title "title" --body "body" (create PR)\n  - gh pr view --comments (check PR comments)\n  - gh pr edit --title "title" --body "body" (update PR)\n\nPR Creation Process:\n  - Always include clear summary of changes\n  - List technical details and improvements\n  - Include testing and validation results\n  - Add any breaking changes or migration notes\n  - Provide PR URL immediately after creation\n\nMerge Conflict Resolution:\n  - Always update main before creating PR\n  - Resolve conflicts in feature branch\n  - Test after resolving conflicts\n  - Push resolved changes\n\nAlways provide specific command examples and wait for processes to complete before proceeding.',
  }
}

/**
 * Create command configurations
 */
function createCommands(): Record<string, CommandConfig> {
  return {
    fullstack: {
      description: 'Switch to Fullstack (router)',
      template: '{{input}}',
      agent: 'fullstack',
    },
    route: {
      description:
        'Let Fullstack auto-route to the right persona based on files/intent',
      template: 'ROUTE {{input}}',
      agent: 'fullstack',
      subtask: true,
    },
    frontend: {
      description: 'Switch to Frontend persona',
      template: '{{input}}',
      agent: 'frontend',
    },
    backend: {
      description: 'Switch to Backend persona',
      template: '{{input}}',
      agent: 'backend',
    },
    devops: {
      description: 'Switch to DevOps persona',
      template: '{{input}}',
      agent: 'devops',
    },
    app: {
      description: 'Switch to App persona',
      template: '{{input}}',
      agent: 'app',
    },
    security: {
      description:
        'Switch to Security persona for pentesting and OWASP compliance',
      template: '{{input}}',
      agent: 'security',
    },
    quality: {
      description:
        'Switch to Quality agent for testing, building, and PR management',
      template: '{{input}}',
      agent: 'quality',
    },
  }
}

/**
 * Create provider configuration
 */
function createProvider(providerModels: ProviderModels): Record<string, ProviderConfig> {
  return {
    berget: {
      npm: '@ai-sdk/openai-compatible',
      name: 'Berget AI',
      options: {
        baseURL: 'https://api.berget.ai/v1',
        apiKey: '{env:BERGET_API_KEY}',
      },
      models: providerModels,
    },
  }
}

/**
 * Create complete OpenCode configuration
 * This is the single source of truth for config structure
 */
export function createOpenCodeConfig(
  modelConfig: ModelConfig,
  providerModels: ProviderModels,
  latestAgentConfig?: Record<string, AgentConfig>
): MergeableConfig {
  const model = modelConfig.primary

  return {
    $schema: 'https://opencode.ai/config.json',
    username: 'berget-code',
    theme: 'berget-dark',
    share: 'manual',
    autoupdate: true,
    model: modelConfig.primary,
    small_model: modelConfig.small,
    agent: {
      fullstack: createFullstackAgent(model),
      frontend: createFrontendAgent(model),
      backend: createBackendAgent(model),
      devops: latestAgentConfig?.devops || createDevopsAgent(model),
      app: createAppAgent(model),
      security: createSecurityAgent(model),
      quality: createQualityAgent(model),
    },
    command: createCommands(),
    watcher: {
      ignore: ['node_modules', 'dist', '.git', 'coverage'],
    },
    provider: createProvider(providerModels),
  }
}
