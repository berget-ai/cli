import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFileSync } from 'fs'
import { join } from 'path'
import { dirname } from 'path'

// Load the official OpenCode JSON Schema
const __dirname = dirname(__filename)
const schemaPath = join(__dirname, '..', 'schemas', 'opencode-schema.json')

let ajv: Ajv
let openCodeSchema: any
let validateFunction: any

try {
  const schemaContent = readFileSync(schemaPath, 'utf-8')
  openCodeSchema = JSON.parse(schemaContent)
  
  // Initialize AJV with formats and options
  ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false,
    allowUnionTypes: true,
    removeAdditional: false,
  })
  
  // Add JSON Schema formats
  addFormats(ajv)
  
  // Compile the schema
  validateFunction = ajv.compile(openCodeSchema)
} catch (error) {
  console.error('Failed to load OpenCode schema:', error)
  throw new Error('Could not initialize OpenCode validator')
}

export type OpenCodeConfig = any

/**
 * Validate OpenCode configuration against the official JSON Schema
 */
export function validateOpenCodeConfig(config: any): { valid: boolean; errors?: string[] } {
  try {
    if (!validateFunction) {
      return { valid: false, errors: ['Schema validator not initialized'] }
    }

    const isValid = validateFunction(config)
    
    if (isValid) {
      return { valid: true }
    } else {
      const errors = validateFunction.errors?.map((err: any) => {
        const path = err.instancePath || err.schemaPath || 'root'
        const message = err.message || 'Unknown error'
        return `${path}: ${message}`
      }) || ['Unknown validation error']
      
      return { valid: false, errors }
    }
  } catch (error) {
    console.error('Validation error:', error)
    return { valid: false, errors: ['Validation process failed'] }
  }
}

/**
 * Fix common OpenCode configuration issues
 */
export function fixOpenCodeConfig(config: any): OpenCodeConfig {
  const fixed = { ...config }

  // Fix tools.compact - should be boolean, not object
  if (fixed.tools && typeof fixed.tools.compact === 'object') {
    console.warn('⚠️  Converting tools.compact from object to boolean')
    // If it has properties, assume it should be enabled
    fixed.tools.compact = true
  }

  // Remove invalid properties
  const invalidProps = ['maxTokens', 'contextWindow']
  invalidProps.forEach(prop => {
    if (fixed[prop] !== undefined) {
      console.warn(`⚠️  Removing invalid property: ${prop}`)
      delete fixed[prop]
    }
  })

  // Fix provider models with invalid properties
  if (fixed.provider) {
    Object.values(fixed.provider).forEach((provider: any) => {
      if (provider?.models) {
        Object.values(provider.models).forEach((model: any) => {
          if (model && typeof model === 'object') {
            // Move maxTokens/contextWindow to proper structure if needed
            if (model.maxTokens || model.contextWindow) {
              if (!model.limit) model.limit = {}
              
              // Use the larger of maxTokens/contextWindow for context
              const contextValues = [model.maxTokens, model.contextWindow].filter(Boolean)
              if (contextValues.length > 0) {
                const newContext = Math.max(...contextValues)
                if (!model.limit.context || newContext > model.limit.context) {
                  model.limit.context = newContext
                }
              }
              
              // Set a reasonable default for output if not present
              // (typically 1/4 to 1/8 of context window)
              if (!model.limit.output && model.limit.context) {
                model.limit.output = Math.floor(model.limit.context / 4)
              }
              
              delete model.maxTokens
              delete model.contextWindow
              console.warn('⚠️  Moved maxTokens/contextWindow to limit.context/output')
            }
          }
        })
      }
    })
  }

  return fixed
}