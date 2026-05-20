import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/jwt";
import DietForm from "./_components/DietForm";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("dp-session")?.value;

  if (!token) redirect("/login");

  try {
    await verifySession(token);
  } catch {
    redirect("/login");
  }

  return <DietForm />;
}
