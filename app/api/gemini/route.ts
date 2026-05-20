import { NextRequest, NextResponse } from "next/server";

const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter((k): k is string => Boolean(k));

let currentKeyIndex = 0;

function getNextKey(): string | null {
  if (API_KEYS.length === 0) return null;
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGeminiWithRotation(prompt: string): Promise<string> {
  if (API_KEYS.length === 0) {
    throw new Error("Chưa cấu hình Gemini API keys trong .env.local");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
    const apiKey = getNextKey();
    if (!apiKey) break;

    try {
      const response = await fetch(`${GEMINI_API_BASE}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      });

      // Rate limited hoặc quota exceeded → thử key tiếp theo
      if (response.status === 429 || response.status === 403) {
        lastError = new Error(
          `Key #${attempt + 1} bị giới hạn (HTTP ${response.status}), chuyển sang key tiếp theo`
        );
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API lỗi ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error("Gemini không trả về nội dung hợp lệ");
      }

      return text;
    } catch (error) {
      // Nếu là lỗi rate-limit đã xử lý → tiếp tục vòng lặp
      if (lastError && error === lastError) continue;
      throw error;
    }
  }

  throw lastError ?? new Error("Tất cả Gemini API keys đã hết hạn mức, vui lòng thêm key mới");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      return NextResponse.json(
        { error: "Thiếu hoặc sai định dạng tham số 'prompt'" },
        { status: 400 }
      );
    }

    const result = await callGeminiWithRotation(prompt.trim());
    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định từ Gemini";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
