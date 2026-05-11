import * as p from '@clack/prompts'
import { CancelledError } from '../errors'
import type { Prompter, Spinner } from '../ports/prompter'

const unwrap = <T>(v: T | symbol): T => {
	if (p.isCancel(v)) throw new CancelledError()
	return v as T
}

export class ClackPrompter implements Prompter {
	intro(message: string): void {
		p.intro(message)
	}
	outro(message: string): void {
		p.outro(message)
	}
	note(message: string, title?: string): void {
		p.note(message, title)
	}
	spinner(): Spinner {
		const s = p.spinner()
		return {
			start: (msg: string) => s.start(msg),
			stop: (msg: string) => s.stop(msg),
		}
	}
	async select<T>(opts: {
		message: string
		options: ReadonlyArray<{
			value: T
			label: string
			hint?: string
		}>
	}): Promise<T> {
		return unwrap(await p.select(opts as any))
	}
	async confirm(opts: {
		message: string
		initialValue?: boolean
	}): Promise<boolean> {
		return unwrap(await p.confirm(opts))
	}

	async text(opts: {
		message: string
		placeholder?: string
	}): Promise<string> {
		return unwrap(await p.text(opts))
	}

	async multiselect<T>(opts: {
		message: string
		options: ReadonlyArray<{
			value: T
			label: string
			hint?: string
		}>
	}): Promise<T[]> {
		return unwrap(await p.multiselect(opts as any))
	}
}
