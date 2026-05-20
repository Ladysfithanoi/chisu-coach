import { defineConfig } from 'prisma/config'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Prisma v7 CLI does not auto-load .env files — parse them manually.
// Load order: .env (base) → .env.local (overrides, but skips placeholder stubs)
function loadEnvFile(filePath: string, opts: { override?: boolean } = {}): void {
  try {
    const lines = readFileSync(filePath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      // Skip unfilled placeholder stubs like [YOUR_PASSWORD], [PROJECT_REF]
      const isPlaceholder = /\[.+\]/.test(val)
      if (!isPlaceholder && (opts.override || !process.env[key])) {
        process.env[key] = val
      }
    }
  } catch {}
}

loadEnvFile(resolve(process.cwd(), '.env'))
loadEnvFile(resolve(process.cwd(), '.env.local'), { override: true })

export default defineConfig({
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
})
