import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { FileStore } from '../ports/file-store'

export class FsFileStore implements FileStore {
	async exists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath)
			return true
		} catch {
			return false
		}
	}

	async readFile(filePath: string): Promise<string | null> {
		try {
			return await fs.readFile(filePath, 'utf8')
		} catch (err: any) {
			if (err.code === 'ENOENT') return null
			throw err
		}
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		const dir = path.dirname(filePath)
		await fs.mkdir(dir, { recursive: true })
		await fs.writeFile(filePath, content, 'utf8')
	}

	async mkdir(dir: string): Promise<void> {
		await fs.mkdir(dir, { recursive: true })
	}
}
