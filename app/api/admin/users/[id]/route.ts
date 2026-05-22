import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAdminAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Không có quyền truy cập" }, { status: auth.kicked ? 401 : 403 });
  }

  const { id } = await params;

  if (id === auth.user.id) {
    return NextResponse.json({ error: "Không thể xóa tài khoản đang đăng nhập" }, { status: 400 });
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });
  }
}
