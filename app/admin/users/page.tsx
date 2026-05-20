import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import AdminUsersClient from "./AdminUsersClient";

export default async function AdminUsersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) redirect("/login");

  let session;
  try {
    session = await verifySession(token);
  } catch {
    redirect("/login");
  }

  if (session.role !== "ADMIN") redirect("/");

  const currentUser = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!currentUser || currentUser.currentSessionToken !== session.sid) {
    redirect("/login?kicked=1");
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const serialized = users.map((u: any) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return <AdminUsersClient initialUsers={serialized} />;
}
