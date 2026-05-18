import type { CommandRunner } from './ports/command-runner.js';
import type { Prompter } from './ports/prompter.js';

export interface ToolCheckResult {
  description: string;
  docsUrl: string;
  installCommand: string;
  installed: boolean;
  name: string;
}

interface ToolInfo {
  description: string;
  docsUrl: string;
  installCommand: string;
  name: string;
}

const TOOL_INFO: Record<string, Omit<ToolInfo, 'installCommand'>> = {
  opencode: {
    description:
      'OpenCode is an open source AI coding agent. Install it to start coding with AI in your terminal.',
    docsUrl: 'https://opencode.ai/docs',
    name: 'OpenCode',
  },
  pi: {
    description:
      'Pi is a minimal terminal coding harness. Install it to start coding with AI in your terminal.',
    docsUrl: 'https://pi.dev/docs/latest',
    name: 'Pi',
  },
};

export async function checkTool(
  commands: CommandRunner,
  tool: 'opencode' | 'pi',
): Promise<ToolCheckResult> {
  const installed = await commands.checkInstalled(tool);
  const info = TOOL_INFO[tool];

  return {
    description: info.description,
    docsUrl: info.docsUrl,
    installCommand: getInstallCommand(tool, process.platform),
    installed,
    name: info.name,
  };
}

export async function promptForMissingTool(
  prompter: Prompter,
  tool: ToolCheckResult,
): Promise<'continue' | 'exit' | 'retry'> {
  const message = `${tool.description}\n\nInstall:\n  ${tool.installCommand}\n\nDocs: ${tool.docsUrl}`;
  prompter.note(message, `${tool.name} not installed`);

  const action = await prompter.select<'continue' | 'exit' | 'retry'>({
    message: 'What would you like to do?',
    options: [
      { label: "I've installed it — check again", value: 'retry' },
      { label: 'Continue without installing (auth only)', value: 'continue' },
      { label: 'Exit', value: 'exit' },
    ],
  });

  return action;
}

function getInstallCommand(tool: 'opencode' | 'pi', platform: string): string {
  if (platform === 'win32') {
    return tool === 'opencode'
      ? 'npm install -g opencode-ai'
      : 'npm install -g @earendil-works/pi-coding-agent';
  }
  return tool === 'opencode'
    ? 'curl -fsSL https://opencode.ai/install | bash'
    : 'curl -fsSL https://pi.dev/install.sh | sh';
}
