import { NextRequest, NextResponse } from "next/server";
import { getPTAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Xác nhận học viên thuộc về PT đang đăng nhập
async function assertOwnsStudent(ptId: string, studentId: string): Promise<boolean> {
  const student = await prisma.user.findFirst({
    where: { id: studentId, ptId, role: "STUDENT" },
    select: { id: true },
  });
  return !!student;
}

// GET ?studentId= — thực đơn active của học viên
export async function GET(req: NextRequest) {
  const auth = await getPTAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "Thiếu studentId" }, { status: 400 });
  }
  if (!(await assertOwnsStudent(auth.user.id, studentId))) {
    return NextResponse.json({ error: "Học viên không thuộc quyền quản lý" }, { status: 403 });
  }

  const plan = await prisma.mealPlan.findFirst({
    where: { studentId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ plan });
}

// POST — lưu & gán thực đơn mới cho học viên (vô hiệu bản cũ)
export async function POST(req: NextRequest) {
  const auth = await getPTAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  try {
    const body = (await req.json()) as {
      studentId?: string;
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

    const { studentId, nutritionJson } = body;
    if (!studentId || !nutritionJson) {
      return NextResponse.json({ error: "Thiếu dữ liệu thực đơn" }, { status: 400 });
    }
    if (!(await assertOwnsStudent(auth.user.id, studentId))) {
      return NextResponse.json({ error: "Học viên không thuộc quyền quản lý" }, { status: 403 });
    }

    const plan = await prisma.$transaction(async (tx) => {
      await tx.mealPlan.updateMany({
        where: { studentId, isActive: true },
        data: { isActive: false },
      });
      return tx.mealPlan.create({
        data: {
          studentId,
          createdById: auth.user.id,
          label: body.label?.trim() || null,
          calories: Math.round(body.calories ?? 0),
          protein: Math.round(body.protein ?? 0),
          fat: Math.round(body.fat ?? 0),
          carbs: Math.round(body.carbs ?? 0),
          mealCount: body.mealCount ?? 3,
          nutritionJson: nutritionJson as object,
          aiMealsJson: (body.aiMealsJson ?? null) as object,
          manualFoodsJson: (body.manualFoodsJson ?? null) as object,
        },
      });
    });

    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("[pt/plans POST]", error);
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
  }
}
