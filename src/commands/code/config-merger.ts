/**
 * Configuration merge logic for OpenCode
 * Handles AI-powered and fallback merging of configurations
 */

import chalk from 'chalk'
import { createAuthenticatedClient } from '../../client'
import { getModelConfig } from '../../utils/config-loader'
import type { MergeableConfig } from './types'

/**
 * Merge opencode configurations using chat completions API
 */
export async function mergeConfigurations(
  currentConfig: MergeableConfig,
  latestConfig: MergeableConfig
): Promise<MergeableConfig> {
  try {
    const client = createAuthenticatedClient()
    const modelConfig = getModelConfig()

    console.log(chalk.blue('🤖 Using AI to merge configurations...'))

    const mergePrompt = `You are a configuration merge specialist. Merge these two OpenCode configurations:

CURRENT CONFIG (user's customizations):
${JSON.stringify(currentConfig, null, 2)}

LATEST CONFIG (new updates):
${JSON.stringify(latestConfig, null, 2)}

Merge rules:
1. Preserve ALL user customizations from current config
2. Add ALL new features and improvements from latest config  
3. For conflicts, prefer user's customizations but add new latest features
4. Maintain valid JSON structure
5. Keep the merged configuration complete and functional

Return ONLY the merged JSON configuration, no explanations.`

    const response = await client.POST('/v1/chat/completions', {
      body: {
        model: modelConfig.primary,
        messages: [
          {
            role: 'user',
            content: mergePrompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      },
    })

    if (response.error) {
      console.warn(chalk.yellow('⚠️  AI merge failed, using fallback merge'))
      return fallbackMerge(currentConfig, latestConfig)
    }

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) {
      console.warn(chalk.yellow('⚠️  No AI response, using fallback merge'))
      return fallbackMerge(currentConfig, latestConfig)
    }

    try {
      const mergedConfig = JSON.parse(content.trim())
      console.log(chalk.green('✓ AI merge completed successfully'))
      return mergedConfig
    } catch {
      console.warn(
        chalk.yellow('⚠️  AI response invalid, using fallback merge')
      )
      return fallbackMerge(currentConfig, latestConfig)
    }
  } catch {
    console.warn(chalk.yellow('⚠️  AI merge unavailable, using fallback merge'))
    return fallbackMerge(currentConfig, latestConfig)
  }
}

/**
 * Fallback merge logic when AI merge is unavailable
 */
export function fallbackMerge(
  currentConfig: MergeableConfig,
  latestConfig: MergeableConfig
): MergeableConfig {
  console.log(chalk.blue('🔀 Using fallback merge logic...'))

  const merged: MergeableConfig = { ...latestConfig }

  // Preserve user customizations
  if (currentConfig.theme && currentConfig.theme !== latestConfig.theme) {
    merged.theme = currentConfig.theme
  }

  if (currentConfig.share && currentConfig.share !== latestConfig.share) {
    merged.share = currentConfig.share
  }

  // Merge custom agents while preserving new ones
  if (currentConfig.agent && latestConfig.agent) {
    merged.agent = { ...latestConfig.agent }

    // Add any custom agents from current config
    Object.keys(currentConfig.agent).forEach((agentName) => {
      if (!latestConfig.agent![agentName]) {
        merged.agent![agentName] = currentConfig.agent![agentName]
        console.log(chalk.cyan(`  • Preserved custom agent: ${agentName}`))
      }
    })
  }

  // Merge custom commands while preserving new ones
  if (currentConfig.command && latestConfig.command) {
    merged.command = { ...latestConfig.command }

    Object.keys(currentConfig.command).forEach((commandName) => {
      if (!latestConfig.command![commandName]) {
        merged.command![commandName] = currentConfig.command![commandName]
        console.log(chalk.cyan(`  • Preserved custom command: ${commandName}`))
      }
    })
  }

  // Preserve custom provider settings if user has modified them
  if (currentConfig.provider && latestConfig.provider) {
    merged.provider = { ...latestConfig.provider }

    // Deep merge provider settings
    Object.keys(currentConfig.provider).forEach((providerName) => {
      if (merged.provider![providerName]) {
        merged.provider![providerName] = {
          ...merged.provider![providerName],
          ...currentConfig.provider![providerName],
        }
      } else {
        merged.provider![providerName] = currentConfig.provider![providerName]
      }
    })
  }

  return merged
}
