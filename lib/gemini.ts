// Gọi Gemini API dùng chung — xoay vòng nhiều key, hỗ trợ text + ảnh (vision).

const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",").map((k) => k.trim()).filter(Boolean)
  : [];

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

function isRetryableStatus(status: number): boolean {
  return [400, 429, 500, 503].includes(status);
}

export function stripJsonFences(text: string): string {
  return text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
}

export async function callGemini(opts: {
  model: string;
  parts: GeminiPart[];
  systemInstruction?: string;
  generationConfig?: Record<string, unknown>;
}): Promise<string> {
  if (API_KEYS.length === 0) {
    throw new Error("Chưa cấu hình GEMINI_API_KEYS trong .env.local");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  let lastStatus = 0;

  for (let i = 0; i < API_KEYS.length; i++) {
    let res: Response;
    try {
      res = await fetch(`${url}?key=${API_KEYS[i]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(opts.systemInstruction ? { system_instruction: { parts: [{ text: opts.systemInstruction }] } } : {}),
          contents: [{ parts: opts.parts }],
          generationConfig: opts.generationConfig ?? {},
        }),
      });
    } catch (networkErr) {
      console.log(`[Gemini] Key #${i + 1} lỗi mạng:`, networkErr);
      continue;
    }
    if (isRetryableStatus(res.status)) {
      console.log(`[Gemini] Key #${i + 1} HTTP ${res.status}, thử key tiếp`);
      lastStatus = res.status;
      continue;
    }
    if (!res.ok) {
      throw new Error(`Gemini API lỗi HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini không trả về nội dung hợp lệ");
    return text;
  }
  throw new Error(`Tất cả ${API_KEYS.length} key đều không khả dụng (lỗi cuối: HTTP ${lastStatus}).`);
}
