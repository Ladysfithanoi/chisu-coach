import { defineConfig } from 'prisma/config'

// Hardcode SQLite URL for local development — Prisma v7 env() does not auto-load .env files
export default defineConfig({
  datasource: {
    url: 'file:./prisma/dev.db',
  },
})
