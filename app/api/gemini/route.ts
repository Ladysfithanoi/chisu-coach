import { NextRequest, NextResponse } from "next/server";
import { FOODS, type FoodItem } from "@/lib/foods-data";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean)
  : [];

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

function shuffleFoods<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── Food Classification ──────────────────────────────────────────────────────

const VEG_KEYWORDS_EN = [
  'Leaves', 'Chayote', 'Kohlrabi', 'Broccoli', 'Cauliflower', 'Cucumber', 'Celery',
  'Asparagus', 'Spinach', 'Tomato', 'Carrot', 'Melon', 'Eggplant', 'Lettuce',
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

type FoodCategory = 'vegetable' | 'starch' | 'protein' | 'fat' | 'dish';

function classifyFood(food: FoodItem): FoodCategory {
  if (isVegetable(food)) return 'vegetable';
  // High fat: oils, nuts, butter
  if (food.fat > 25 && food.protein < 20) return 'fat';
  // Starches: carbs dominant (>30g/100g) and protein low relative to carbs
  if (food.carbs > 30 && food.carbs > food.protein * 3) return 'starch';
  // Protein: meat, fish, eggs, tofu, legumes
  if (food.protein > 10) return 'protein';
  return 'dish';
}

// ─── Fuzzy Food Name Match ────────────────────────────────────────────────────

function findBestMatchingFood(query: string): FoodItem | null {
  const q = query.toLowerCase().trim();

  const exact = FOODS.find(f => f.name.toLowerCase() === q);
  if (exact) return exact;

  const containsFull = FOODS.filter(f => f.name.toLowerCase().includes(q));
  if (containsFull.length === 1) return containsFull[0];
  if (containsFull.length > 1)
    return containsFull.sort((a, b) => a.name.length - b.name.length)[0];

  const words = q.split(/\s+/).filter(w => w.length > 1);
  if (words.length >= 2) {
    const prefix = words.slice(0, 2).join(" ");
    const prefixMatch = FOODS.filter(f => f.name.toLowerCase().includes(prefix));
    if (prefixMatch.length > 0)
      return prefixMatch.sort((a, b) => a.name.length - b.name.length)[0];
  }

  const sigWords = words.filter(w => w.length > 2);
  if (sigWords.length > 0) {
    const allWords = FOODS.filter(f => {
      const n = f.name.toLowerCase();
      return sigWords.every(w => n.includes(w));
    });
    if (allWords.length > 0)
      return allWords.sort((a, b) => a.name.length - b.name.length)[0];
  }

  return null;
}

// ─── Meal Time Labels ─────────────────────────────────────────────────────────

const MEAL_TIMES: Record<number, string[]> = {
  2: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Tối (18:00)"],
  3: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Trưa (12:00)", "Bữa 3 - Tối (18:00)"],
  4: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Trưa (12:00)", "Bữa 3 - Chiều (15:30)", "Bữa 4 - Tối (18:00)"],
  5: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Trưa (12:00)", "Bữa 3 - Chiều (15:00)", "Bữa 4 - Tối (18:00)", "Bữa 5 - Khuya (21:00)"],
};

function getMealTimeLabel(index: number, total: number): string {
  return MEAL_TIMES[total]?.[index] ?? `Bữa ${index + 1}`;
}

// ─── Name-Only System Instruction ────────────────────────────────────────────

function buildNameOnlySystemInstruction(
  mealCount: number,
  preferences?: { likes?: string; dislikes?: string }
): string {
  // Shuffle each category so AI sees a fresh random order each request → variety
  const vegNames     = shuffleFoods(FOODS.filter(f => isVegetable(f))).map(f => f.name);
  const starchNames  = shuffleFoods(FOODS.filter(f => classifyFood(f) === 'starch')).map(f => f.name);
  const proteinNames = shuffleFoods(FOODS.filter(f => classifyFood(f) === 'protein')).map(f => f.name);
  const fatNames     = shuffleFoods(FOODS.filter(f => classifyFood(f) === 'fat')).map(f => f.name);

  const labels = MEAL_TIMES[mealCount] ?? Array.from({ length: mealCount }, (_, i) => `Bữa ${i + 1}`);

  const prefLines: string[] = [];
  if (preferences?.likes)    prefLines.push(`Thích: ${preferences.likes}`);
  if (preferences?.dislikes) prefLines.push(`Ghét/Dị ứng: ${preferences.dislikes}`);
  const prefBlock = prefLines.length > 0
    ? `\n5. SỞ THÍCH KHÁCH HÀNG:\n${prefLines.join('\n')}`
    : '';

  return `Bạn là AI gợi ý thực phẩm cho thực đơn Việt Nam. Nhiệm vụ DUY NHẤT: trả về danh sách TÊN thực phẩm cho ${mealCount} bữa — không tính toán macro, không thêm số liệu.

OUTPUT BẮT BUỘC — chỉ JSON thuần, không markdown, không giải thích:
{"meal_1":["tên1","tên2",...],"meal_2":[...],...,"meal_${mealCount}":[...]}

${mealCount} bữa lần lượt: ${labels.join(' | ')}

QUY TẮC:
1. Tên phải khớp CHÍNH XÁC với các danh sách bên dưới.
2. Mỗi bữa: 1-2 rau xanh + 1 tinh bột + 1-2 protein.
3. Không lặp thực phẩm giữa các bữa.
4. Bữa Sáng ưu tiên: Bún gạo lứt, Phở bò, Xôi gấc, Bánh mì, Cháo yến mạch, Bánh bao.${prefBlock}

DANH SÁCH RAU XANH (chọn 1-2/bữa):
${vegNames.join(', ')}

DANH SÁCH TINH BỘT (chọn 1/bữa):
${starchNames.join(', ')}

DANH SÁCH PROTEIN (chọn 1-2/bữa):
${proteinNames.join(', ')}

DANH SÁCH CHẤT BÉO (tùy chọn, chỉ khi cần thêm fat):
${fatNames.join(', ')}`;
}

// ─── Name-Only User Prompt ───────────────────────────────────────────────────

function buildNameOnlyUserPrompt(mealCount: number): string {
  return `Chọn tên thực phẩm cho ${mealCount} bữa ăn ngày hôm nay. Trả về JSON object với key meal_1 đến meal_${mealCount}. Chỉ JSON — không có text nào khác.`;
}

// ─── Parse Name-Only Response ─────────────────────────────────────────────────

function parseNameOnlyResponse(
  text: string,
  mealCount: number
): Record<string, string[]> | null {
  try {
    const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const result: Record<string, string[]> = {};
    for (let i = 1; i <= mealCount; i++) {
      const key = `meal_${i}`;
      const val = (parsed as Record<string, unknown>)[key];
      result[key] = Array.isArray(val) ? val.map(String).filter(Boolean) : [];
    }
    return result;
  } catch {
    return null;
  }
}

// ─── Nutrition Solver ─────────────────────────────────────────────────────────

interface AiMealRaw {
  mealName: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface MealSolution {
  mealName: string;
  items: Array<{ food: FoodItem; grams: number }>;
}

// Solve exact gram amounts so the meal hits per-meal macro targets.
// Priority order: Vegetables (fiber) → Starches (remaining carbs) → Proteins → Fat gap fill.
function solveMealGrams(
  mealName: string,
  foodNames: string[],
  perMealMacros: { calories: number; protein: number; fat: number; carbs: number },
  mealFiberTarget: number
): MealSolution {
  type Tagged = { food: FoodItem; category: FoodCategory };
  const tagged: Tagged[] = foodNames
    .map(n => findBestMatchingFood(n))
    .filter((f): f is FoodItem => f !== null)
    .map(f => ({ food: f, category: classifyFood(f) }));

  const vegs     = tagged.filter(t => t.category === 'vegetable');
  const starches = tagged.filter(t => t.category === 'starch');
  const proteins = tagged.filter(t => t.category === 'protein' || t.category === 'dish');
  const fats     = tagged.filter(t => t.category === 'fat');

  const items: Array<{ food: FoodItem; grams: number }> = [];
  let vegCarbs = 0, vegProtein = 0, vegFat = 0;
  let starchCarbs = 0, starchProtein = 0, starchFat = 0;
  let proteinFat = 0;

  // Step 1: Vegetables — distribute fiber target evenly across all veg
  if (vegs.length > 0) {
    const fiberPerVeg = mealFiberTarget / vegs.length;
    for (const { food } of vegs) {
      const fib = (food as FoodItem & { fiber?: number }).fiber ?? 0;
      const grams = fib > 0
        ? Math.round(Math.max(80, Math.min(200, (fiberPerVeg / fib) * 100)))
        : 100;
      items.push({ food, grams });
      vegCarbs   += food.carbs   * grams / 100;
      vegProtein += food.protein * grams / 100;
      vegFat     += food.fat     * grams / 100;
    }
  }

  // Step 2: Starches — fill remaining carbs after vegetables
  const remainingCarbs = perMealMacros.carbs - vegCarbs;
  if (starches.length > 0 && remainingCarbs > 5) {
    const carbsPerStarch = remainingCarbs / starches.length;
    for (const { food } of starches) {
      const grams = food.carbs > 0
        ? Math.round(Math.max(50, Math.min(300, (carbsPerStarch / food.carbs) * 100)))
        : 100;
      items.push({ food, grams });
      starchCarbs   += food.carbs   * grams / 100;
      starchProtein += food.protein * grams / 100;
      starchFat     += food.fat     * grams / 100;
    }
  }

  // Step 3: Proteins — fill remaining protein after veg + starch contributions
  const proteinConsumed = vegProtein + starchProtein;
  const remainingProtein = Math.max(perMealMacros.protein - proteinConsumed, 5);
  if (proteins.length > 0) {
    const proteinPerFood = remainingProtein / proteins.length;
    for (const { food } of proteins) {
      const grams = food.protein > 0
        ? Math.round(Math.max(50, Math.min(300, (proteinPerFood / food.protein) * 100)))
        : 100;
      items.push({ food, grams });
      proteinFat += food.fat * grams / 100;
    }
  }

  // Step 4: Fat gap fill — add a small amount of fat food if fat is still short
  const fatConsumed = vegFat + starchFat + proteinFat;
  const fatGap = perMealMacros.fat - fatConsumed;
  if (fats.length > 0 && fatGap > 3) {
    const { food } = fats[0];
    const grams = food.fat > 0
      ? Math.round(Math.max(5, Math.min(30, (fatGap / food.fat) * 100)))
      : 10;
    items.push({ food, grams });
  }

  return { mealName, items };
}

function mealSolutionToAiMeal(solution: MealSolution): AiMealRaw {
  let calories = 0, protein = 0, fat = 0, carbs = 0;
  const nameParts: string[] = [];
  for (const { food, grams } of solution.items) {
    calories += food.calories * grams / 100;
    protein  += food.protein  * grams / 100;
    fat      += food.fat      * grams / 100;
    carbs    += food.carbs    * grams / 100;
    nameParts.push(`${food.name} ${grams}g`);
  }
  return {
    mealName: solution.mealName,
    name:     nameParts.join(' + '),
    calories: Math.max(0, Math.round(calories)),
    protein:  Math.max(0, Math.round(protein)),
    fat:      Math.max(0, Math.round(fat)),
    carbs:    Math.max(0, Math.round(carbs)),
  };
}

// ─── Gemini API ───────────────────────────────────────────────────────────────

function isRetryableStatus(status: number): boolean {
  return [400, 429, 500, 503].includes(status);
}

async function callGemini(prompt: string, systemInstruction: string): Promise<string> {
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
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.8,   // higher temp for variety — AI only picks names, not numbers
            maxOutputTokens: 512,
          },
        }),
      });
    } catch (networkErr) {
      console.log(`[Gemini] Key #${i + 1} lỗi mạng, thử key tiếp theo:`, networkErr);
      continue;
    }

    if (isRetryableStatus(response.status)) {
      console.log(`[Gemini] Key #${i + 1} trả về HTTP ${response.status}, thử key tiếp theo`);
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
    if (!text) throw new Error("Gemini không trả về nội dung hợp lệ");
    return text;
  }

  throw new Error(
    `Tất cả ${API_KEYS.length} key đều không khả dụng (lỗi cuối: HTTP ${lastStatus}). Vui lòng thêm key mới hoặc thử lại sau.`
  );
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

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
      macros?: { calories: number; protein: number; fat: number; carbs: number };
      mealCount?: number;
      preferences?: { likes?: string; dislikes?: string };
    };
    const { macros, mealCount, preferences } = body;

    if (!macros || macros.calories <= 0) {
      return NextResponse.json({ error: "Thiếu hoặc sai thông tin macros" }, { status: 400 });
    }
    if (!mealCount || mealCount < 2 || mealCount > 5) {
      return NextResponse.json({ error: "Số bữa không hợp lệ (phải từ 2–5)" }, { status: 400 });
    }

    const systemInstruction = buildNameOnlySystemInstruction(mealCount, preferences);
    const userPrompt = buildNameOnlyUserPrompt(mealCount);

    // Ask AI for food names only
    let rawNames = await callGemini(userPrompt, systemInstruction);
    let nameLists = parseNameOnlyResponse(rawNames, mealCount);

    // Retry once if parse fails or all lists empty
    const allEmpty = !nameLists || Object.values(nameLists).every(arr => arr.length === 0);
    if (allEmpty) {
      console.log('[Gemini] Name-only response invalid, retrying...');
      rawNames = await callGemini(
        `${userPrompt}\n\nLần trước JSON sai format. Hãy trả về ĐÚNG JSON: {"meal_1":[...],...,"meal_${mealCount}":[...]}`,
        systemInstruction
      );
      nameLists = parseNameOnlyResponse(rawNames, mealCount);
    }

    if (!nameLists) {
      throw new Error("AI không trả về danh sách tên thực phẩm hợp lệ");
    }

    // Backend solver: calculate exact grams per food to hit macro targets
    const mealFiberTarget = (macros.calories / 1000) * 14 / mealCount;
    const perMealMacros = {
      calories: macros.calories / mealCount,
      protein:  macros.protein  / mealCount,
      fat:      macros.fat      / mealCount,
      carbs:    macros.carbs    / mealCount,
    };

    const meals: AiMealRaw[] = [];
    for (let i = 0; i < mealCount; i++) {
      const mealTimeLabel = getMealTimeLabel(i, mealCount);
      const foodNames = nameLists[`meal_${i + 1}`] ?? [];
      const solution = solveMealGrams(mealTimeLabel, foodNames, perMealMacros, mealFiberTarget);
      meals.push(mealSolutionToAiMeal(solution));
    }

    return NextResponse.json({ result: JSON.stringify(meals) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định từ Gemini";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
