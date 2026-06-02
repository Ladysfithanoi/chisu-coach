import { NextRequest, NextResponse } from "next/server";
import { getAuth, resolveStudentTarget } from "@/lib/auth";
import { uploadToDrive, toPhotoRef } from "@/lib/drive";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB sau khi đã nén phía client
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

// POST — upload 1 ảnh lên Drive, trả về tham chiếu "drive:<fileId>" để lưu vào DB.
// Body JSON: { imageBase64, mimeType?, studentId? }
export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Chưa đăng nhập", kicked: auth.kicked }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { imageBase64?: string; mimeType?: string; studentId?: string };
    let { imageBase64 } = body;
    const mimeType = body.mimeType || "image/jpeg";

    if (!imageBase64) return NextResponse.json({ error: "Thiếu ảnh" }, { status: 400 });
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json({ error: "Định dạng ảnh không hỗ trợ" }, { status: 400 });
    }

    // Chỉ cho upload nếu có quyền ghi dữ liệu của học viên mục tiêu.
    const target = await resolveStudentTarget(auth.user.id, auth.user.role, body.studentId);
    if (!target.ok) return NextResponse.json({ error: "Không có quyền upload" }, { status: 403 });

    // Bỏ tiền tố data URL nếu có, rồi giải base64.
    const comma = imageBase64.indexOf(",");
    if (imageBase64.startsWith("data:") && comma >= 0) imageBase64 = imageBase64.slice(comma + 1);
    const bytes = new Uint8Array(Buffer.from(imageBase64, "base64"));

    if (bytes.length === 0) return NextResponse.json({ error: "Ảnh rỗng" }, { status: 400 });
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ error: "Ảnh quá lớn (tối đa 8MB sau khi nén)" }, { status: 413 });
    }

    const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const name = `${target.id}-${Date.now()}.${ext}`;
    const fileId = await uploadToDrive(bytes, mimeType, name);

    return NextResponse.json({ ok: true, photoUrl: toPhotoRef(fileId) });
  } catch (error) {
    console.error("[upload POST]", error);
    const message = error instanceof Error ? error.message : "Lỗi upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
