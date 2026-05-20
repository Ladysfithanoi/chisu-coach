import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession, COOKIE_NAME } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import DietForm from "./_components/DietForm";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) redirect("/login");

  let session;
  try {
    session = await verifySession(token);
  } catch {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user || user.currentSessionToken !== session.sid) {
    redirect("/login?kicked=1");
  }

  return <DietForm userName={user.name} />;
}
