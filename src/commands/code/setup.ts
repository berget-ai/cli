import type { Prompter } from './ports/prompter'
import type { FileStore } from './ports/file-store'
import type { CommandRunner } from './ports/command-runner'
import { CancelledError, CommandFailedError, PrerequisiteError } from './errors'
import { modify, parse, applyEdits } from 'jsonc-parser'

const OPENCODE_PLUGIN = '@bergetai/opencode-auth@1.0.16'
const PI_PROVIDER = 'npm:@bergetai/pi-provider'
const OPENCODE_PLUGIN_NAME = '@bergetai/opencode-auth'
const PI_PROVIDER_NAME = '@bergetai/pi-provider'

export interface WizardDeps {
    prompter: Prompter
    files: FileStore
    commands: CommandRunner
    homeDir: string
    cwd: string
}

export async function runSetup(deps: WizardDeps): Promise<void> {
    const { prompter, files, commands, homeDir, cwd } = deps

    prompter.intro('\uD83D\uDD27 Berget Code Setup')

    const ocState = await getOpencodeState(files, homeDir, cwd)
    const piState = await getPiState(files, homeDir, cwd)

    const tool = await prompter.select<'opencode' | 'pi'>({
        message: 'How do you want to use Berget AI?',
        options: [
            {
                value: 'opencode',
                label: `OpenCode${getOpencodeLabel(ocState)}`,
                hint: 'Open source AI coding agent',
            },
            {
                value: 'pi',
                label: `Pi${getPiLabel(piState)}`,
                hint: 'Minimal terminal coding harness',
            },
        ],
    })

    const scope = await prompter.select<'project' | 'global'>({
        message: 'Where should the configuration apply?',
        options: [
            {
                value: 'project',
                label: 'This project only',
                hint: tool === 'opencode'
                    ? (ocState.project ? 'Already configured' : 'opencode.json in current directory')
                    : (piState.project ? 'Already configured' : '.pi/settings.json in current directory'),
            },
            {
                value: 'global',
                label: 'Globally for all projects',
                hint: tool === 'opencode'
                    ? (ocState.global ? 'Already configured' : '~/.config/opencode/opencode.json')
                    : (piState.global ? 'Already configured' : '~/.pi/agent/settings.json'),
            },
        ],
    })

    if (tool === 'opencode') {
        await setupOpenCode({ prompter, files, commands, homeDir, cwd, scope })
        prompter.note(`Next steps:\n\n1. Run: opencode\n2. Type: /connect\n3. Choose your auth method:\n   \u2022 "Login with Berget" \u2014 Berget Code plan\n   \u2022 "Enter Berget API Key manually"\n   \u2022 (or set BERGET_API_KEY env var)\n4. Select model: /models\n\nFor more information, see official docs:\n\nhttps://github.com/berget-ai/opencode-berget-auth`, 'Successfully configured Berget AI for OpenCode')
    } else {
        await setupPi({ prompter, files, commands, homeDir, cwd, scope })
        prompter.note(`Next steps:\n\n1. Restart Pi or run /reload\n2. Type: /login\n3. Choose your auth method:\n   \u2022 "Use a subscription" \u2192 Berget AI\n   \u2022 (or set BERGET_API_KEY env var)\n4. Select model: /model\n\nFor more information, see official docs:\n\nhttps://github.com/berget-ai/pi-provider`, 'Successfully configured Berget AI for Pi')
    }

    prompter.outro('Setup complete!')
}

// ─── OpenCode ────────────────────────────────────────────────────────────────

async function setupOpenCode(deps: {
    prompter: Prompter
    files: FileStore
    commands: CommandRunner
    homeDir: string
    cwd: string
    scope: 'project' | 'global'
}): Promise<void> {
    const { prompter, files, commands, homeDir, cwd, scope } = deps

    const installed = await commands.checkInstalled('opencode')
    if (!installed) {
        throw new PrerequisiteError('opencode')
    }

    const configPath = await resolveOpencodeConfigPath(files, homeDir, cwd, scope)
    const existingContent = await files.readFile(configPath)
    const newContent = generateModifiedContent(existingContent, configPath)

    if (existingContent && existingContent === newContent) {
        return
    }

    if (existingContent) {
        prompter.note(generateDiff(existingContent, newContent, configPath), 'Changes to be written')
    } else {
        prompter.note(`New config at ${configPath}:\n\n${newContent}`, 'Config preview')
    }

    const shouldWrite = await prompter.confirm({
        message: existingContent
            ? `Write these changes to ${configPath}?`
            : `Create ${configPath}?`,
        initialValue: true,
    })
    if (!shouldWrite) throw new CancelledError()

    const s = prompter.spinner()
    s.start('Writing OpenCode configuration...')
    await files.writeFile(configPath, newContent)
    s.stop(`Wrote configuration to ${configPath}.`)
}

// ─── Pi ────────────────────────────────────────────────────────────────────────

async function setupPi(deps: {
    prompter: Prompter
    files: FileStore
    commands: CommandRunner
    homeDir: string
    cwd: string
    scope: 'project' | 'global'
}): Promise<void> {
    const { prompter, files, commands, homeDir, cwd, scope } = deps
    const s = prompter.spinner()

    const installed = await commands.checkInstalled('pi')
    if (!installed) {
        throw new PrerequisiteError('pi')
    }

    const installArgs = scope === 'project'
        ? ['install', '-l', PI_PROVIDER]
        : ['install', PI_PROVIDER]

    s.start(`Installing Berget AI provider for Pi...`)
    try {
        await commands.run('pi', installArgs)
        s.stop('Installed Pi provider.')
    } catch (err: any) {
        s.stop('Pi provider installation failed. Please try again or install manually.')
        throw new CommandFailedError(`pi ${installArgs.join(' ')}`, 1)
    }

    const settingsPath = scope === 'project'
        ? pathJoin(cwd, '.pi', 'settings.json')
        : pathJoin(homeDir, '.pi', 'agent', 'settings.json')

    let settings = await readJsonMaybe(files, settingsPath) || {}

    if (settings.defaultProvider === 'berget') {
        prompter.note('Berget AI is already set as your default provider.', 'Default provider already set')
    } else {
        if (settings.defaultProvider) {
            const makeDefault = await prompter.confirm({
                message: `Your default provider is ${settings.defaultProvider}. Switch to Berget AI instead?`,
                initialValue: false,
            })
            if (makeDefault) {
                settings.defaultProvider = 'berget'
                await writeJsonFile(files, settingsPath, settings)
                prompter.note('Berget AI is now your default provider.', 'Updated default provider')
            }
        } else {
            settings.defaultProvider = 'berget'
            await writeJsonFile(files, settingsPath, settings)
            prompter.note('Berget AI is now your default provider.', 'Updated default provider')
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pathJoin(...parts: string[]): string {
    // Simple path join that avoids importing 'path' module
    // This is good enough for cross-platform testing since tests control the path format
    return parts.join('/')
}

function stripJsoncComments(content: string): string {
    content = content.replace(/\/\/.*$/gm, '')
    content = content.replace(/\/\*[\s\S]*?\*\//g, '')
    return content
}

function generateDiff(oldText: string, newText: string, filePath: string): string {
    const oldLines = oldText.split('\n')
    const newLines = newText.split('\n')
    let result = `--- ${filePath}\n+++ ${filePath}\n`

    const maxLen = Math.max(oldLines.length, newLines.length)
    for (let i = 0; i < maxLen; i++) {
        const oldLine = oldLines[i]
        const newLine = newLines[i]
        if (oldLine !== newLine) {
            if (oldLine !== undefined) result += `- ${oldLine}\n`
            if (newLine !== undefined) result += `+ ${newLine}\n`
        }
    }
    return result.trimEnd()
}

async function readJsonMaybe(files: FileStore, filePath: string): Promise<any | null> {
    const content = await files.readFile(filePath)
    if (!content) return null
    try {
        return JSON.parse(content)
    } catch {
        try {
            return JSON.parse(stripJsoncComments(content))
        } catch {
            return null
        }
    }
}

async function writeJsonFile(files: FileStore, filePath: string, data: Record<string, unknown>): Promise<void> {
    await files.writeFile(filePath, JSON.stringify(data, null, 2) + '\n')
}

async function hasPluginInConfig(config: any): Promise<boolean> {
    if (!config) return false
    const plugins = config.plugin || config.plugins || []
    return plugins.some((p: string) => p.includes(OPENCODE_PLUGIN_NAME))
}

async function hasPiProviderInSettings(settings: any): Promise<boolean> {
    if (!settings) return false
    const packages = settings.packages || []
    return packages.some((p: any) => {
        if (typeof p === 'string') return p.includes(PI_PROVIDER_NAME)
        if (typeof p === 'object' && p.source) return p.source.includes(PI_PROVIDER_NAME)
        return false
    })
}

async function getOpencodeState(
    files: FileStore,
    homeDir: string,
    cwd: string
): Promise<{ project: boolean; global: boolean }> {
    const projectJsonc = await readJsonMaybe(files, pathJoin(cwd, 'opencode.jsonc'))
    const projectJson = await readJsonMaybe(files, pathJoin(cwd, 'opencode.json'))
    const globalJsonc = await readJsonMaybe(files, pathJoin(homeDir, '.config', 'opencode', 'opencode.jsonc'))
    const globalJson = await readJsonMaybe(files, pathJoin(homeDir, '.config', 'opencode', 'opencode.json'))

    return {
        project: await hasPluginInConfig(projectJsonc) || await hasPluginInConfig(projectJson),
        global: await hasPluginInConfig(globalJsonc) || await hasPluginInConfig(globalJson),
    }
}

async function getPiState(
    files: FileStore,
    homeDir: string,
    cwd: string
): Promise<{ project: boolean; global: boolean }> {
    const projectSettings = await readJsonMaybe(files, pathJoin(cwd, '.pi', 'settings.json'))
    const globalSettings = await readJsonMaybe(files, pathJoin(homeDir, '.pi', 'agent', 'settings.json'))

    return {
        project: await hasPiProviderInSettings(projectSettings),
        global: await hasPiProviderInSettings(globalSettings),
    }
}

function getOpencodeLabel(state: { project: boolean; global: boolean }): string {
    if (state.project || state.global) return ' (already configured)'
    return ''
}

function getPiLabel(state: { project: boolean; global: boolean }): string {
    if (state.project || state.global) return ' (already configured)'
    return ''
}

async function resolveOpencodeConfigPath(
    files: FileStore,
    homeDir: string,
    cwd: string,
    scope: 'project' | 'global'
): Promise<string> {
    if (scope === 'project') {
        const jsoncPath = pathJoin(cwd, 'opencode.jsonc')
        const jsonPath = pathJoin(cwd, 'opencode.json')
        if (await files.exists(jsoncPath)) return jsoncPath
        if (await files.exists(jsonPath)) return jsonPath
        return jsonPath
    } else {
        const globalDir = pathJoin(homeDir, '.config', 'opencode')
        const jsoncPath = pathJoin(globalDir, 'opencode.jsonc')
        const jsonPath = pathJoin(globalDir, 'opencode.json')
        if (await files.exists(jsoncPath)) return jsoncPath
        if (await files.exists(jsonPath)) return jsonPath
        return jsonPath
    }
}

function generateModifiedContent(existingContent: string | null, configPath: string): string {
    if (configPath.endsWith('.jsonc')) {
        const content = existingContent || '{}'
        const parseErrors: any[] = []
        const parsed = parse(content, parseErrors, { allowTrailingComma: true, disallowComments: false })

        let jsConfig: Record<string, any> = {}
        const canModifyText =
            parsed !== undefined &&
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)

        if (canModifyText) {
            jsConfig = parsed as Record<string, any>
        }

        const pluginsKey = jsConfig.plugins !== undefined ? 'plugins' : 'plugin'
        const existing: string[] = jsConfig[pluginsKey] || []
        const filtered = existing.filter((p: string) => !p.includes(OPENCODE_PLUGIN_NAME))
        filtered.push(OPENCODE_PLUGIN)

        if (canModifyText) {
            let modifiedContent = content
            const pluginEdits = modify(modifiedContent, [pluginsKey], filtered, {
                formattingOptions: { insertSpaces: true, tabSize: 2 },
            })
            modifiedContent = applyEdits(modifiedContent, pluginEdits)

            if (!jsConfig.$schema) {
                const schemaEdits = modify(modifiedContent, ['$schema'], 'https://opencode.ai/config.json', {
                    formattingOptions: { insertSpaces: true, tabSize: 2 },
                })
                modifiedContent = applyEdits(modifiedContent, schemaEdits)
            }

            return modifiedContent
        }

        // Malformed, empty, or non-object JSONC — write a clean config
        const config: Record<string, any> = {
            [pluginsKey]: filtered,
            $schema: 'https://opencode.ai/config.json',
        }
        return JSON.stringify(config, null, 2) + '\n'
    }

    // Plain JSON
    let config: Record<string, any> = {}
    if (existingContent) {
        try {
            config = JSON.parse(existingContent)
        } catch {
            // ignore malformed, overwrite
        }
    }

    const pluginsKey = config.plugins !== undefined ? 'plugins' : 'plugin'
    const existing: string[] = config[pluginsKey] || []
    const filtered = existing.filter((p: string) => !p.includes(OPENCODE_PLUGIN_NAME))
    filtered.push(OPENCODE_PLUGIN)
    config[pluginsKey] = filtered
    config.$schema = config.$schema || 'https://opencode.ai/config.json'

    return JSON.stringify(config, null, 2) + '\n'
}

// ─── Production CLI entry point ──────────────────────────────────────────────

import { ClackPrompter } from './adapters/clack-prompter.js'
import { FsFileStore } from './adapters/fs-file-store.js'
import { SpawnCommandRunner } from './adapters/spawn-command-runner.js'
import * as os from 'os'

export async function runSetupCommand(): Promise<void> {
    try {
        await runSetup({
            prompter: new ClackPrompter(),
            files: new FsFileStore(),
            commands: new SpawnCommandRunner(),
            homeDir: os.homedir(),
            cwd: process.cwd(),
        })
    } catch (err) {
        if (err instanceof CancelledError) {
            process.exit(130)
        }
        if (err instanceof PrerequisiteError) {
            console.error(`Missing required binary: ${err.binary}`)
            process.exit(2)
        }
        if (err instanceof CommandFailedError) {
            console.error(err.message)
            process.exit(5)
        }
        throw err
    }
}
