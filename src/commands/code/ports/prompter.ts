export interface Prompter {
	intro(message: string): void
	outro(message: string): void
	note(message: string, title?: string): void
	spinner(): Spinner
	select<T>(opts: {
		message: string
		options: ReadonlyArray<{
			value: T
			label: string
			hint?: string
		}>
	}): Promise<T>
	multiselect<T>(opts: {
		message: string
		options: ReadonlyArray<{
			value: T
			label: string
			hint?: string
		}>
	}): Promise<T[]>
	confirm(opts: {
		message: string
		initialValue?: boolean
	}): Promise<boolean>
	text(opts: {
		message: string
		placeholder?: string
	}): Promise<string>
}

export interface MultiSelectOption<T> {
	value: T
	label: string
	hint?: string
}
