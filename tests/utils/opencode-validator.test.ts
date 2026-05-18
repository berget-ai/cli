import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { fixOpenCodeConfig, validateOpenCodeConfig } from '../../src/utils/opencode-validator.js';

describe('OpenCode Validator', () => {
  it('should validate a correct OpenCode configuration', () => {
    const validConfig = {
      $schema: 'https://opencode.ai/config.json',
      agent: {
        test: {
          model: 'gpt-4',
          permission: {
            bash: 'allow',
            edit: 'allow',
            webfetch: 'allow',
          },
          prompt: 'Test agent',
          temperature: 0.7,
        },
      },
      model: 'gpt-4',
      username: 'test-user',
    };

    const result = validateOpenCodeConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should reject invalid configuration', () => {
    const invalidConfig = {
      agent: {
        test: {
          model: 'gpt-4',
          permission: {
            bash: 'allow',
            edit: 'invalid', // Should be enum value
            webfetch: 'allow',
          },
          prompt: 'Test agent',
          temperature: 'high', // Should be number
        },
      },
      model: 'gpt-4',
      username: 123, // Should be string
    };

    const result = validateOpenCodeConfig(invalidConfig);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('should fix common configuration issues', () => {
    const configWithIssues = {
      maxTokens: 4000, // Invalid property
      model: 'gpt-4',
      provider: {
        berget: {
          models: {
            'test-model': {
              contextWindow: 8000, // Should be moved to limit.context
              maxTokens: 4000, // Should be moved to limit.context
              name: 'Test Model',
            },
          },
        },
      },
      tools: {
        compact: { threshold: 80_000 }, // Should be boolean
      },
      username: 'test-user',
    };

    const fixed = fixOpenCodeConfig(configWithIssues);

    // tools.compact should be boolean
    expect(typeof fixed.tools.compact).toBe('boolean');

    // maxTokens should be removed
    expect(fixed.maxTokens).toBeUndefined();

    // maxTokens and contextWindow should be moved to limit.context
    expect(fixed.provider.berget.models['test-model'].limit).toBeDefined();
    expect(fixed.provider.berget.models['test-model'].limit.context).toBe(8000);
    expect(fixed.provider.berget.models['test-model'].maxTokens).toBeUndefined();
    expect(fixed.provider.berget.models['test-model'].contextWindow).toBeUndefined();
  });

  it('should validate the current opencode.json file', () => {
    let currentConfig;
    try {
      currentConfig = JSON.parse(readFileSync('opencode.json', 'utf8'));
    } catch (error) {
      // Skip when opencode.json is not present (e.g. in CI or clean checkouts)
      console.log('Skipping: opencode.json not found:', error);
      return;
    }

    // Apply fixes to handle common issues
    const fixedConfig = fixOpenCodeConfig(currentConfig);

    // Validate the fixed config
    const result = validateOpenCodeConfig(fixedConfig);

    // The fixed config should be valid according to the JSON Schema
    expect(result.valid).toBe(true);

    if (!result.valid) {
      console.log('Fixed opencode.json validation errors:');
      if (result.errors) for (const error of result.errors) console.log(`  - ${error}`);
    }
  });
});
