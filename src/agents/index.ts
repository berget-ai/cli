import type { Agent } from './types.js';

import { agent as app } from './app.js';
import { agent as backend } from './backend.js';
import { agent as devops } from './devops.js';
import { agent as frontend } from './frontend.js';
import { agent as fullstack } from './fullstack.js';
import { agent as quality } from './quality.js';
import { agent as security } from './security.js';

const agents: Record<string, Agent> = {
  app,
  backend,
  devops,
  frontend,
  fullstack,
  quality,
  security,
};

export { agents };

export function getAgent(name: string): Agent | undefined {
  return agents[name];
}

export function getAllAgents(): Agent[] {
  return Object.values(agents);
}

export function toAgentTemplate(agent: Agent): {
  content: string;
  description: string;
  name: string;
} {
  return {
    content: agent.systemPrompt,
    description: agent.config.description,
    name: agent.config.name,
  };
}

export function toMarkdown(agent: Agent): string {
  const { config, systemPrompt } = agent;
  let frontmatter = `---\nname: ${config.name}\ndescription: ${config.description}\n`;

  if (config.mode) {
    frontmatter += `mode: ${config.mode}\n`;
  }

  if (config.temperature) {
    frontmatter += `temperature: ${config.temperature}\n`;
  }

  if (config.top_p) {
    frontmatter += `top_p: ${config.top_p}\n`;
  }

  if (config.permission) {
    frontmatter += `permission:\n`;
    for (const [key, value] of Object.entries(config.permission)) {
      frontmatter += `  ${key}: ${value}\n`;
    }
  }

  return `${frontmatter}---\n\n${systemPrompt}`;
}

export function toPiPrompt(agent: Agent): string {
  return agent.systemPrompt;
}

export { type Agent, type AgentConfig } from './types.js';
