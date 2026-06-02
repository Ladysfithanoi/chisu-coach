import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuth, resolveStudentTarget } from "@/lib/auth";
import { downloadFromDrive, toPhotoRef } from "@/lib/drive";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/image/<fileId> — proxy serve ảnh từ Drive, có kiểm tra quyền.
// Ảnh không public: phải đăng nhập VÀ có quyền với học viên sở hữu ảnh.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/image/[id]">) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Thiếu id" }, { status: 400 });

  // Tra fileId ngược về học viên sở hữu (trong foodLog hoặc transformPhoto).
  const ref = toPhotoRef(id);
  const [log, transform] = await Promise.all([
    prisma.foodLog.findFirst({ where: { photoUrl: ref }, select: { studentId: true } }),
    prisma.transformPhoto.findFirst({ where: { photoUrl: ref }, select: { studentId: true } }),
  ]);
  const ownerStudentId = log?.studentId ?? transform?.studentId;
  if (!ownerStudentId) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });

  const target = await resolveStudentTarget(auth.user.id, auth.user.role, ownerStudentId);
  if (!target.ok) return NextResponse.json({ error: "Không có quyền xem ảnh" }, { status: 403 });

  try {
    const { bytes, mimeType } = await downloadFromDrive(id);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        // Riêng tư + cho trình duyệt cache 1 giờ (ảnh là bất biến theo fileId).
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[image GET]", id, error);
    return NextResponse.json({ error: "Lỗi tải ảnh" }, { status: 502 });
  }
}
