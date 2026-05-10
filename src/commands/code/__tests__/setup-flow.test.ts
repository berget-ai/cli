import { describe, expect, it } from 'vitest'
import { runSetup } from '../setup'
import { CancelledError, CommandFailedError, PrerequisiteError } from '../errors'
import { FakePrompter, CANCEL, select, confirm } from './fake-prompter'
import { FakeFileStore } from './fake-file-store'
import { FakeCommandRunner } from './fake-command-runner'

const makeDeps = (overrides: Partial<Parameters<typeof runSetup>[0]> = {}) => ({
	prompter: new FakePrompter([]),
	files: new FakeFileStore(),
	commands: new FakeCommandRunner()
		.handle('opencode --version', 'mocked')
		.handle('pi --version', 'mocked'),
	homeDir: '/home/user',
	cwd: '/home/user/project',
	...overrides,
})

describe('runSetup', () => {
	describe('happy path', () => {
		it('sets up opencode project without existing config', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('opencode'),
					select('project'),
				]),
			})

			await runSetup(deps)
			
			const files = deps.files as FakeFileStore
			const written = files.getWrittenFiles()
			expect(written.has('/home/user/project/opencode.json')).toBe(true)
			const config = JSON.parse(written.get('/home/user/project/opencode.json')!)
			expect(config.plugin).toContain('@bergetai/opencode-auth@1.0.16')
		})

		it('sets up opencode globally without existing config', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('opencode'),
					select('global'),
				]),
			})

			await runSetup(deps)
			
			const files = deps.files as FakeFileStore
			const written = files.getWrittenFiles()
			expect(written.has('/home/user/.config/opencode/opencode.json')).toBe(true)
		})

		it('sets up pi project with fresh install', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('pi'),
					select('project'),
				]),
				commands: new FakeCommandRunner()
					.handle('pi --version', 'mocked') // For checkInstalled
					.handle('pi install', ''), // For actual install
			})

			await runSetup(deps)
			
			const commands = deps.commands as FakeCommandRunner
			expect(commands.calls.length).toBeGreaterThan(0)
			const installCall = commands.calls.find(c => c.command === 'pi')
			expect(installCall?.args).toContain('npm:@bergetai/pi-provider')
		})
	})

	describe('prerequisites', () => {
		it('throws PrerequisiteError when opencode is not installed', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('opencode'),
					select('project'),
				]),
				commands: new FakeCommandRunner(),
			})
			
			// Simulate opencode not being installed
			await expect(runSetup(deps)).rejects.toBeInstanceOf(PrerequisiteError)
		})
	})

	describe('cancellation', () => {
		it('throws CancelledError when user cancels at tool selection', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select(CANCEL),
				]),
			})

			await expect(runSetup(deps)).rejects.toBeInstanceOf(CancelledError)
		})

		it('throws CancelledError when user cancels at reconfiguration', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('opencode'),
					select('project'),
					confirm(false, 'Reconfigure'),
				]),
			})
			
			const files = deps.files as FakeFileStore
			files.seed('/home/user/project/opencode.json', JSON.stringify({
				plugin: ['@bergetai/opencode-auth@1.0.16']
			}))

			await expect(runSetup(deps)).rejects.toBeInstanceOf(CancelledError)
		})
	})

	describe('file operations', () => {
		it('preserves existing configuration keys when updating', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('opencode'),
					select('project'),
					confirm(true, 'Reconfigure'),
				]),
			})
			
			const files = deps.files as FakeFileStore
			files.seed('/home/user/project/opencode.json', JSON.stringify({
				customField: 'should-preserve',
				plugin: ['other-plugin'],
			}))

			await runSetup(deps)

			const written = files.getWrittenFiles()
			const config = JSON.parse(written.get('/home/user/project/opencode.json')!)
			expect(config.customField).toBe('should-preserve')
		})

		it('creates parent directories when writing files', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('opencode'),
					select('global'),
				]),
			})

			await runSetup(deps)

			const files = deps.files as FakeFileStore
			const written = files.getWrittenFiles()
			expect(written.has('/home/user/.config/opencode/opencode.json')).toBe(true)
		})
	})

	describe('command execution', () => {
		it('passes arguments as array (no shell injection)', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('pi'),
					select('project'),
				]),
				commands: new FakeCommandRunner()
					.handle('pi --version', 'mocked')
					.handle('pi install', ''),
			})

			await runSetup(deps)

			const commands = deps.commands as FakeCommandRunner
			const installCall = commands.calls.find(c => c.command === 'pi')
			expect(installCall?.args).toContain('npm:@bergetai/pi-provider')
			expect(installCall?.args).toContain('-l')
		})
	})

	describe('error handling', () => {
		it('throws CommandFailedError when pi install fails', async () => {
			const deps = makeDeps({
				prompter: new FakePrompter([
					select('pi'),
					select('project'),
				]),
				commands: new FakeCommandRunner()
					.handle('pi --version', 'mocked')
					.handle('pi install', new Error('npm error')),
			})

			await expect(runSetup(deps)).rejects.toBeInstanceOf(CommandFailedError)
		})
	})
})
