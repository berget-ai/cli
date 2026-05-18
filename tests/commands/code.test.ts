import { Command } from 'commander';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerCodeCommands } from '../../src/commands/code.js';

describe('Code Commands', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    registerCodeCommands(program);
  });

  describe('code init command', () => {
    it('should register init command with correct description', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code');
      const initCommand = codeCommand?.commands.find((cmd) => cmd.name() === 'init');

      expect(initCommand).toBeDefined();
      expect(initCommand?.description()).toBe('Interactive setup for Berget AI coding tools');
    });

    it('should not have any other subcommands', () => {
      const codeCommand = program.commands.find((cmd) => cmd.name() === 'code');
      expect(codeCommand?.commands).toHaveLength(1);
      expect(codeCommand?.commands[0]?.name()).toBe('init');
    });
  });
});
