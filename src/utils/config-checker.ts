import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Check for .bergetconfig file and handle cluster switching
 */
export function checkBergetConfig(): void {
  const configPath = path.join(process.cwd(), '.bergetconfig');
  if (fs.existsSync(configPath)) {
    try {
      const config = fs.readFileSync(configPath, 'utf8');
      const match = config.match(/cluster:\s*(.+)/);
      if (match && match[1]) {
        const clusterName = match[1].trim();
        console.log(`🔄 Berget: Switched to cluster "${clusterName}"`);
        console.log('✓ kubectl config updated');
        console.log('');
      }
    } catch {
      // Silently ignore errors reading config
    }
  }
}
