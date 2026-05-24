import { NextRequest, NextResponse } from "next/server";
import { FOODS } from "@/lib/foods-data";
import { getAuth } from "@/lib/auth";

// Always read env vars fresh — never use build-time cached values
export const dynamic = "force-dynamic";

// Comma-separated keys: GEMINI_API_KEYS=key1,key2,key3
const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean)
  : [];

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

// Shuffle a copy of the foods array — Fisher-Yates — returns new array, never mutates original
function shuffleFoods<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Build system instruction fresh each request with shuffled food order.
// Shuffling forces Gemini to scan from a different entry point each call,
// ensuring variety even at low temperature.
function buildSystemInstruction(): string {
  const foodsJson = JSON.stringify(shuffleFoods(FOODS));
  return `BẠN LÀ MỘT CHUYÊN GIA DINH DƯỠNG SỐ HÓA CHÍNH XÁC CAO — một engine tính toán thực đơn siêu chính xác dành cho người Việt. Người dùng đã xác nhận và điều chỉnh chỉ số mục tiêu dinh dưỡng. Bạn BẮT BUỘC phải lấy đúng các con số đó (Tổng kcal, P, F, C) trong tin nhắn của khách làm mục tiêu cứng để thiết kế thực đơn.

MẢNG DỮ LIỆU THỰC PHẨM (nguồn: foods-data.ts — toàn bộ 526 món chuẩn Việt Nam):
${foodsJson}

YÊU CẦU TOÁN HỌC GÁC CỔNG (KHÔNG ĐƯỢC VI PHẠM):
- Khi bốc khối lượng (gram) cho từng thực phẩm, tính macro theo đúng công thức: giá_trị_100g × (gram / 100).
- Tổng cộng macro CỦA TẤT CẢ CÁC BỮA TRONG NGÀY phải khớp sát với mục tiêu khách nhập: sai số tối đa cho phép là 5% cho từng chỉ số (kcal, Protein, Fat, Carbs).
- TUYỆT ĐỐI KHÔNG tự bịa hay làm tròn ẩu số macro khác với giá trị tra cứu trong mảng dữ liệu trên (nguồn chuẩn USDA / Bảng thành phần thực phẩm Việt Nam).

QUY TẮC BẮT BUỘC:
- QUY TẮC 1 (KHÓA DATA GỐC): Chỉ được dùng thực phẩm có tên trong mảng trên. Giá trị macro/100g phải lấy đúng từ data, không sáng tác thực phẩm mới hay giá trị mới.
- QUY TẮC 2 (ƯU TIÊN BỮA SÁNG VIỆT NAM): Nếu từ 3 bữa trở lên, Bữa 1 (Sáng) bắt buộc ưu tiên: Bún, Phở, Xôi, Bánh mì, Bánh bao. Hạn chế cơm nấu phức tạp ở bữa sáng.
- QUY TẮC 3 (ĐA DẠNG HÓA - CHỐNG TRÙNG LẶP): Các thực phẩm/món ăn giữa các bữa trong cùng một ngày PHẢI KHÁC NHAU. Mỗi lần sinh thực đơn mới phải dùng tổ hợp thực phẩm KHÁC HOÀN TOÀN so với các lần trước: thay loại tinh bột (cơm lứt ↔ khoai lang ↔ bún ↔ ngô ↔ bánh mì), thay nguồn protein (gà ↔ cá ↔ tôm ↔ bò ↔ trứng ↔ đậu hũ), thay rau xanh, thay cách chế biến để thực đơn mới mẻ và không nhàm chán.
- QUY TẮC 4 (ĐẦU RA CẤU TRÚC): Trả về CHỈ JSON hợp lệ theo schema sau, không markdown, không giải thích văn bản:
[{"mealName":"Bữa 1 - Sáng (7:00)","name":"Tên món 150g + Tên món 2 200g","calories":500,"protein":35,"fat":15,"carbs":55}]`;
}

// HTTP status codes that are transient — skip to next key instead of failing hard
function isRetryableStatus(status: number): boolean {
  return [400, 429, 500, 503].includes(status);
}

async function callGemini(prompt: string): Promise<string> {
  if (API_KEYS.length === 0) {
    throw new Error(
      "Chưa cấu hình GEMINI_API_KEYS trong .env.local (định dạng: key1,key2,...)"
    );
  }

  let lastStatus = 0;

  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i];

    let response: Response;
    try {
      response = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: buildSystemInstruction() }],
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
      });
    } catch (networkErr) {
      console.log(`[Gemini] Key #${i + 1} lỗi mạng, thử key tiếp theo:`, networkErr);
      continue;
    }

    if (isRetryableStatus(response.status)) {
      console.log(
        `[Gemini] Key #${i + 1} trả về HTTP ${response.status}, thử key tiếp theo`
      );
      lastStatus = response.status;
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API lỗi HTTP ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini không trả về nội dung hợp lệ");
    }

    return text;
  }

  throw new Error(
    `Tất cả ${API_KEYS.length} key đều không khả dụng (lỗi cuối: HTTP ${lastStatus}). Vui lòng thêm key mới hoặc thử lại sau.`
  );
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.kicked
          ? "Tài khoản của bạn đang được đăng nhập ở một thiết bị khác!"
          : "Chưa đăng nhập",
        kicked: auth.kicked,
      },
      { status: 401 }
    );
  }

  try {
    const body = await req.json() as { prompt?: string };
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Thiếu hoặc sai định dạng tham số 'prompt'" },
        { status: 400 }
      );
    }

    const result = await callGemini(prompt.trim());
    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định từ Gemini";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
