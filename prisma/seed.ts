import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(filePath: string, opts: { override?: boolean } = {}): void {
  try {
    const lines = readFileSync(filePath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      const isPlaceholder = /\[.+\]/.test(val);
      if (!isPlaceholder && (opts.override || !process.env[key])) {
        process.env[key] = val;
      }
    }
  } catch {}
}

loadEnv(resolve(process.cwd(), ".env"));
loadEnv(resolve(process.cwd(), ".env.local"), { override: true });

const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = "admin@chisu.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ Admin already exists: ${email}`);
    return;
  }
  const password = await bcrypt.hash("MatKhauAdmin123", 12);
  const admin = await prisma.user.create({
    data: { name: "Admin Tổng", email, password, role: "ADMIN" },
  });
  console.log(`✓ Admin created: ${admin.name} <${admin.email}>`);
}

main()
  .catch((e) => {
    console.error("SEED ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
