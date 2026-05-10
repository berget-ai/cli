import type { Prompter } from './ports/prompter'
import type { FileStore } from './ports/file-store'
import type { CommandRunner } from './ports/command-runner'
import { CancelledError, CommandFailedError, PrerequisiteError } from './errors'

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
		message: 'Which tool do you want to set up with Berget AI?',
		options: [
			{
				value: 'opencode',
				label: `OpenCode${getOpencodeLabel(ocState)}`,
				hint: 'Multi-agent coding assistant',
			},
			{
				value: 'pi',
				label: `Pi${getPiLabel(piState)}`,
				hint: 'Lightweight AI coding companion',
			},
		],
	})

	const scope = await prompter.select<'project' | 'global'>({
		message: 'Where should this configuration apply?',
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
		prompter.note(`Next steps:\n1. Run: opencode\n2. Type: /connect\n3. Choose your auth method:\n   \u2022 "Login with Berget" \u2014 Berget Code team members (SSO)\n   \u2022 "Enter API Key" \u2014 API key users (console.berget.ai)\n\nDocs: https://docs.berget.ai/code`, '\u2705 OpenCode configured')
	} else {
		await setupPi({ prompter, files, commands, homeDir, cwd, scope })
		prompter.note(`Next steps:\n1. Restart Pi or run /reload\n2. Authenticate: /login \u2192 "Use a subscription" \u2192 Berget AI\n   (or set BERGET_API_KEY env var)\n3. Select model: /model\n\nDocs: https://docs.berget.ai/pi`, '\u2705 Pi configured')
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
	const s = prompter.spinner()

	s.start('Checking if OpenCode CLI is installed...')
	const installed = await commands.checkInstalled('opencode')
	if (!installed) {
		s.stop("OpenCode CLI isn't installed. Please install OpenCode before continuing.")
		throw new PrerequisiteError('opencode')
	}
	s.stop('OpenCode CLI found.')

	const state = await getOpencodeState(files, homeDir, cwd)
	const alreadyConfigured = scope === 'project' ? state.project : state.global

	if (alreadyConfigured) {
		const shouldReconfigure = await prompter.confirm({
			message: `OpenCode is already configured ${scope === 'project' ? 'for this project' : 'globally'}. Reconfigure?`,
			initialValue: false,
		})
		if (!shouldReconfigure) throw new CancelledError()
	}

	let existingPath: string | null = null
	if (scope === 'project') {
		const jsoncPath = pathJoin(cwd, 'opencode.jsonc')
		const jsonPath = pathJoin(cwd, 'opencode.json')
		if (await files.exists(jsoncPath)) existingPath = jsoncPath
		else if (await files.exists(jsonPath)) existingPath = jsonPath
	} else {
		const jsoncPath = pathJoin(homeDir, '.config', 'opencode', 'opencode.jsonc')
		const jsonPath = pathJoin(homeDir, '.config', 'opencode', 'opencode.json')
		if (await files.exists(jsoncPath)) existingPath = jsoncPath
		else if (await files.exists(jsonPath)) existingPath = jsonPath
	}

	s.start('Writing OpenCode configuration...')
	const configPath = await updateOpencodeConfig(files, homeDir, cwd, existingPath, scope)
	s.stop(`Configuration written to ${configPath}.`)
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

	s.start('Checking if Pi CLI is installed...')
	const installed = await commands.checkInstalled('pi')
	if (!installed) {
		s.stop("Pi CLI isn't installed. Please install Pi before continuing.")
		throw new PrerequisiteError('pi')
	}
	s.stop('Pi CLI found.')

	const state = await getPiState(files, homeDir, cwd)
	const alreadyConfigured = scope === 'project' ? state.project : state.global

	if (alreadyConfigured) {
		const shouldReconfigure = await prompter.confirm({
			message: `Pi is already configured ${scope === 'project' ? 'for this project' : 'globally'}. Reconfigure?`,
			initialValue: false,
		})
		if (!shouldReconfigure) throw new CancelledError()
	}

	const installArgs = scope === 'project'
		? ['install', '-l', PI_PROVIDER]
		: ['install', PI_PROVIDER]

	s.start(`Installing Berget AI provider for Pi...`)
	try {
		await commands.run('pi', installArgs)
		s.stop('Provider installed.')
	} catch (err: any) {
		s.stop('Provider installation failed. Please try again or install manually.')
		throw new CommandFailedError(`pi ${installArgs.join(' ')}`, 1)
	}

	const settingsPath = scope === 'project'
		? pathJoin(cwd, '.pi', 'settings.json')
		: pathJoin(homeDir, '.pi', 'agent', 'settings.json')

	let settings = await readJsonMaybe(files, settingsPath) || {}

	if (settings.defaultProvider === 'berget') {
		prompter.note('Berget AI is already set as your default provider.', 'Provider default')
	} else {
		if (settings.defaultProvider) {
			const makeDefault = await prompter.confirm({
				message: `Your default provider is ${settings.defaultProvider}. Switch to Berget AI instead?`,
				initialValue: false,
			})
			if (makeDefault) {
				settings.defaultProvider = 'berget'
				await writeJsonFile(files, settingsPath, settings)
				prompter.note('Berget AI is now your default provider.', 'Provider default updated')
			}
		} else {
			settings.defaultProvider = 'berget'
			await writeJsonFile(files, settingsPath, settings)
			prompter.note('Berget AI is now your default provider.', 'Provider default set')
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
	if (state.project && state.global) return ' (configured \u2014 both)'
	if (state.project) return ' (configured \u2014 project)'
	if (state.global) return ' (configured \u2014 global)'
	return ''
}

function getPiLabel(state: { project: boolean; global: boolean }): string {
	if (state.project && state.global) return ' (configured \u2014 both)'
	if (state.project) return ' (configured \u2014 project)'
	if (state.global) return ' (configured \u2014 global)'
	return ''
}

async function updateOpencodeConfig(
	files: FileStore,
	homeDir: string,
	cwd: string,
	existingPath: string | null,
	scope: 'project' | 'global'
): Promise<string> {
	let config: Record<string, any> = {}
	let configPath: string

	if (scope === 'project') {
		const jsoncPath = pathJoin(cwd, 'opencode.jsonc')
		const jsonPath = pathJoin(cwd, 'opencode.json')

		if (existingPath && await files.exists(existingPath)) {
			configPath = existingPath
		} else if (await files.exists(jsoncPath)) {
			configPath = jsoncPath
		} else if (await files.exists(jsonPath)) {
			configPath = jsonPath
		} else {
			configPath = jsonPath
		}
	} else {
		const globalDir = pathJoin(homeDir, '.config', 'opencode')
		const jsoncPath = pathJoin(globalDir, 'opencode.jsonc')
		const jsonPath = pathJoin(globalDir, 'opencode.json')

		if (existingPath && await files.exists(existingPath)) {
			configPath = existingPath
		} else if (await files.exists(jsoncPath)) {
			configPath = jsoncPath
		} else if (await files.exists(jsonPath)) {
			configPath = jsonPath
		} else {
			configPath = jsonPath
		}
	}

	const content = await files.readFile(configPath)
	if (content) {
		try {
			if (configPath.endsWith('.jsonc')) {
				config = JSON.parse(stripJsoncComments(content))
			} else {
				config = JSON.parse(content)
			}
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

	await writeJsonFile(files, configPath, config)
	return configPath
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
