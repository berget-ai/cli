export interface Agent {
  config: AgentConfig;
  systemPrompt: string;
}

export interface AgentConfig {
  description: string;
  mode?: 'primary' | 'subagent';
  name: string;
  permission?: {
    bash?: string;
    edit?: string;
    webfetch?: string;
  };
  temperature?: number;
  top_p?: number;
}
