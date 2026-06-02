import { NextRequest, NextResponse } from "next/server";
import { getStudentAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST — học viên tự lưu thực đơn của mình (source = SELF)
export async function POST(req: NextRequest) {
  const auth = await getStudentAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  try {
    const body = (await req.json()) as {
      label?: string;
      calories?: number;
      protein?: number;
      fat?: number;
      carbs?: number;
      mealCount?: number;
      nutritionJson?: unknown;
      aiMealsJson?: unknown;
      manualFoodsJson?: unknown;
    };

    if (!body.nutritionJson) {
      return NextResponse.json({ error: "Thiếu dữ liệu thực đơn" }, { status: 400 });
    }

    const studentId = auth.user.id;
    const plan = await prisma.$transaction(async (tx) => {
      await tx.mealPlan.updateMany({
        where: { studentId, source: "SELF", isActive: true },
        data: { isActive: false },
      });
      return tx.mealPlan.create({
        data: {
          studentId,
          createdById: studentId,
          source: "SELF",
          label: body.label?.trim() || null,
          calories: Math.round(body.calories ?? 0),
          protein: Math.round(body.protein ?? 0),
          fat: Math.round(body.fat ?? 0),
          carbs: Math.round(body.carbs ?? 0),
          mealCount: body.mealCount ?? 3,
          nutritionJson: body.nutritionJson as object,
          aiMealsJson: (body.aiMealsJson ?? null) as object,
          manualFoodsJson: (body.manualFoodsJson ?? null) as object,
        },
      });
    });

    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("[student/plans POST]", error);
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
  }
}
