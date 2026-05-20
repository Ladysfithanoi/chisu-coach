import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { verifySession, COOKIE_NAME } from "@/lib/jwt";
import prisma from "@/lib/prisma";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const session = await verifySession(token);
    if (session.role !== "ADMIN") return null;
    return session;
  } catch {
    return null;
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json() as { name?: string; email?: string; password?: string };
    const { name, email, password } = body;

    if (!name?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Họ tên và email không được để trống" }, { status: 400 });
    }

    const conflict = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), NOT: { id } },
    });
    if (conflict) {
      return NextResponse.json({ error: "Email này đã được sử dụng bởi tài khoản khác" }, { status: 400 });
    }

    const updateData: {
      name: string;
      email: string;
      currentSessionToken: null;
      password?: string;
    } = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      currentSessionToken: null,
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
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return NextResponse.json({
      ok: true,
      user: { ...updated, createdAt: updated.createdAt.toISOString() },
    });
  } catch {
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
  }
}
