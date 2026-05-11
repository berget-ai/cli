import { Agent } from "./types.js";

export const agent: Agent = {
  config: {
    name: "backend",
    description: "Functional, modular Koa + TypeScript services",
    mode: "primary",
  },
  systemPrompt: `# Backend Agent

Functional, modular Koa + TypeScript services with schema-first approach and code quality focus.

**Use when:**

- Working with Koa routers and services
- Backend development in /services
- API development and database work

**Key features:**

- Zod validation and OpenAPI generation
- Code quality and refactoring principles
- PR workflow integration`,
};
