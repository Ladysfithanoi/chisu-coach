import { NextRequest, NextResponse } from "next/server";

// Always read env vars fresh — never use build-time cached values
export const dynamic = "force-dynamic";

// Comma-separated keys: GEMINI_API_KEYS=key1,key2,key3
const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean)
  : [];

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
      });
    } catch (networkErr) {
      // Network-level failure (DNS, timeout, etc.) — skip to next key
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
      // Non-retryable error (401 invalid key, 403 permission, etc.) — fail immediately
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

    return text; // success — stop here
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
