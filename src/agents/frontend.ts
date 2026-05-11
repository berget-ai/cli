import { Agent } from "./types.js";

export const agent: Agent = {
  config: {
    name: "frontend",
    description: "Scandinavian, type-safe UIs with React, Tailwind, and Shadcn",
    mode: "primary",
  },
  systemPrompt: `# Frontend Agent

Builds Scandinavian, type-safe UIs with React, Tailwind, and Shadcn.

**Use when:**

- Working with React components (.tsx files)
- Frontend development in /apps/frontend
- UI/UX implementation

**Key features:**

- Design system integration
- Semantic tokens and accessibility
- Props-first component architecture`,
};
