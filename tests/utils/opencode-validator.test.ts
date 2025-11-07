import { describe, it, expect } from 'vitest'
import {
  validateOpenCodeConfig,
  fixOpenCodeConfig,
} from '../../src/utils/opencode-validator'
import { readFileSync } from 'fs'

describe('OpenCode Validator', () => {
  it('should validate a correct OpenCode configuration', () => {
    const validConfig = {
      $schema: 'https://opencode.ai/config.json',
      username: 'test-user',
      model: 'gpt-4',
      agent: {
        test: {
          model: 'gpt-4',
          temperature: 0.7,
          prompt: 'Test agent',
          permission: {
            edit: 'allow',
            bash: 'allow',
            webfetch: 'allow',
          },
        },
      },
    }

    const result = validateOpenCodeConfig(validConfig)
    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('should reject invalid configuration', () => {
    const invalidConfig = {
      username: 123, // Should be string
      model: 'gpt-4',
      agent: {
        test: {
          model: 'gpt-4',
          temperature: 'high', // Should be number
          prompt: 'Test agent',
          permission: {
            edit: 'invalid', // Should be enum value
            bash: 'allow',
            webfetch: 'allow',
          },
        },
      },
    }

    const result = validateOpenCodeConfig(invalidConfig)
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('should fix common configuration issues', () => {
    const configWithIssues = {
      username: 'test-user',
      model: 'gpt-4',
      tools: {
        compact: { threshold: 80000 }, // Should be boolean
      },
      maxTokens: 4000, // Invalid property
      provider: {
        berget: {
          models: {
            'test-model': {
              name: 'Test Model',
              maxTokens: 4000, // Should be moved to limit.context
              contextWindow: 8000, // Should be moved to limit.context
            },
          },
        },
      },
    }

    const fixed = fixOpenCodeConfig(configWithIssues)

    // tools.compact should be boolean
    expect(typeof fixed.tools.compact).toBe('boolean')

    // maxTokens should be removed
    expect(fixed.maxTokens).toBeUndefined()

    // maxTokens and contextWindow should be moved to limit.context
    expect(fixed.provider.berget.models['test-model'].limit).toBeDefined()
    expect(fixed.provider.berget.models['test-model'].limit.context).toBe(8000)
    expect(fixed.provider.berget.models['test-model'].maxTokens).toBeUndefined()
    expect(
      fixed.provider.berget.models['test-model'].contextWindow,
    ).toBeUndefined()
  })

  it('should validate the current opencode.json file', () => {
    try {
      const currentConfig = JSON.parse(readFileSync('opencode.json', 'utf8'))

      // Apply fixes to handle common issues
      const fixedConfig = fixOpenCodeConfig(currentConfig)

      // Validate the fixed config
      const result = validateOpenCodeConfig(fixedConfig)

      // The fixed config should be valid according to the JSON Schema
      expect(result.valid).toBe(true)

      if (!result.valid) {
        console.log('Fixed opencode.json validation errors:')
        result.errors?.forEach((err) => console.log(`  - ${err}`))
      }
    } catch (error) {
      // If we can't read the file, that's ok for this test
      console.log('Could not read opencode.json for testing:', error)
      expect.fail('Should be able to read opencode.json')
    }
  })
})
