import { NextRequest, NextResponse } from "next/server";
import { FOODS, type FoodItem } from "@/lib/foods-data";
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

// ─── Fiber-First Carb Algorithm ───────────────────────────────────────────────

const VEG_KEYWORDS_EN = [
  'Leaves', 'Chayote', 'Kohlrabi', 'Broccoli', 'Cauliflower', 'Cucumber', 'Celery',
  'Asparagus', 'Spinach', 'Tomato', 'Carrot', 'Melon', 'Corn', 'Eggplant', 'Lettuce',
  'Kale', 'Pumpkin', 'Gourd', 'Cabbage', 'Greens', 'Sprouts', 'Pachyrrhizus', 'Mustard', 'Napa',
];
const VEG_KEYWORDS_VN = [
  'Rau ', 'Cải ', 'Cải bắp', 'Cải thảo', 'Cải xoăn', 'Súp lơ',
  'Dưa chuột', 'Cần tây', 'Măng tây', 'Cà tím', 'Xà lách',
  'Cà chua', 'Cà rốt', 'Ngô ', 'Giá đỗ', 'Su su', 'Su hào',
  'Củ đậu', 'Mướp', 'Bầu', 'Bí xanh', 'Bí đao', 'Bí đỏ',
];

function isVegetable(food: FoodItem): boolean {
  const nameEn = food.nameEn ?? '';
  return (
    VEG_KEYWORDS_EN.some(k => nameEn.includes(k)) ||
    VEG_KEYWORDS_VN.some(k => food.name.includes(k))
  );
}

interface VegWithFiber extends FoodItem { fiber: number; }

interface FiberPlan {
  targetFiber: number;
  totalFiber: number;
  veggieCarbs: number;
  remainingCarbs: number;
  lines: string[];
}

function buildFiberCarbPlan(targetCalories: number, targetCarbs: number): FiberPlan {
  // BƯỚC A — tính lượng chất xơ bắt buộc
  const targetFiber = Math.round((targetCalories / 1000) * 14);

  // BƯỚC B — lấy rau xanh ngẫu nhiên không trùng lặp
  const vegPool = shuffleFoods(
    FOODS.filter((f): f is VegWithFiber =>
      isVegetable(f) && typeof f.fiber === 'number' && f.fiber > 0
    )
  );

  const selected: Array<{ food: VegWithFiber; grams: number }> = [];
  let accumFiber = 0;
  let accumCarbs = 0;

  for (const veg of vegPool) {
    if (accumFiber >= targetFiber) break;
    const fiberNeeded = targetFiber - accumFiber;
    const gramsToTarget = Math.ceil((fiberNeeded / veg.fiber) * 100);
    // Mỗi loại rau: tối thiểu 80g, tối đa 200g (khẩu phần thực tế)
    const grams = Math.max(80, Math.min(gramsToTarget, 200));

    selected.push({ food: veg, grams });
    accumFiber += veg.fiber * grams / 100;
    accumCarbs += veg.carbs * grams / 100;
  }

  // BƯỚC C — tính hiệu số Carbs còn lại sau rau
  const veggieCarbs = Math.round(accumCarbs);
  const remainingCarbs = targetCarbs - veggieCarbs;

  const lines = selected.map(({ food, grams }) =>
    `    • ${food.name} ${grams}g  (fiber: ${(food.fiber * grams / 100).toFixed(1)}g, carbs: ${(food.carbs * grams / 100).toFixed(1)}g)`
  );

  return {
    targetFiber,
    totalFiber: Math.round(accumFiber * 10) / 10,
    veggieCarbs,
    remainingCarbs,
    lines,
  };
}

// Build system instruction fresh each request with shuffled food order.
// Shuffling forces Gemini to scan from a different entry point each call,
// ensuring variety even at low temperature.
// macros (optional) — when provided, injects the Fiber-First Carb lever as Rule 5.
function buildSystemInstruction(
  macros?: { calories: number; protein: number; fat: number; carbs: number },
  mealCount?: number
): string {
  const foodsJson = JSON.stringify(shuffleFoods(FOODS));

  // Rule 5 — Khóa số bữa ăn (khi có mealCount)
  const mealCountNote = mealCount === 2
    ? "\n  * 2 bữa: Bữa Sáng + Bữa Tối. TUYỆT ĐỐI không có Bữa 3 hay bữa phụ nào."
    : mealCount === 3
    ? "\n  * 3 bữa: Bữa Sáng + Bữa Trưa + Bữa Tối. TUYỆT ĐỐI không có Bữa 4."
    : "";
  const mealCountRuleBlock = mealCount ? `
- QUY TẮC 5 — KHÓA SỐ BỮA ĂN (BẮT BUỘC TUYỆT ĐỐI):
  * Mảng JSON phải có ĐÚNG ${mealCount} phần tử — không thêm, không bớt.
  * Không tự ý ghép thêm bữa phụ, bữa xế, snack vào danh sách.${mealCountNote}` : "";

  // Rule 5/6 — Fiber-First Carb Algorithm
  const fiberRuleNum = mealCount ? 6 : 5;
  let fiberRuleBlock = '';
  if (macros && macros.calories > 0) {
    const plan = buildFiberCarbPlan(macros.calories, macros.carbs);
    const stepD = plan.remainingCarbs > 0
      ? `ĐÈN XANH — Bổ sung tinh bột phức hợp (cơm lứt, khoai lang, yến mạch, bún gạo lứt...) để bù đúng ${plan.remainingCarbs}g carbs còn thiếu.`
      : `KHÓA VAN TUYỆT ĐỐI — Rau xanh đã đạt/vượt quota carbs (${plan.veggieCarbs}g ≥ ${macros.carbs}g). TUYỆT ĐỐI không thêm bất kỳ tinh bột nào vào thực đơn ngày hôm đó.`;

    fiberRuleBlock = `
- QUY TẮC ${fiberRuleNum} — THUẬT TOÁN ĐÒN BẨY CARBS / FIBER-FIRST (BẮT BUỘC, GHI ĐÈ MỌI LOGIC KHÁC):
  [A] Fiber mục tiêu ngày: ${plan.targetFiber}g  (= ${macros.calories} kcal × 14 ÷ 1000)
  [B] Danh sách rau xanh BẮT BUỘC đưa vào thực đơn — mỗi loại chỉ xuất hiện trong 1 bữa, không trùng giữa các bữa:
${plan.lines.join('\n')}
       → Tổng fiber từ rau: ${plan.totalFiber}g | Tổng carbs từ rau: ${plan.veggieCarbs}g
  [C] Carbs mục tiêu ngày: ${macros.carbs}g | Hiệu số còn lại sau rau: ${plan.remainingCarbs}g
  [D] ${stepD}`;
  }

  return `BẠN LÀ MỘT CHUYÊN GIA DINH DƯỠNG SỐ HÓA CHÍNH XÁC CAO — một engine tính toán thực đơn siêu chính xác dành cho người Việt. Người dùng đã xác nhận và điều chỉnh chỉ số mục tiêu dinh dưỡng. Bạn BẮT BUỘC phải lấy đúng các con số đó (Tổng kcal, P, F, C) trong tin nhắn của khách làm mục tiêu cứng để thiết kế thực đơn.

MẢNG DỮ LIỆU THỰC PHẨM (nguồn: foods-data.ts — toàn bộ 526 món chuẩn Việt Nam):
${foodsJson}

YÊU CẦU TOÁN HỌC GÁC CỔNG (KHÔNG ĐƯỢC VI PHẠM):
- Khi bốc khối lượng (gram) cho từng thực phẩm, tính macro theo đúng công thức: giá_trị_100g × (gram / 100).
- Tổng cộng macro CỦA TẤT CẢ CÁC BỮA TRONG NGÀY phải khớp mục tiêu với sai số tuyệt đối: ±5g cho Protein/Fat/Carbs — ±30 kcal cho Calo. TUYỆT ĐỐI không để Protein vọt gấp đôi mục tiêu.
- TUYỆT ĐỐI KHÔNG tự bịa hay làm tròn ẩu số macro khác với giá trị tra cứu trong mảng dữ liệu trên (nguồn chuẩn USDA / Bảng thành phần thực phẩm Việt Nam).

QUY TẮC BẮT BUỘC:
- QUY TẮC 1 (KHÓA DATA GỐC): Chỉ được dùng thực phẩm có tên trong mảng trên. Giá trị macro/100g phải lấy đúng từ data, không sáng tác thực phẩm mới hay giá trị mới.
- QUY TẮC 2 (ƯU TIÊN BỮA SÁNG VIỆT NAM): Nếu từ 3 bữa trở lên, Bữa 1 (Sáng) bắt buộc ưu tiên: Bún, Phở, Xôi, Bánh mì, Bánh bao. Hạn chế cơm nấu phức tạp ở bữa sáng.
- QUY TẮC 3 (ĐA DẠNG HÓA - CHỐNG TRÙNG LẶP): Các thực phẩm/món ăn giữa các bữa trong cùng một ngày PHẢI KHÁC NHAU. Mỗi lần sinh thực đơn mới phải dùng tổ hợp thực phẩm KHÁC HOÀN TOÀN so với các lần trước: thay loại tinh bột (cơm lứt ↔ khoai lang ↔ bún ↔ ngô ↔ bánh mì), thay nguồn protein (gà ↔ cá ↔ tôm ↔ bò ↔ trứng ↔ đậu hũ), thay rau xanh, thay cách chế biến để thực đơn mới mẻ và không nhàm chán.
- QUY TẮC 4 (ĐẦU RA CẤU TRÚC): Trả về CHỈ JSON hợp lệ theo schema sau, không markdown, không giải thích văn bản:
[{"mealName":"Bữa 1 - Sáng (7:00)","name":"Tên món 150g + Tên món 2 200g","calories":500,"protein":35,"fat":15,"carbs":55}]${mealCountRuleBlock}${fiberRuleBlock}`;
}

// HTTP status codes that are transient — skip to next key instead of failing hard
function isRetryableStatus(status: number): boolean {
  return [400, 429, 500, 503].includes(status);
}

// Lightweight parser for backend validation — mirrors frontend parseAiResponse logic
function tryParseAiMeals(text: string): Array<{ protein: number; fat: number; carbs: number; calories: number }> | null {
  try {
    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(parsed)) return null;
    return (parsed as Record<string, unknown>[]).map(m => ({
      protein: Number(m.protein ?? 0),
      fat: Number(m.fat ?? 0),
      carbs: Number(m.carbs ?? 0),
      calories: Number(m.calories ?? 0),
    }));
  } catch {
    return null;
  }
}

async function callGemini(
  prompt: string,
  macros?: { calories: number; protein: number; fat: number; carbs: number },
  mealCount?: number
): Promise<string> {
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
            parts: [{ text: buildSystemInstruction(macros, mealCount) }],
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
    const body = await req.json() as {
      prompt?: string;
      macros?: { calories: number; protein: number; fat: number; carbs: number };
      mealCount?: number;
    };
    const { prompt, macros, mealCount } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Thiếu hoặc sai định dạng tham số 'prompt'" },
        { status: 400 }
      );
    }

    const fullMacros = macros && macros.calories > 0 ? macros : undefined;
    const validMealCount = mealCount && mealCount >= 2 && mealCount <= 5 ? mealCount : undefined;

    let rawResult = await callGemini(prompt.trim(), fullMacros, validMealCount);

    // Validation: bắt lỗi số bữa sai và protein vọt — retry 1 lần nếu vi phạm
    if (fullMacros && validMealCount) {
      const parsed = tryParseAiMeals(rawResult);
      if (parsed) {
        const totalProtein = parsed.reduce((s, m) => s + m.protein, 0);
        const mealCountWrong = parsed.length !== validMealCount;
        const proteinWrong = totalProtein > fullMacros.protein + 15;

        if (mealCountWrong || proteinWrong) {
          const issues: string[] = [];
          if (mealCountWrong) issues.push(`số bữa = ${parsed.length} (yêu cầu ${validMealCount})`);
          if (proteinWrong) issues.push(`Protein tổng = ${Math.round(totalProtein)}g (mục tiêu ${fullMacros.protein}g)`);
          console.log(`[Gemini] Validation failed: ${issues.join(", ")}. Retrying…`);

          const retryPrompt = `${prompt.trim()}\n\nCẢNH BÁO: Lần trước AI sai — ${issues.join(" và ")}. Lần này BẮT BUỘC: đúng ${validMealCount} bữa, Protein tổng ≤ ${fullMacros.protein + 5}g.`;
          rawResult = await callGemini(retryPrompt, fullMacros, validMealCount);
        }
      }
    }

    return NextResponse.json({ result: rawResult });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định từ Gemini";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
