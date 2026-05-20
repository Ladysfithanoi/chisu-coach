import { NextRequest, NextResponse } from "next/server";

// Comma-separated keys: GEMINI_API_KEYS=key1,key2,key3
const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean)
  : [];

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

async function callGemini(prompt: string): Promise<string> {
  if (API_KEYS.length === 0) {
    throw new Error(
      "Chưa cấu hình GEMINI_API_KEYS trong .env.local (định dạng: key1,key2,...)"
    );
  }

  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i];

    const response = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }),
    });

    // Rate-limited or quota exceeded → try next key
    if (response.status === 429 || response.status === 400) {
      console.log(
        `[Gemini] Key #${i + 1} bị giới hạn (HTTP ${response.status}), thử key tiếp theo`
      );
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

    return text; // success — stop here
  }

  throw new Error(
    `Tất cả ${API_KEYS.length} key đã hết hạn mức (HTTP 429). Vui lòng thêm key mới vào GEMINI_API_KEYS.`
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
