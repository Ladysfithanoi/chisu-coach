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
    ? `\n4. SỞ THÍCH KHÁCH HÀNG: ${prefLines.join(' | ')}`
    : '';

  return `Bạn là AI gợi ý tên thực phẩm đơn cho thực đơn Việt Nam. Nhiệm vụ DUY NHẤT: trả TÊN thực phẩm thô — Backend solver tự tính gram và macro theo công thức toán học riêng.

OUTPUT BẮT BUỘC — chỉ JSON thuần, không markdown, không giải thích:
{"meal_1":["tên1","tên2",...],"meal_2":[...],...,"meal_${mealCount}":[...]}

${mealCount} bữa lần lượt: ${labels.join(' | ')}

FOOD COMBINATION GUARD (TUYỆT ĐỐI KHÔNG VI PHẠM — VI PHẠM = KẾT QUẢ SAI HOÀN TOÀN):
- CHỈ gợi ý thực phẩm thô/nguyên liệu đơn: Ức gà, Cá lóc, Thịt bò nạc, Tôm sú, Đậu hũ, Trứng gà, Cơm lứt, Khoai lang, Bún gạo lứt, Yến mạch, Rau cải xanh...
- CẤM TUYỆT ĐỐI các món ăn đã gộp nhiều thành phần (Phở bò tái, Bún bò Huế, Cơm tấm sườn nướng, Mì xào, Cơm chiên dương châu, Bún riêu, Bánh canh) — những món này đã chứa cả tinh bột lẫn đạm nên Backend không thể tách gram riêng lẻ.
- Mỗi bữa: ĐÚNG 1 nguồn protein (Ức gà HOẶC Cá lóc HOẶC Thịt bò — KHÔNG ghép 2 loại đạm chung 1 bữa).
- Mỗi bữa: ĐÚNG 1 nguồn tinh bột (Cơm lứt HOẶC Khoai lang HOẶC Bún gạo lứt — KHÔNG ghép 2 tinh bột chung 1 bữa).

QUY TẮC:
1. Tên phải khớp CHÍNH XÁC với danh sách bên dưới.
2. Không lặp thực phẩm giữa các bữa trong ngày.
3. Bữa Sáng ưu tiên: Bún gạo lứt, Xôi gấc, Bánh mì nguyên cám, Yến mạch, Cháo yến mạch.${prefBlock}

DANH SÁCH RAU XANH (chọn 1-2/bữa):
${vegNames.join(', ')}

DANH SÁCH TINH BỘT (chọn ĐÚNG 1/bữa):
${starchNames.join(', ')}

DANH SÁCH PROTEIN (chọn ĐÚNG 1/bữa):
${proteinNames.join(', ')}`;
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

// Priority Matrix Solver — 3-step cascade:
//   P1 FIBER   → lock veg grams to hit fiber target
//   P2 PROTEIN → lock 1 protein food to hit protein target (±3g)
//   P3 CALORIES → size 1 starch to fill remaining calories (Carbs/Fat flexible ±15%)
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
  // Enforce 1 protein, 1 starch — take only first to prevent calorie explosion
  const protein1 = tagged.find(t => t.category === 'protein' || t.category === 'dish') ?? null;
  const starch1  = tagged.find(t => t.category === 'starch') ?? null;

  const items: Array<{ food: FoodItem; grams: number }> = [];

  // ── P1: FIBER — lock veg grams ───────────────────────────────────────────
  let vegCalories = 0, vegProtein = 0;
  if (vegs.length > 0) {
    const fiberPerVeg = mealFiberTarget / vegs.length;
    for (const { food } of vegs) {
      const fib = (food as FoodItem & { fiber?: number }).fiber ?? 0;
      const grams = fib > 0
        ? Math.round(Math.max(80, Math.min(200, (fiberPerVeg / fib) * 100)))
        : 100;
      items.push({ food, grams });
      vegCalories += food.calories * grams / 100;
      vegProtein  += food.protein  * grams / 100;
    }
  }

  // ── P2: PROTEIN — solve grams so protein hits target (±3g) ──────────────
  let proteinFoodCalories = 0;
  if (protein1) {
    const { food } = protein1;
    const remainingProtein = Math.max(perMealMacros.protein - vegProtein, 0);
    const grams = food.protein > 0
      ? Math.round(Math.max(50, Math.min(350, (remainingProtein / food.protein) * 100)))
      : 100;
    items.push({ food, grams });
    proteinFoodCalories = food.calories * grams / 100;
  }

  // ── P3: CALORIES — size starch to fill remaining calories ───────────────
  // Carbs and Fat are flexible (±15%) as long as total calories match target.
  const caloriesLocked = vegCalories + proteinFoodCalories;
  const remainingCalories = perMealMacros.calories - caloriesLocked;

  if (remainingCalories > 30) {
    // Prefer AI-suggested starch; fall back to first starch in DB not already used
    let starchFood = starch1?.food ?? null;
    if (!starchFood) {
      const usedNames = new Set(items.map(it => it.food.name));
      starchFood = FOODS.find(f => classifyFood(f) === 'starch' && !usedNames.has(f.name) && f.calories > 0) ?? null;
    }
    if (starchFood) {
      const grams = Math.round(Math.max(30, Math.min(400, (remainingCalories / starchFood.calories) * 100)));
      items.push({ food: starchFood, grams });
    }
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
