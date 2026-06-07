import { redirect } from "next/navigation";
import { getPTAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import PTDashboard, { type StudentRow } from "./PTDashboard";

export default async function PTPage() {
  const auth = await getPTAuth();
  if (!auth.ok) {
    redirect(auth.kicked ? "/login?kicked=1" : "/login");
  }

  const rows = await prisma.user.findMany({
    where: { ptId: auth.user.id, role: "STUDENT" },
    select: {
      id: true,
      name: true,
      email: true,
      medicalConditions: true,
      createdAt: true,
      mealPlans: {
        where: { isActive: true, source: "PT" },
        select: { id: true, label: true, calories: true, updatedAt: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const students: StudentRow[] = rows.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    medicalConditions: s.medicalConditions,
    createdAt: s.createdAt.toISOString(),
    mealPlans: s.mealPlans.map((p) => ({
      id: p.id,
      label: p.label,
      calories: p.calories,
      updatedAt: p.updatedAt.toISOString(),
    })),
  }));

  return <PTDashboard ptName={auth.user.name} initialStudents={students} />;
}
