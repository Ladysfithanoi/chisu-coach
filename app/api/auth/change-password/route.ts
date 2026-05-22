import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { verifySession, COOKIE_NAME } from "@/lib/jwt";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  let session;
  try {
    session = await verifySession(token);
  } catch {
    return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ" }, { status: 401 });
  }

  try {
    const body = await req.json() as {
      currentPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: "Vui lòng điền đầy đủ thông tin" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Mật khẩu mới phải có ít nhất 6 ký tự" }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "Xác nhận mật khẩu không khớp" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.sub } });
    if (!user) {
      return NextResponse.json({ error: "Tài khoản không tồn tại" }, { status: 404 });
    }

    if (user.currentSessionToken !== session.sid) {
      return NextResponse.json(
        { error: "Tài khoản của bạn đang được đăng nhập ở một thiết bị khác!", kicked: true },
        { status: 401 }
      );
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, currentSessionToken: null },
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: "Lỗi máy chủ, vui lòng thử lại" }, { status: 500 });
  }
}
