import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPTAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Xác nhận học viên thuộc về PT đang đăng nhập
async function ownsStudent(ptId: string, studentId: string): Promise<boolean> {
  const s = await prisma.user.findFirst({
    where: { id: studentId, ptId, role: "STUDENT" },
    select: { id: true },
  });
  return !!s;
}

// PUT — PT sửa thông tin học viên của mình
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getPTAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const { id } = await params;
  if (!(await ownsStudent(auth.user.id, id))) {
    return NextResponse.json({ error: "Học viên không thuộc quyền quản lý" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { name?: string; email?: string; password?: string; medicalConditions?: string };
    const { name, email, password, medicalConditions } = body;

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Họ tên và email không được để trống" }, { status: 400 });
    }

    const conflict = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), NOT: { id } },
    });
    if (conflict) {
      return NextResponse.json({ error: "Email này đã được sử dụng bởi tài khoản khác" }, { status: 400 });
    }

    const updateData: { name: string; email: string; currentSessionToken: null; medicalConditions: string | null; password?: string } = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      currentSessionToken: null,
      medicalConditions: medicalConditions?.trim() || null,
    };

    if (password && password.trim().length > 0) {
      if (password.length < 6) {
        return NextResponse.json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự" }, { status: 400 });
      }
      updateData.password = await bcrypt.hash(password, 12);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, medicalConditions: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      student: { ...updated, createdAt: updated.createdAt.toISOString() },
    });
  } catch {
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
  }
}

// DELETE — PT xóa học viên của mình (thực đơn liên quan tự xóa theo cascade)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getPTAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const { id } = await params;
  if (!(await ownsStudent(auth.user.id, id))) {
    return NextResponse.json({ error: "Học viên không thuộc quyền quản lý" }, { status: 403 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Không tìm thấy học viên" }, { status: 404 });
  }
}
