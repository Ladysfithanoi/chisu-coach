import { redirect } from "next/navigation";
import { getStudentAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import StudentHome from "./StudentHome";
import type { SavedPlan } from "../_components/PlanView";
import type { AiMeal, ManualFood } from "../_components/MealPlanSection";
import type { WeightPoint } from "@/lib/weight";

export default async function StudentPage() {
  const auth = await getStudentAuth();
  if (!auth.ok) {
    redirect(auth.kicked ? "/login?kicked=1" : "/login");
  }

  const ptPlan = await prisma.mealPlan.findFirst({
    where: { studentId: auth.user.id, source: "PT", isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const serialized: SavedPlan | null = ptPlan
    ? {
        label: ptPlan.label,
        calories: ptPlan.calories,
        protein: ptPlan.protein,
        fat: ptPlan.fat,
        carbs: ptPlan.carbs,
        mealCount: ptPlan.mealCount,
        nutritionJson: ptPlan.nutritionJson,
        aiMealsJson: (ptPlan.aiMealsJson as AiMeal[] | null) ?? null,
        manualFoodsJson: (ptPlan.manualFoodsJson as ManualFood[] | null) ?? null,
        updatedAt: ptPlan.updatedAt.toISOString(),
      }
    : null;

  const weightRows = await prisma.weightEntry.findMany({
    where: { studentId: auth.user.id },
    orderBy: { date: "asc" },
    select: { date: true, weightKg: true, note: true },
  });
  const weightEntries: WeightPoint[] = weightRows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    weightKg: r.weightKg,
    note: r.note,
  }));

  return <StudentHome studentName={auth.user.name} ptPlan={serialized} weightEntries={weightEntries} />;
}
