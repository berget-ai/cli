export interface AgentConfig {
  name: string
  description: string
  mode?: 'primary' | 'subagent'
  temperature?: number
  top_p?: number
  permission?: {
    edit?: string
    bash?: string
    webfetch?: string
  }
}

export interface Agent {
  config: AgentConfig
  systemPrompt: string
}
