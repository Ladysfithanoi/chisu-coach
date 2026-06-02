import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Xác định học viên mục tiêu + kiểm tra quyền đọc
async function resolveTarget(
  callerId: string,
  callerRole: string,
  studentId: string | null
): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!studentId || studentId === callerId) return { ok: true, id: callerId };
  if (callerRole === "ADMIN") return { ok: true, id: studentId };
  if (callerRole === "PT") {
    const owned = await prisma.user.findFirst({
      where: { id: studentId, ptId: callerId, role: "STUDENT" },
      select: { id: true },
    });
    return owned ? { ok: true, id: studentId } : { ok: false };
  }
  return { ok: false };
}

// GET ?studentId= — danh sách cân nặng (mặc định của chính mình)
export async function GET(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }

  const target = await resolveTarget(auth.user.id, auth.user.role, req.nextUrl.searchParams.get("studentId"));
  if (!target.ok) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu này" }, { status: 403 });
  }

  const rows = await prisma.weightEntry.findMany({
    where: { studentId: target.id },
    orderBy: { date: "asc" },
    select: { date: true, weightKg: true, note: true },
  });

  const entries = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    weightKg: r.weightKg,
    note: r.note,
  }));

  return NextResponse.json({ entries });
}

// POST — học viên ghi/cập nhật cân nặng của chính mình theo ngày
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { studentId?: string; date?: string; weightKg?: number; note?: string };
    const { date } = body;
    const weightKg = Number(body.weightKg);

    if (!date || !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Ngày không hợp lệ (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
      return NextResponse.json({ error: "Cân nặng không hợp lệ" }, { status: 400 });
    }

    const target = await resolveTarget(auth.user.id, auth.user.role, body.studentId ?? null);
    if (!target.ok) {
      return NextResponse.json({ error: "Không có quyền sửa dữ liệu này" }, { status: 403 });
    }

    const dateVal = new Date(date + "T00:00:00.000Z");
    const note = body.note?.trim() || null;

    const saved = await prisma.weightEntry.upsert({
      where: { studentId_date: { studentId: target.id, date: dateVal } },
      create: { studentId: target.id, date: dateVal, weightKg, note },
      update: { weightKg, note },
      select: { date: true, weightKg: true, note: true },
    });

    return NextResponse.json({
      ok: true,
      entry: { date: saved.date.toISOString().slice(0, 10), weightKg: saved.weightKg, note: saved.note },
    });
  } catch (error) {
    console.error("[weight POST]", error);
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
  }
}

// DELETE ?date=YYYY-MM-DD — xoá bản ghi của chính mình
export async function DELETE(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
  }

  const target = await resolveTarget(auth.user.id, auth.user.role, req.nextUrl.searchParams.get("studentId"));
  if (!target.ok) {
    return NextResponse.json({ error: "Không có quyền xoá dữ liệu này" }, { status: 403 });
  }

  try {
    await prisma.weightEntry.deleteMany({
      where: { studentId: target.id, date: new Date(date + "T00:00:00.000Z") },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Lỗi máy chủ" }, { status: 500 });
  }
}
