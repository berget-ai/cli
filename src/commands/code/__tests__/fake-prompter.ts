import { CancelledError } from '../errors'
import type { Prompter, Spinner } from '../ports/prompter'

export const CANCEL = Symbol('cancel')

type PromptEntry =
	| { kind: 'select'; match?: RegExp; response: string | symbol }
	| { kind: 'confirm'; match?: RegExp; response: boolean | symbol }
	| { kind: 'text'; match?: RegExp; response: string | symbol }
	| { kind: 'multiselect'; match?: RegExp; response: (string | symbol)[] }

export const select = <T>(
	value: T | symbol,
	match?: string | RegExp
): PromptEntry => ({
	kind: 'select',
	match: typeof match === 'string' ? new RegExp(match) : match,
	response: typeof value === 'symbol' ? value : String(value),
})

export const text = (
	value: string | symbol,
	match?: string | RegExp,
): PromptEntry => ({
	kind: 'text',
	match: typeof match === 'string' ? new RegExp(match) : match,
	response: value,
})

export const confirm = (
	value: boolean | symbol,
	match?: string | RegExp
): PromptEntry => ({
	kind: 'confirm',
	match: typeof match === 'string' ? new RegExp(match) : match,
	response: value,
})

export const multiselect = <T>(
	values: T[] | symbol,
	match?: string | RegExp
): PromptEntry => ({
	kind: 'multiselect',
	match: typeof match === 'string' ? new RegExp(match) : match,
	response: values === CANCEL ? [CANCEL] : (values as T[]).map(v => String(v)) as (string | symbol)[],
})

export class FakePrompter implements Prompter {
	private _calls: Array<{ method: string; args: unknown }> = []
	private _cursor = 0

	constructor(private readonly _script: PromptEntry[]) {}

	intro(message: string): void {
		this._calls.push({ method: 'intro', args: { message } })
	}
	outro(message: string): void {
		this._calls.push({ method: 'outro', args: { message } })
	}
	note(message: string, title?: string): void {
		this._calls.push({ method: 'note', args: { message, title } })
	}
	spinner(): Spinner {
		return {
			start: (msg: string) => {
				this._calls.push({ method: 'spinner.start', args: { message: msg } })
			},
			stop: (msg: string) => {
				this._calls.push({ method: 'spinner.stop', args: { message: msg } })
			},
		}
	}

	async select<T>(opts: { message: string }): Promise<T> {
		this._calls.push({ method: 'select', args: opts })
		const entry = this._script[this._cursor++]
		if (!entry) throw new Error(`No script entry for select #${this._cursor} (${opts.message})`)
		if (entry.kind !== 'select') throw new Error(`Expected select, got ${entry.kind} for ${opts.message}`)
		if (entry.match && !entry.match.test(opts.message)) throw new Error(`Message mismatch: got "${opts.message}"`)
		if (entry.response === CANCEL) throw new CancelledError()
		return entry.response as T
	}

	async confirm(opts: { message: string }): Promise<boolean> {
		this._calls.push({ method: 'confirm', args: opts })
		const entry = this._script[this._cursor++]
		if (!entry) throw new Error(`No script entry for confirm #${this._cursor} (${opts.message})`)
		if (entry.kind !== 'confirm') throw new Error(`Expected confirm, got ${entry.kind} for ${opts.message}`)
		if (entry.match && !entry.match.test(opts.message)) throw new Error(`Message mismatch: got "${opts.message}"`)
		if (entry.response === CANCEL) throw new CancelledError()
		return entry.response as boolean
	}

	async text(opts: { message: string }): Promise<string> {
		this._calls.push({ method: 'text', args: opts })
		const entry = this._script[this._cursor++]
		if (!entry) throw new Error(`No script entry for text #${this._cursor} (${opts.message})`)
		if (entry.kind !== 'text') throw new Error(`Expected text, got ${entry.kind} for ${opts.message}`)
		if (entry.match && !entry.match.test(opts.message)) throw new Error(`Message mismatch: got "${opts.message}"`)
		if (entry.response === CANCEL) throw new CancelledError()
		return entry.response as string
	}

	async multiselect<T>(opts: { message: string }): Promise<T[]> {
		this._calls.push({ method: 'multiselect', args: opts })
		const entry = this._script[this._cursor++]
		if (!entry) throw new Error(`No script entry for multiselect #${this._cursor} (${opts.message})`)
		if (entry.kind !== 'multiselect') throw new Error(`Expected multiselect, got ${entry.kind} for ${opts.message}`)
		if (entry.match && !entry.match.test(opts.message)) throw new Error(`Message mismatch: got "${opts.message}"`)
		if (entry.response.includes(CANCEL)) throw new CancelledError()
		return entry.response as T[]
	}

	get calls() {
		return this._calls
	}

	assertExhausted() {
		if (this._cursor !== this._script.length) {
			throw new Error(`Script not exhausted: ${this._script.length - this._cursor} entries left`)
		}
	}
}
