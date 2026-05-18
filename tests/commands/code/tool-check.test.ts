import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandRunner } from '../../../src/commands/code/ports/command-runner.js';
import type { Prompter } from '../../../src/commands/code/ports/prompter.js';

describe('checkTool', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  const createMockRunner = (installed: boolean): CommandRunner => ({
    checkInstalled: vi.fn().mockResolvedValue(installed),
    run: vi.fn(),
  });

  it('returns installed=true when tool is found', async () => {
    const { checkTool } = await import('../../../src/commands/code/tool-check.js');
    const runner = createMockRunner(true);
    const result = await checkTool(runner, 'opencode');

    expect(result.installed).toBe(true);
    expect(result.name).toBe('OpenCode');
    expect(runner.checkInstalled).toHaveBeenCalledWith('opencode');
  });

  it('returns installed=false with correct install command when tool is missing', async () => {
    const { checkTool } = await import('../../../src/commands/code/tool-check.js');
    const runner = createMockRunner(false);
    const result = await checkTool(runner, 'opencode');

    expect(result.installed).toBe(false);
    expect(result.name).toBe('OpenCode');
    expect(result.docsUrl).toBe('https://opencode.ai/docs');
    expect(result.installCommand).toBeDefined();
  });

  it('returns npm install command on Windows', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const { checkTool } = await import('../../../src/commands/code/tool-check.js');
    const runner = createMockRunner(false);
    const result = await checkTool(runner, 'opencode');

    expect(result.installCommand).toBe('npm install -g opencode-ai');

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns curl install command on macOS/Linux', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const { checkTool } = await import('../../../src/commands/code/tool-check.js');
    const runner = createMockRunner(false);
    const result = await checkTool(runner, 'opencode');

    expect(result.installCommand).toBe('curl -fsSL https://opencode.ai/install | bash');

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('returns correct docsUrl for opencode', async () => {
    const { checkTool } = await import('../../../src/commands/code/tool-check.js');
    const runner = createMockRunner(false);
    const result = await checkTool(runner, 'opencode');

    expect(result.docsUrl).toBe('https://opencode.ai/docs');
  });

  it('returns correct docsUrl for pi', async () => {
    const { checkTool } = await import('../../../src/commands/code/tool-check.js');
    const runner = createMockRunner(false);
    const result = await checkTool(runner, 'pi');

    expect(result.docsUrl).toBe('https://pi.dev/docs/latest');
  });

  it('returns correct name and description for pi', async () => {
    const { checkTool } = await import('../../../src/commands/code/tool-check.js');
    const runner = createMockRunner(false);
    const result = await checkTool(runner, 'pi');

    expect(result.name).toBe('Pi');
    expect(result.description).toContain('terminal coding harness');
  });

  it('returns correct name and description for opencode', async () => {
    const { checkTool } = await import('../../../src/commands/code/tool-check.js');
    const runner = createMockRunner(false);
    const result = await checkTool(runner, 'opencode');

    expect(result.name).toBe('OpenCode');
    expect(result.description).toContain('open source AI coding agent');
  });
});

describe('promptForMissingTool', () => {
  const createMockPrompter = (selectValue: string): Prompter => ({
    cancel: vi.fn(),
    confirm: vi.fn(),
    intro: vi.fn(),
    log: vi.fn(),
    multiselect: vi.fn(),
    note: vi.fn(),
    outro: vi.fn(),
    select: vi.fn().mockResolvedValue(selectValue),
    spinner: vi.fn().mockReturnValue({ start: vi.fn(), stop: vi.fn() }),
    tasks: vi.fn(),
    text: vi.fn(),
  });

  const mockToolCheck = {
    description: 'Test tool description',
    docsUrl: 'https://example.com/docs',
    installCommand: 'curl -fsSL https://example.com/install | sh',
    installed: false,
    name: 'TestTool',
  };

  it('returns retry when user selects "check again"', async () => {
    const { promptForMissingTool } = await import('../../../src/commands/code/tool-check.js');
    const prompter = createMockPrompter('retry');
    const result = await promptForMissingTool(prompter, mockToolCheck);

    expect(result).toBe('retry');
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining('curl -fsSL https://example.com/install | sh'),
      'TestTool not installed',
    );
  });

  it('returns continue when user selects "continue without"', async () => {
    const { promptForMissingTool } = await import('../../../src/commands/code/tool-check.js');
    const prompter = createMockPrompter('continue');
    const result = await promptForMissingTool(prompter, mockToolCheck);

    expect(result).toBe('continue');
  });

  it('returns exit when user selects "exit"', async () => {
    const { promptForMissingTool } = await import('../../../src/commands/code/tool-check.js');
    const prompter = createMockPrompter('exit');
    const result = await promptForMissingTool(prompter, mockToolCheck);

    expect(result).toBe('exit');
  });

  it('displays install command and docsUrl in note', async () => {
    const { promptForMissingTool } = await import('../../../src/commands/code/tool-check.js');
    const prompter = createMockPrompter('retry');
    await promptForMissingTool(prompter, mockToolCheck);

    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining(mockToolCheck.installCommand),
      'TestTool not installed',
    );
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining(mockToolCheck.docsUrl),
      'TestTool not installed',
    );
    expect(prompter.note).toHaveBeenCalledWith(
      expect.stringContaining(mockToolCheck.description),
      'TestTool not installed',
    );
  });

  it('presents correct options to user', async () => {
    const { promptForMissingTool } = await import('../../../src/commands/code/tool-check.js');
    const prompter = createMockPrompter('retry');
    await promptForMissingTool(prompter, mockToolCheck);

    expect(prompter.select).toHaveBeenCalledWith({
      message: 'What would you like to do?',
      options: [
        { label: "I've installed it — check again", value: 'retry' },
        { label: 'Continue without installing (auth only)', value: 'continue' },
        { label: 'Exit', value: 'exit' },
      ],
    });
  });
});
