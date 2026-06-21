import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPTAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET — danh sách học viên của PT đang đăng nhập
export async function GET() {
  const auth = await getPTAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const students = await prisma.user.findMany({
    where: { ptId: auth.user.id, role: "STUDENT" },
    select: {
      id: true,
      name: true,
      email: true,
      medicalConditions: true,
      createdAt: true,
      mealPlans: {
        where: { isActive: true, source: "PT" },
        select: { id: true, label: true, calories: true, protein: true, fat: true, carbs: true, updatedAt: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ students });
}

// POST — PT tạo học viên mới (tự gán ptId = chính mình)
export async function POST(req: NextRequest) {
  const auth = await getPTAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  try {
    const body = (await req.json()) as { name?: string; email?: string; password?: string; medicalConditions?: string };
    const { name, email, password, medicalConditions } = body;

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Vui lòng điền đầy đủ thông tin" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
      return NextResponse.json({ error: "Email này đã được sử dụng" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const student = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: "STUDENT",
        ptId: auth.user.id,
        medicalConditions: medicalConditions?.trim() || null,
      },
      select: { id: true, name: true, email: true, medicalConditions: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, student });
  } catch (error) {
    console.error("[pt/students POST]", error);
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
  }
}
