import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const serialized = users.map((u: any) => ({
    ...u,
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : new Date().toISOString(),
  }));

  return NextResponse.json({ users: serialized });
}
