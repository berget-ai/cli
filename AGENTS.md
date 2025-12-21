# Berget Code Agents

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

# ⚠️ ABSOLUTE RULE: kubectl apply NEVER

**THIS RULE HAS NO EXCEPTIONS - APPLIES TO ALL ENVIRONMENTS: DEV, STAGING, PRODUCTION**

Declarative GitOps infrastructure with FluxCD, Kustomize, Helm, and operators.

**Use when:**

- Working with Kubernetes manifests
- Infrastructure in /infra or /k8s
- CI/CD and deployment configurations

**Key features:**

- GitOps workflows
- Operator-first approach
- SemVer with release candidates

## 🚨 CRITICAL: WHY kubectl apply DESTROYS GITOPS

**kubectl apply is fundamentally incompatible with GitOps because it:**

1. **Overwrites FluxCD metadata** - The `kubectl.kubernetes.io/last-applied-configuration` annotation gets replaced with kubectl's version, breaking FluxCD's tracking
2. **Breaks the single source of truth** - Your cluster state diverges from Git state, making Git no longer authoritative
3. **Creates synchronization conflicts** - FluxCD cannot reconcile differences between Git and cluster state
4. **Makes debugging impossible** - Manual changes are invisible in Git history
5. **Undermines the entire GitOps model** - The promise of "Git as source of truth" is broken

## 📋 EXACTLY WHAT GETS DESTROYED

When you run `kubectl apply`, these critical metadata fields are corrupted:

```yaml
# BEFORE: FluxCD-managed resource
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"apps/v1","kind":"Deployment","metadata":{"annotations":{},"name":"app","namespace":"default"},"spec":{"template":{"spec":{"containers":[{"image":"nginx:1.21","name":"nginx"}]}}}}
    kustomize.toolkit.fluxcd.io/checksum: a1b2c3d4e5f6
    kustomize.toolkit.fluxcd.io/ssa: Merge

# AFTER: kubectl apply destroys this
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"apps/v1","kind":"Deployment","metadata":{"annotations":{},"name":"app","namespace":"default"},"spec":{"template":{"spec":{"containers":[{"image":"nginx:1.22","name":"nginx"}]}}}}
    # kustomize.toolkit.fluxcd.io/checksum: GONE!
    # kustomize.toolkit.fluxcd.io/ssa: GONE!
```

## 🔥 CONSEQUENCES OF USING kubectl apply

**Immediate Impact:**
- FluxCD loses track of the resource
- Future Git commits may not apply correctly
- Resource becomes "orphaned" from GitOps control

**Long-term Damage:**
- Cluster drift becomes undetectable
- Rollback capabilities are compromised
- Audit trail is broken
- Team loses trust in GitOps process

**Recovery Required:**
- Manual intervention to restore FluxCD metadata
- Potential resource recreation
- Downtime during recovery
- Complete audit of affected resources

## 🚨 KRITISKA REGLER FÖR FLUXCD-kluster

# ⚠️ ABSOLUT ALDRIG: kubectl apply

**DENNA REGLER HAR INGA UNDTAG - GÄLLER ALLTID: DEV, STAGING, PRODUCTION**

**ABSOLUT ALDRIG använd `kubectl apply` i FluxCD-hanterade kluster!**

### ❌ FORBUDNA OPERATIONER

```bash
# ❌ ALDRIG GÖR DETTA!
kubectl apply -f deployment.yaml
kubectl apply -f kustomization.yaml
kubectl apply -f flux-system/  # SPECIELT INTE FLUXCD-MANIFEST!
kubectl create -f ...
kubectl replace -f ...
kubectl edit deployment/...
kubectl patch deployment/...
```

### ✅ TILLÅTNA OPERATIONER (Read-Only)

```bash
# ✅ SÄKERT FÖR DIAGNOSTIK
kubectl get pods
kubectl describe deployment/app
kubectl logs -f pod/name
kubectl get events
kubectl top nodes
```

### 🔄 RÄTT SÄTT ATT GÖRA ÄNDRINGAR

1. **Git är sanningens källa** - alla ändringar måste gå via Git repository
2. **FluxCD synkroniserar automatiskt** - ändra YAML-filer, inte klustret direkt
3. **Använd PR workflow** - commit ändringar, skapa PR, låt FluxCD hantera deployment

### 🚨 VAD HÄNDER OM DU ÄNDÅ ANVÄNDER kubectl apply?

**DET HÄNDER OM DU ANVÄNDER kubectl apply:**

- **Förstör FluxCD-metadata** - `kubectl.kubernetes.io/last-applied-configuration` skrivs över
- **Breakar GitOps-modellen** - klustret divergerar från Git-repository
- **FluxCD kan inte synkronisera** - konflikter mellan Git-state och kluster-state
- **Svår att diagnostisera** - manuella ändringar är osynliga i Git-historiken

**RESULTATET: FluxCD FÖRLORAR KONTROLLEN OCH KLUSTRET BLIR O-SYNKRONISERAT FRÅN GIT!**

### 🆘 NÖDSITUATIONER

```bash
# Pausa FluxCD temporärt
flux suspend kustomization app-name

# Gör nödvändiga ändringar i Git
git commit -m "emergency fix"
git push

# Återuppta FluxCD
flux resume kustomization app-name
```

### 💡 MINNESREGEL

> **"Git first, kubectl never"**
> 
> Om du måste använda `kubectl apply` - gör det inte. Gör en ändring i Git istället.

### 📋 CHECKLIST FÖR ÄNDRINGAR

- [ ] Ändring gjord i Git repository?
- [ ] PR skapad och granskad?
- [ ] FluxCD synkroniserar korrekt?
- [ ] Ingen `kubectl apply` använd?
- [ ] Kluster-state matchar Git-state?

**VIKTIGT:** Dessa regler gäller ALLTID, även i utvecklingsmiljöer och tester!

### 💡 MINNESREGEL

> **"Git first, kubectl never"**
> 
> Om du måste använda `kubectl apply` - gör det inte. Gör en ändring i Git istället.

### 📋 CHECKLIST FÖR ÄNDRINGAR

- [ ] Ändring gjord i Git repository?
- [ ] PR skapad och granskad?
- [ ] FluxCD synkroniserar korrekt?
- [ ] Ingen `kubectl apply` använd?
- [ ] Kluster-state matchar Git-state?

**VIKTIGT:** Dessa regler gäller ALLTID, även i utvecklingsmiljöer och tester!

---

## ⚠️ ABSOLUT SLUTREGEL: INGA UNDTAG

**kubectl apply är FÖRBJUDET i ALLA FluxCD-kluster, ALLTID, utan undantag.**
**Detta inkluderar: dev, staging, production, testmiljöer, lokala kluster, ALLT.**

**Helm Values Configuration Process:**

1. **Documentation First Approach:**
   - Always fetch official documentation for the specific chart version before writing values
   - Search Artifact Hub for the exact chart version documentation
   - Check the chart's GitHub repository for official docs and examples
   - Verify the exact version being used in the deployment

2. **Validation Requirements:**
   - Check for available validation schemas before committing YAML files
   - Use Helm's built-in validation tools (`helm lint`, `helm template`)
   - Validate against JSON schema if available for the chart
   - Ensure YAML syntax correctness with linters

3. **Standard Workflow:**
   - Identify chart name and exact version
   - Fetch official documentation from Artifact Hub/GitHub
   - Check for available schemas and validation tools
   - Write values according to official documentation
   - Validate against schema (if available)
   - Test with `helm template` or `helm lint`
   - Commit validated YAML files

4. **Quality Assurance:**
   - Never commit unvalidated Helm values
   - Use `helm dependency update` when adding new charts
   - Test rendering with `helm template --dry-run` before deployment
   - Document any custom values with comments referencing official docs

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

Use the `<tab>` key to cycle through primary agents during a session.

### Manual Agent Selection

Use commands to switch to specific agents:

- `/fullstack` - Switch to Fullstack agent
- `/frontend` - Switch to Frontend agent
- `/backend` - Switch to Backend agent
- `/devops` - Switch to DevOps agent
- `/app` - Switch to App agent
- `/quality` - Switch to Quality agent for testing and PR management

### Using Subagents

Mention subagents with `@` symbol:

```
@security review this authentication implementation
@quality run tests and create PR for these changes
```

## Routing Rules

The fullstack agent automatically routes tasks based on file patterns:

- `/apps/frontend` or `.tsx` files → frontend
- `/apps/app` or Expo/React Native → app
- `/infra`, `/k8s`, FluxCD, Helm → devops
- `/services`, Koa routers → backend

## Configuration

All agents are configured in `opencode.json` with:

- Specialized prompts and temperature settings
- Appropriate tool permissions
- Model optimizations for their specific tasks

## Environment Setup

Copy `.env.example` to `.env` and configure:

```
BERGET_API_KEY=your_api_key_here
```

## Workflow

All agents follow these principles:

- **NEVER work directly in main branch** - ALWAYS use pull requests
- **NEVER use 'git add .'** - ALWAYS add specific files with 'git add path/to/file'
- **ALWAYS clean up test files, documentation files, and temporary artifacts before committing**
- **ALWAYS ensure git history maintains production quality** - no test commits, no debugging code
- **ALWAYS create descriptive commit messages following project conventions**
- **ALWAYS run tests and build before creating PR**
- Follow branch strategy and commit conventions
- Create PRs for new functionality
- Address reviewer feedback promptly
