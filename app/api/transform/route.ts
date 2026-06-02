import { NextRequest, NextResponse } from "next/server";
import { getAuth, resolveStudentTarget, ROLES } from "@/lib/auth";
import { deleteFromDrive, parseDriveFileId } from "@/lib/drive";
import prisma from "@/lib/prisma";

// Transform là tư liệu PT quản lý (trước/sau, để lưu trữ & sale) — chỉ PT + Admin.
function isStaff(role: string): boolean {
  return role === ROLES.PT || role === ROLES.ADMIN;
}

// GET ?studentId= — danh sách ảnh transform của học viên
export async function GET(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }
  if (!isStaff(auth.user.role)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const target = await resolveStudentTarget(auth.user.id, auth.user.role, req.nextUrl.searchParams.get("studentId"));
  if (!target.ok) return NextResponse.json({ error: "Không có quyền xem" }, { status: 403 });

  const rows = await prisma.transformPhoto.findMany({
    where: { studentId: target.id },
    orderBy: { takenAt: "desc" },
    select: { id: true, photoUrl: true, takenAt: true, label: true, createdAt: true },
  });

  const photos = rows.map((r) => ({
    id: r.id,
    photoUrl: r.photoUrl,
    takenAt: r.takenAt ? r.takenAt.toISOString().slice(0, 10) : null,
    label: r.label,
  }));
  return NextResponse.json({ photos });
}

// POST — thêm ảnh transform (chỉ PT + Admin)
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }
  if (!isStaff(auth.user.role)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  try {
    const body = (await req.json()) as {
      studentId?: string;
      photoUrl?: string;
      takenAt?: string;
      label?: string;
    };

    if (!body.photoUrl?.trim()) return NextResponse.json({ error: "Thiếu ảnh" }, { status: 400 });

    const target = await resolveStudentTarget(auth.user.id, auth.user.role, body.studentId);
    if (!target.ok) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

    const photo = await prisma.transformPhoto.create({
      data: {
        studentId: target.id,
        uploadedById: auth.user.id,
        photoUrl: body.photoUrl.trim(),
        takenAt: body.takenAt && /^\d{4}-\d{2}-\d{2}$/.test(body.takenAt) ? new Date(body.takenAt + "T00:00:00.000Z") : null,
        label: body.label?.trim() || null,
      },
      select: { id: true, photoUrl: true, takenAt: true, label: true },
    });

    return NextResponse.json({
      ok: true,
      photo: { ...photo, takenAt: photo.takenAt ? photo.takenAt.toISOString().slice(0, 10) : null },
    });
  } catch (error) {
    console.error("[transform POST]", error);
    return NextResponse.json({ error: "Lỗi máy chủ" }, { status: 500 });
  }
}

// DELETE ?id=
export async function DELETE(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }
  if (!isStaff(auth.user.role)) return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

  const photo = await prisma.transformPhoto.findUnique({ where: { id }, select: { studentId: true, photoUrl: true } });
  if (!photo) return NextResponse.json({ ok: true });

  const target = await resolveStudentTarget(auth.user.id, auth.user.role, photo.studentId);
  if (!target.ok) return NextResponse.json({ error: "Không có quyền xoá" }, { status: 403 });

  await prisma.transformPhoto.delete({ where: { id } });

  // Xoá luôn ảnh trên Drive để không rác chiếm dung lượng (best-effort).
  const fileId = parseDriveFileId(photo.photoUrl);
  if (fileId) await deleteFromDrive(fileId);

  return NextResponse.json({ ok: true });
}
