import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { callGemini, stripJsonFences } from "@/lib/gemini";

export const dynamic = "force-dynamic";

const SYSTEM = `Bạn là chuyên gia dinh dưỡng. Nhìn ảnh BỮA ĂN và ước lượng cho TOÀN BỘ phần ăn trong ảnh.
Trả về DUY NHẤT JSON thuần (không markdown, không giải thích):
{"name":"tên món ăn tiếng Việt ngắn gọn","calories":số_kcal,"protein":gam,"fat":gam,"carbs":gam,"confidence":"cao|trung bình|thấp"}
Quy tắc:
- Ước lượng theo khẩu phần THỰC TẾ nhìn thấy trong ảnh (không phải trên 100g).
- calories/protein/fat/carbs là SỐ NGUYÊN (gram / kcal).
- Nếu ảnh không phải đồ ăn: {"name":"Không nhận diện được món ăn","calories":0,"protein":0,"fat":0,"carbs":0,"confidence":"thấp"}`;

interface ScanResult {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  confidence?: string;
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.kicked ? "Phiên đăng nhập ở thiết bị khác" : "Chưa đăng nhập", kicked: auth.kicked },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as { imageBase64?: string; mimeType?: string };
    let { imageBase64 } = body;
    const mimeType = body.mimeType || "image/jpeg";

    if (!imageBase64) {
      return NextResponse.json({ error: "Thiếu ảnh" }, { status: 400 });
    }
    // Bỏ tiền tố data URL nếu có
    const comma = imageBase64.indexOf(",");
    if (imageBase64.startsWith("data:") && comma >= 0) {
      imageBase64 = imageBase64.slice(comma + 1);
    }

    const raw = await callGemini({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM,
      parts: [
        { text: "Phân tích bữa ăn trong ảnh và trả về JSON theo đúng định dạng." },
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
      ],
      // Tắt "thinking" của gemini-2.5-flash: task chỉ là trích JSON, không cần reasoning.
      // Để bật, thinking ăn hết maxOutputTokens với ảnh món ăn thật → JSON cụt → parse lỗi.
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let parsed: ScanResult;
    try {
      parsed = JSON.parse(stripJsonFences(raw)) as ScanResult;
    } catch {
      return NextResponse.json({ error: "AI trả về dữ liệu không hợp lệ", raw }, { status: 502 });
    }

    const result: ScanResult = {
      name: String(parsed.name ?? "Món ăn").trim() || "Món ăn",
      calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
      protein: Math.max(0, Math.round(Number(parsed.protein) || 0)),
      fat: Math.max(0, Math.round(Number(parsed.fat) || 0)),
      carbs: Math.max(0, Math.round(Number(parsed.carbs) || 0)),
      confidence: parsed.confidence ?? "trung bình",
    };

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi quét ảnh";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
