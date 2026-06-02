import { redirect } from "next/navigation";
import { getAuth, ROLES } from "@/lib/auth";

export default async function Home() {
  const auth = await getAuth();

  if (!auth.ok) {
    redirect(auth.kicked ? "/login?kicked=1" : "/login");
  }

  switch (auth.session.role) {
    case ROLES.ADMIN:
      redirect("/admin/users");
    case ROLES.PT:
      redirect("/pt");
    case ROLES.STUDENT:
    default:
      redirect("/student");
  }
}
