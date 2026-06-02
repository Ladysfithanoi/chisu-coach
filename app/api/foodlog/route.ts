import { NextRequest, NextResponse } from "next/server";
import { getAuth, resolveStudentTarget } from "@/lib/auth";
import { deleteFromDrive, parseDriveFileId } from "@/lib/drive";
import prisma from "@/lib/prisma";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?studentId=&date= — nhật ký ăn uống (mặc định của chính mình)
export async function GET(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }

  const target = await resolveStudentTarget(auth.user.id, auth.user.role, req.nextUrl.searchParams.get("studentId"));
  if (!target.ok) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu này" }, { status: 403 });
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  const where: { studentId: string; date?: Date } = { studentId: target.id };
  if (dateParam && DATE_RE.test(dateParam)) {
    where.date = new Date(dateParam + "T00:00:00.000Z");
  }

  const rows = await prisma.foodLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true, date: true, mealLabel: true, photoUrl: true, name: true, calories: true, protein: true, fat: true, carbs: true },
  });

  const logs = rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) }));
  return NextResponse.json({ logs });
}

// POST — thêm 1 món vào nhật ký (chính mình, hoặc PT/Admin điền hộ)
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      studentId?: string;
      date?: string;
      mealLabel?: string;
      photoUrl?: string;
      name?: string;
      calories?: number;
      protein?: number;
      fat?: number;
      carbs?: number;
      aiRaw?: unknown;
    };

    const date = body.date && DATE_RE.test(body.date) ? body.date : null;
    if (!date) return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
    if (!body.name?.trim()) return NextResponse.json({ error: "Thiếu tên món" }, { status: 400 });

    const target = await resolveStudentTarget(auth.user.id, auth.user.role, body.studentId);
    if (!target.ok) return NextResponse.json({ error: "Không có quyền ghi dữ liệu này" }, { status: 403 });

    const log = await prisma.foodLog.create({
      data: {
        studentId: target.id,
        date: new Date(date + "T00:00:00.000Z"),
        mealLabel: body.mealLabel?.trim() || null,
        photoUrl: body.photoUrl?.trim() || null,
        name: body.name.trim(),
        calories: Math.max(0, Math.round(body.calories ?? 0)),
        protein: body.protein != null ? Math.max(0, Math.round(body.protein)) : null,
        fat: body.fat != null ? Math.max(0, Math.round(body.fat)) : null,
        carbs: body.carbs != null ? Math.max(0, Math.round(body.carbs)) : null,
        aiRaw: (body.aiRaw ?? null) as object,
      },
      select: { id: true, date: true, mealLabel: true, photoUrl: true, name: true, calories: true, protein: true, fat: true, carbs: true },
    });

    return NextResponse.json({ ok: true, log: { ...log, date: log.date.toISOString().slice(0, 10) } });
  } catch (error) {
    console.error("[foodlog POST]", error);
    return NextResponse.json({ error: "Lỗi máy chủ" }, { status: 500 });
  }
}

// DELETE ?id= — xoá 1 món (kiểm tra quyền theo chủ sở hữu)
export async function DELETE(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

  const log = await prisma.foodLog.findUnique({ where: { id }, select: { studentId: true, photoUrl: true } });
  if (!log) return NextResponse.json({ ok: true }); // đã không còn

  // Chỉ chính chủ học viên được xoá bữa ăn của mình — PT/Admin chỉ xem, không xoá hộ.
  if (log.studentId !== auth.user.id) {
    return NextResponse.json({ error: "Chỉ học viên mới xoá được bữa ăn của mình" }, { status: 403 });
  }

  await prisma.foodLog.delete({ where: { id } });

  // Xoá luôn ảnh trên Drive để không rác chiếm dung lượng (best-effort).
  const fileId = parseDriveFileId(log.photoUrl);
  if (fileId) await deleteFromDrive(fileId);

  return NextResponse.json({ ok: true });
}
