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

// Complex dishes already contain multiple macro sources — solver cannot split their grams.
// These must never appear in the food lists shown to AI or be matched by the solver.
const COMPLEX_DISH_KEYWORDS = [
  'Phở', 'Bún bò', 'Cơm tấm', 'Cơm chiên', 'Cơm rang', 'Mì xào', 'Mì gói',
  'Bánh cuốn', 'Cháo lòng', 'Bún riêu', 'Bún chả', 'Bánh canh',
  'Hủ tiếu', 'Bún mắm', 'Bún thịt', 'Gỏi cuốn', 'Chả giò',
  'Súp gà', 'Canh chua', 'Lẩu ',
];

function isVegetable(food: FoodItem): boolean {
  const nameEn = food.nameEn ?? '';
  return (
    VEG_KEYWORDS_EN.some(k => nameEn.includes(k)) ||
    VEG_KEYWORDS_VN.some(k => food.name.includes(k))
  );
}

function isComplexDish(food: FoodItem): boolean {
  return COMPLEX_DISH_KEYWORDS.some(k => food.name.includes(k));
}

type FoodCategory = 'vegetable' | 'starch' | 'protein' | 'fat' | 'dish';

function classifyFood(food: FoodItem): FoodCategory {
  if (isVegetable(food)) return 'vegetable';
  if (isComplexDish(food)) return 'dish'; // complex dishes get their own bucket — solver skips them
  if (food.fat > 25 && food.protein < 20) return 'fat';
  if (food.carbs > 30 && food.carbs > food.protein * 3) return 'starch';
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

// ─── AI Name-Only System Instruction ─────────────────────────────────────────

function buildNameOnlySystemInstruction(
  mealCount: number,
  preferences?: { likes?: string; dislikes?: string }
): string {
  // Only show simple single-ingredient foods — no complex dishes
  const vegNames     = shuffleFoods(FOODS.filter(f => isVegetable(f))).map(f => f.name);
  const starchNames  = shuffleFoods(FOODS.filter(f => !isComplexDish(f) && classifyFood(f) === 'starch')).map(f => f.name);
  const proteinNames = shuffleFoods(FOODS.filter(f => !isComplexDish(f) && classifyFood(f) === 'protein')).map(f => f.name);

  const labels = MEAL_TIMES[mealCount] ?? Array.from({ length: mealCount }, (_, i) => `Bữa ${i + 1}`);

  const prefLines: string[] = [];
  if (preferences?.likes)    prefLines.push(`Thích: ${preferences.likes}`);
  if (preferences?.dislikes) prefLines.push(`Ghét/Dị ứng: ${preferences.dislikes}`);
  const prefBlock = prefLines.length > 0
    ? `\n4. SỞ THÍCH: ${prefLines.join(' | ')}`
    : '';

  return `Bạn là AI gợi ý tên thực phẩm đơn cho thực đơn Việt Nam. Nhiệm vụ DUY NHẤT: trả về TÊN thực phẩm thô — Backend tự tính toán 100% số gram và macro theo công thức toán học, AI KHÔNG được tự ý đặt bất kỳ con số nào.

OUTPUT BẮT BUỘC — JSON thuần, không markdown, không giải thích:
{"meal_1":["tên1","tên2",...],"meal_2":[...],...,"meal_${mealCount}":[...]}

${mealCount} bữa lần lượt: ${labels.join(' | ')}

FOOD GUARD (VI PHẠM = OUTPUT BỊ HỦY HOÀN TOÀN):
- CHỈ ĐƯỢC gợi ý thực phẩm thô/đơn: Ức gà, Cá lóc, Thịt bò nạc, Tôm sú, Đậu hũ, Trứng gà, Cơm lứt, Khoai lang...
- CẤM TUYỆT ĐỐI: Phở bò, Bún bò, Cơm tấm sườn, Mì xào, Cơm chiên, Bún riêu, Bánh canh — những món này đã gộp đạm + tinh bột nên Backend không thể tách gram.
- Mỗi bữa: ĐÚNG 1 protein + ĐÚNG 1 tinh bột + 1-2 rau xanh.

QUY TẮC:
1. Tên phải khớp CHÍNH XÁC với danh sách bên dưới.
2. Không lặp thực phẩm giữa các bữa.
3. Bữa Sáng ưu tiên: Bún gạo lứt, Yến mạch, Xôi gấc, Bánh mì nguyên cám.${prefBlock}

RAU XANH (chọn 1-2/bữa):
${vegNames.join(', ')}

TINH BỘT (chọn ĐÚNG 1/bữa):
${starchNames.join(', ')}

PROTEIN (chọn ĐÚNG 1/bữa):
${proteinNames.join(', ')}`;
}

// ─── User Prompt ─────────────────────────────────────────────────────────────

function buildNameOnlyUserPrompt(mealCount: number): string {
  return `Chọn tên thực phẩm thô cho ${mealCount} bữa ăn. JSON object với key meal_1 đến meal_${mealCount}. Chỉ JSON — không có text khác.`;
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

// ─── Priority Matrix Solver ───────────────────────────────────────────────────

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

// 3-step cascade per meal:
//   P1 FIBER:    veg_grams    = (fiberShare / food.fiber) × 100
//   P2 PROTEIN:  meat_grams   = (remainingProtein / food.protein) × 100  [tolerance ±5–10%]
//   P3 CALORIES: starch_grams = (remainingCalories / food.calories) × 100 [Carbs/Fat flexible]
// All macro numbers computed from DB values only — AI produces zero numbers.
function solveMealGrams(
  mealName: string,
  foodNames: string[],
  perMealMacros: { calories: number; protein: number; fat: number; carbs: number },
  mealFiberTarget: number
): MealSolution {
  type Tagged = { food: FoodItem; category: FoodCategory };

  // Match names → DB; skip any complex dishes even if AI returned them
  const tagged: Tagged[] = foodNames
    .map(n => findBestMatchingFood(n))
    .filter((f): f is FoodItem => f !== null)
    .filter(f => !isComplexDish(f))
    .map(f => ({ food: f, category: classifyFood(f) }));

  const vegs = tagged.filter(t => t.category === 'vegetable');
  // Enforce exactly 1 protein and 1 starch to prevent calorie explosion
  const protein1 = tagged.find(t => t.category === 'protein') ?? null;
  const starch1  = tagged.find(t => t.category === 'starch')  ?? null;

  const items: Array<{ food: FoodItem; grams: number }> = [];

  // ── P1: FIBER — lock veg grams ────────────────────────────────────────────
  // Each veg gets an equal share of the meal fiber target.
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

  // ── P2: PROTEIN — exact formula: meat_grams = (remainingProtein / food.protein) × 100 ──
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

  // ── P3: CALORIES — starch_grams = (remainingCalories / food.calories) × 100 ──
  // Carbs and Fat are flexible within ±15%; calories must hit target.
  const caloriesLocked = vegCalories + proteinFoodCalories;
  const remainingCalories = perMealMacros.calories - caloriesLocked;

  if (remainingCalories > 30) {
    // Use AI-suggested starch; fall back to Khoai lang if not matched
    let starchFood = starch1?.food ?? null;
    if (!starchFood) {
      const usedNames = new Set(items.map(it => it.food.name));
      // Prefer khoai lang → cơm lứt → any starch not yet used
      starchFood =
        FOODS.find(f => f.name.includes('Khoai lang') && !usedNames.has(f.name)) ??
        FOODS.find(f => f.name.includes('Cơm') && classifyFood(f) === 'starch' && !usedNames.has(f.name)) ??
        FOODS.find(f => classifyFood(f) === 'starch' && !usedNames.has(f.name) && f.calories > 0) ??
        null;
    }
    if (starchFood) {
      const grams = Math.round(Math.max(30, Math.min(450, (remainingCalories / starchFood.calories) * 100)));
      items.push({ food: starchFood, grams });
    }
  }

  return { mealName, items };
}

// ─── Day-Level Gate Functions ─────────────────────────────────────────────────

function sumSolutions(solutions: MealSolution[]): { calories: number; protein: number } {
  return solutions.reduce(
    (acc, sol) => {
      for (const { food, grams } of sol.items) {
        acc.calories += food.calories * grams / 100;
        acc.protein  += food.protein  * grams / 100;
      }
      return acc;
    },
    { calories: 0, protein: 0 }
  );
}

// Pass 1 — Scale protein food grams so daily protein hits target (±5–10%).
function scaleDayProtein(solutions: MealSolution[], targetProtein: number): MealSolution[] {
  const { protein: actualProtein } = sumSolutions(solutions);
  const ratio = targetProtein / Math.max(actualProtein, 1);
  // Within 5% → already good, skip
  if (Math.abs(ratio - 1) <= 0.05) return solutions;
  // Cap ratio at [0.5, 2.0] to prevent absurd portions
  const clampedRatio = Math.max(0.5, Math.min(2.0, ratio));
  return solutions.map(sol => ({
    ...sol,
    items: sol.items.map(item =>
      classifyFood(item.food) === 'protein'
        ? { ...item, grams: Math.round(Math.max(50, Math.min(400, item.grams * clampedRatio))) }
        : item
    ),
  }));
}

// Pass 2 — Scale starch grams so daily calories hits target (±5–10%).
// Run AFTER scaleDayProtein so protein calorie contribution is already updated.
function scaleDayCalories(solutions: MealSolution[], targetCalories: number): MealSolution[] {
  const { calories: actualCalories } = sumSolutions(solutions);
  const ratio = targetCalories / Math.max(actualCalories, 1);
  if (Math.abs(ratio - 1) <= 0.05) return solutions;
  const clampedRatio = Math.max(0.4, Math.min(2.5, ratio));
  return solutions.map(sol => ({
    ...sol,
    items: sol.items.map(item =>
      classifyFood(item.food) === 'starch'
        ? { ...item, grams: Math.round(Math.max(30, Math.min(500, item.grams * clampedRatio))) }
        : item
    ),
  }));
}

// ─── Convert Solution → AiMealRaw (all numbers from DB × grams / 100) ────────

function mealSolutionToAiMeal(solution: MealSolution): AiMealRaw {
  let calories = 0, protein = 0, fat = 0, carbs = 0;
  const nameParts: string[] = [];
  for (const { food, grams } of solution.items) {
    // Single authoritative formula: DB_value × grams / 100
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
    throw new Error("Chưa cấu hình GEMINI_API_KEYS trong .env.local (định dạng: key1,key2,...)");
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
            temperature: 0.8,
            maxOutputTokens: 512,
          },
        }),
      });
    } catch (networkErr) {
      console.log(`[Gemini] Key #${i + 1} lỗi mạng:`, networkErr);
      continue;
    }

    if (isRetryableStatus(response.status)) {
      console.log(`[Gemini] Key #${i + 1} HTTP ${response.status}, thử key tiếp`);
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

    // ── Step 1: AI returns food names only ────────────────────────────────
    const systemInstruction = buildNameOnlySystemInstruction(mealCount, preferences);
    const userPrompt = buildNameOnlyUserPrompt(mealCount);

    let rawNames = await callGemini(userPrompt, systemInstruction);
    let nameLists = parseNameOnlyResponse(rawNames, mealCount);

    // Retry once if JSON parse failed or all meal lists are empty
    if (!nameLists || Object.values(nameLists).every(arr => arr.length === 0)) {
      console.log('[Solver] Name-only response invalid, retrying...');
      rawNames = await callGemini(
        `${userPrompt}\n\nLần trước JSON sai format. Trả về ĐÚNG: {"meal_1":[...],...,"meal_${mealCount}":[...]}`,
        systemInstruction
      );
      nameLists = parseNameOnlyResponse(rawNames, mealCount);
    }

    if (!nameLists) {
      throw new Error("AI không trả về danh sách tên thực phẩm hợp lệ");
    }

    // ── Step 2: Backend Priority Matrix Solver ────────────────────────────
    const mealFiberTarget = (macros.calories / 1000) * 14 / mealCount;
    const perMealMacros = {
      calories: macros.calories / mealCount,
      protein:  macros.protein  / mealCount,
      fat:      macros.fat      / mealCount,
      carbs:    macros.carbs    / mealCount,
    };

    let solutions: MealSolution[] = [];
    for (let i = 0; i < mealCount; i++) {
      const foodNames = nameLists[`meal_${i + 1}`] ?? [];
      solutions.push(
        solveMealGrams(getMealTimeLabel(i, mealCount), foodNames, perMealMacros, mealFiberTarget)
      );
    }

    // ── Step 3: Day-level gate — enforce ±5–10% on protein then calories ──
    // Pass 1: protein (scales protein food grams)
    solutions = scaleDayProtein(solutions, macros.protein);
    // Pass 2: calories (scales starch grams, uses updated protein contributions)
    solutions = scaleDayCalories(solutions, macros.calories);

    // ── Step 4: Convert to AiMealRaw — all numbers from DB × grams / 100 ─
    const meals: AiMealRaw[] = solutions.map(mealSolutionToAiMeal);

    // Log day totals for debugging
    const dayTotal = meals.reduce((a, m) => ({
      cal: a.cal + m.calories,
      prot: a.prot + m.protein,
    }), { cal: 0, prot: 0 });
    console.log(
      `[Solver] Day totals → Cal: ${dayTotal.cal}/${macros.calories} ` +
      `(${((dayTotal.cal / macros.calories - 1) * 100).toFixed(1)}%) | ` +
      `Protein: ${dayTotal.prot}/${macros.protein} ` +
      `(${((dayTotal.prot / macros.protein - 1) * 100).toFixed(1)}%)`
    );

    return NextResponse.json({ result: JSON.stringify(meals) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định từ Gemini";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
