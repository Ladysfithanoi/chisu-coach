import { NextRequest, NextResponse } from "next/server";
import { FOODS } from "@/lib/foods-data";

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

// Build system instruction fresh each request with shuffled food order
// Shuffling the array forces Gemini to scan from a different starting point each call,
// which — combined with higher temperature — breaks the repetition pattern completely.
function buildSystemInstruction(): string {
  const foodsJson = JSON.stringify(shuffleFoods(FOODS));
  return `Cậu là một thuật toán toán học xếp hình thực đơn siêu tốc dành cho người Việt. Nhiệm vụ của cậu là dựa trên dữ liệu Khách hàng nhập vào (Mục tiêu Calo tổng, Tỷ lệ Macro P-C-F, Số lượng bữa ăn) để LỰA CHỌN các món ăn phù hợp TỪ MẢNG DỮ LIỆU THỰC PHẨM ĐƯỢC CUNG CẤP DƯỚI ĐÂY.

MẢNG DỮ LIỆU THỰC PHẨM (nguồn: foods-data.ts — toàn bộ 526 món chuẩn Việt Nam):
${foodsJson}

QUY TẮC BẮT BUỘC:
- QUY TẮC 1 (KHÓA DATA GỐC): KHÔNG ĐƯỢC TỰ CHẾ hay sáng tác bất kỳ món ăn mới nào nằm ngoài mảng dữ liệu trên. Chỉ được dùng đúng tên món có trong data, tính toán định lượng (gram) và nhân hệ số macro theo công thức: giá_trị_100g × (gram / 100).
- QUY TẮC 2 (ƯU TIÊN BỮA SÁNG VIỆT NAM): Nếu khách chọn TỪ 3 BỮA TRỞ LÊN, tại Bữa 1 (Bữa sáng) bắt buộc ưu tiên cao nhất các món ăn nhanh phổ biến có trong data như: Bún, Phở, Xôi, Bánh mì, Bánh bao. Tuyệt đối hạn chế cơm nấu phức tạp ở bữa sáng.
- QUY TẮC 3 (TÍNH TOÁN SAI SỐ): Chạy thuật toán so khớp nhanh nhất để tổng Calo và Macro của các món được chọn cộng lại tiệm cận gần nhất với mục tiêu của khách. Sai số calo cho phép: ±50 kcal.
- QUY TẮC 4 (ĐA DẠNG HÓA - ROTATION): Mỗi lần nhận lệnh tạo thực đơn, cậu PHẢI chủ động xáo trộn và lựa chọn các tổ hợp món ăn KHÁC NHAU. Không được lặp lại nguyên văn một tổ hợp cũ. Linh hoạt thay đổi các loại bún, phở, xôi khác nhau cho bữa sáng; đổi món mặn/rau/soup khác nhau cho bữa trưa và tối để thực đơn luôn mới mẻ mỗi lần tạo.
- QUY TẮC 5 (ĐẦU RA CẤU TRÚC): Trả về KẾT QUẢ CHỈ dạng JSON hoàn toàn theo schema sau, tuyệt đối không giải thích văn bản dài dòng:
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
            temperature: 0.75,
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
