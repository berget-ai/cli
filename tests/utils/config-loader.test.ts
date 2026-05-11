import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConfigLoader,
  getAllAgentConfigs,
  getModelConfig,
  getProviderModels,
} from '../../src/utils/config-loader';

// Mock fs module
const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('fs', () => mockFs);

describe('ConfigLoader', () => {
  const testConfigPath = '/tmp/test-opencode.json';
  let configLoader: ConfigLoader;

  beforeEach(() => {
    // Reset mocks and clear singleton
    vi.clearAllMocks();
    ConfigLoader.clearInstance();

    // Create new instance for each test using getInstance
    configLoader = ConfigLoader.getInstance(testConfigPath);
  });

  afterEach(() => {
    vi.clearAllMocks();
    ConfigLoader.clearInstance();
  });

  describe('when config file does not exist', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
    });

    describe('getModelConfig', () => {
      it('should return default values when config file does not exist', () => {
        const modelConfig = configLoader.getModelConfig();

        expect(modelConfig).toEqual({
          primary: 'berget/glm-4.7',
          small: 'berget/gpt-oss',
        });
      });

      it('should return default values when using convenience function', () => {
        const modelConfig = getModelConfig(testConfigPath);

        expect(modelConfig).toEqual({
          primary: 'berget/glm-4.7',
          small: 'berget/gpt-oss',
        });
      });
    });

    describe('getProviderModels', () => {
      it('should return default provider models when config file does not exist', () => {
        const models = configLoader.getProviderModels();

        expect(models).toEqual({
          'glm-4.7': {
            limit: { context: 90_000, output: 4000 },
            name: 'GLM-4.7',
          },
          'gpt-oss': {
            limit: { context: 128_000, output: 4000 },
            modalities: {
              input: ['text', 'image'],
              output: ['text'],
            },
            name: 'GPT-OSS',
          },
          'llama-8b': {
            limit: { context: 128_000, output: 4000 },
            name: 'llama-3.1-8b',
          },
        });
      });

      it('should return default provider models when using convenience function', () => {
        const models = getProviderModels(testConfigPath);

        expect(models).toEqual({
          'glm-4.7': {
            limit: { context: 90_000, output: 4000 },
            name: 'GLM-4.7',
          },
          'gpt-oss': {
            limit: { context: 128_000, output: 4000 },
            modalities: {
              input: ['text', 'image'],
              output: ['text'],
            },
            name: 'GPT-OSS',
          },
          'llama-8b': {
            limit: { context: 128_000, output: 4000 },
            name: 'llama-3.1-8b',
          },
        });
      });
    });

    describe('getAllAgentConfigs', () => {
      it('should return empty object when config file does not exist', () => {
        const agents = configLoader.getAllAgentConfigs();

        expect(agents).toEqual({});
      });

      it('should return empty object when using convenience function', () => {
        const agents = getAllAgentConfigs(testConfigPath);

        expect(agents).toEqual({});
      });
    });

    describe('getAgentConfig', () => {
      it('should return null when config file does not exist', () => {
        const agent = configLoader.getAgentConfig('fullstack');

        expect(agent).toBeNull();
      });
    });
  });

  describe('when config file exists', () => {
    const mockConfig = {
      agent: {
        fullstack: {
          mode: 'primary' as const,
          model: 'custom-agent-model',
          permission: {
            bash: 'allow' as const,
            edit: 'allow' as const,
            webfetch: 'allow' as const,
          },
          temperature: 0.5,
        },
      },
      command: {
        test: {
          description: 'Test command',
        },
      },
      model: 'custom-model',
      provider: {
        berget: {
          models: {
            'custom-model': {
              limit: { context: 160_000, output: 8000 },
              name: 'Custom Model',
            },
          },
        },
      },
      small_model: 'custom-small-model',
      watcher: {
        ignore: ['custom-ignore'],
      },
    };

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
    });

    describe('getModelConfig', () => {
      it('should return values from config file', () => {
        const modelConfig = configLoader.getModelConfig();

        expect(modelConfig).toEqual({
          primary: 'custom-model',
          small: 'custom-small-model',
        });
      });
    });

    describe('getProviderModels', () => {
      it('should return models from config file', () => {
        const models = configLoader.getProviderModels();

        expect(models).toEqual({
          'custom-model': {
            limit: { context: 160_000, output: 8000 },
            name: 'Custom Model',
          },
        });
      });
    });

    describe('getAllAgentConfigs', () => {
      it('should return agents from config file', () => {
        const agents = configLoader.getAllAgentConfigs();

        expect(agents).toEqual(mockConfig.agent);
      });
    });

    describe('getAgentConfig', () => {
      it('should return specific agent from config file', () => {
        const agent = configLoader.getAgentConfig('fullstack');

        expect(agent).toEqual(mockConfig.agent.fullstack);
      });

      it('should return null for non-existent agent', () => {
        const agent = configLoader.getAgentConfig('nonexistent');

        expect(agent).toBeNull();
      });
    });
  });

  describe('when config file is invalid JSON', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json {');
    });

    it('should fall back to defaults for getModelConfig', () => {
      const modelConfig = configLoader.getModelConfig();

      expect(modelConfig).toEqual({
        primary: 'berget/glm-4.7',
        small: 'berget/gpt-oss',
      });
    });

    it('should fall back to defaults for getProviderModels', () => {
      const models = configLoader.getProviderModels();

      expect(models).toEqual({
        'glm-4.7': {
          limit: { context: 90_000, output: 4000 },
          name: 'GLM-4.7',
        },
        'gpt-oss': {
          limit: { context: 128_000, output: 4000 },
          modalities: {
            input: ['text', 'image'],
            output: ['text'],
          },
          name: 'GPT-OSS',
        },
        'llama-8b': {
          limit: { context: 128_000, output: 4000 },
          name: 'llama-3.1-8b',
        },
      });
    });

    it('should fall back to defaults for getAllAgentConfigs', () => {
      const agents = configLoader.getAllAgentConfigs();

      expect(agents).toEqual({});
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance for same path', () => {
      ConfigLoader.clearInstance();
      const loader1 = ConfigLoader.getInstance(testConfigPath);
      const loader2 = ConfigLoader.getInstance(testConfigPath);

      expect(loader1).toBe(loader2);
    });

    it('should return the same instance even for different paths (true singleton)', () => {
      ConfigLoader.clearInstance();
      const loader1 = ConfigLoader.getInstance('/path1/config.json');
      const loader2 = ConfigLoader.getInstance('/path2/config.json');

      // ConfigLoader is a true singleton - it returns the same instance regardless of path
      expect(loader1).toBe(loader2);
    });
  });

  describe('init scenario regression tests', () => {
    it('should handle missing config file during init scenario', () => {
      // This test specifically verifies the fix for the init issue
      mockFs.existsSync.mockReturnValue(false);

      // All these methods should work without throwing errors
      expect(() => configLoader.getModelConfig()).not.toThrow();
      expect(() => configLoader.getProviderModels()).not.toThrow();
      expect(() => configLoader.getAllAgentConfigs()).not.toThrow();
      expect(() => configLoader.getAgentConfig('fullstack')).not.toThrow();

      // And return sensible defaults
      expect(configLoader.getModelConfig()).toEqual({
        primary: 'berget/glm-4.7',
        small: 'berget/gpt-oss',
      });
      expect(configLoader.getAllAgentConfigs()).toEqual({});
      expect(configLoader.getAgentConfig('fullstack')).toBeNull();
    });

    it('should work with convenience functions during init scenario', () => {
      // This test verifies that convenience functions also work during init
      mockFs.existsSync.mockReturnValue(false);

      expect(() => getModelConfig(testConfigPath)).not.toThrow();
      expect(() => getProviderModels(testConfigPath)).not.toThrow();
      expect(() => getAllAgentConfigs(testConfigPath)).not.toThrow();

      expect(getModelConfig(testConfigPath)).toEqual({
        primary: 'berget/glm-4.7',
        small: 'berget/gpt-oss',
      });
      expect(getAllAgentConfigs(testConfigPath)).toEqual({});
    });
  });
});
