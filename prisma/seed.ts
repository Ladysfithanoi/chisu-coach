import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({ url: "file:./prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hashedPassword = await bcrypt.hash("123456", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@dietplan.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@dietplan.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log(`✓ Seeded admin: ${admin.email} (id: ${admin.id})`);
  console.log(`  Email:    admin@dietplan.com`);
  console.log(`  Password: 123456`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
