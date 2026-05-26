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

function isWhey(food: FoodItem): boolean {
  return food.name.toLowerCase().includes('whey');
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

// ─── Core Diet Engine ─────────────────────────────────────────────────────────

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

// Meal Isolation Solver — each meal is solved independently to its own calorie/protein quota.
// All gram values derived from DB × grams / 100; AI contributes zero numbers.
//
//  Step A VEG:     grams = (perMealFiber / veg.fiber) × 100  → locked per meal
//  Step B STARCH:  grams = (remainingMealCarbs / starch.carbs) × 100  → locked per meal
//  Step C PROTEIN: mealAnimalProtein = perMealProtein − (vegP + starchP)  → locked per meal
//  Step D OIL:     oilGrams fills (perMealCalories − currentMealCalories), capped by fat budget
function runCoreEngine(
  nameLists: Record<string, string[]>,
  macros: { calories: number; protein: number; fat: number; carbs: number },
  mealCount: number
): MealSolution[] {
  const used = new Set<string>();
  const notUsed = (name: string) => !used.has(name);

  function pickFood(
    mealIndex: number,
    category: FoodCategory,
    fallbackFilter?: (f: FoodItem) => boolean,
    mustPass?: (f: FoodItem) => boolean
  ): FoodItem | null {
    const names = nameLists[`meal_${mealIndex + 1}`] ?? [];
    const fromAI = names
      .map(n => findBestMatchingFood(n))
      .filter((f): f is FoodItem => f !== null && !isComplexDish(f) && classifyFood(f) === category && notUsed(f.name) && (!mustPass || mustPass(f)))
      [0] ?? null;
    if (fromAI) return fromAI;
    if (!fallbackFilter && !mustPass) return null;
    return (
      FOODS.find(f => !isComplexDish(f) && classifyFood(f) === category && notUsed(f.name) && (!fallbackFilter || fallbackFilter(f)) && (!mustPass || mustPass(f))) ??
      FOODS.find(f => !isComplexDish(f) && classifyFood(f) === category && notUsed(f.name) && (!mustPass || mustPass(f))) ??
      null
    );
  }

  function pickVegs(mealIndex: number): FoodItem[] {
    const names = nameLists[`meal_${mealIndex + 1}`] ?? [];
    const fromAI = names
      .map(n => findBestMatchingFood(n))
      .filter((f): f is FoodItem => f !== null && isVegetable(f) && !isComplexDish(f) && notUsed(f.name));
    if (fromAI.length > 0) return fromAI.slice(0, 2);
    const fb = FOODS.find(f =>
      isVegetable(f) &&
      notUsed(f.name) &&
      typeof (f as FoodItem & { fiber?: number }).fiber === 'number'
    );
    return fb ? [fb] : [];
  }

  const perMealCalories  = macros.calories / mealCount;
  const perMealProtein   = macros.protein  / mealCount;
  const perMealCarbs     = macros.carbs    / mealCount;
  const perMealFatBudget = macros.fat      / mealCount;
  const perMealFiber     = (macros.calories / 1000 * 14) / mealCount;

  const oilFood = FOODS.find(f => f.name === 'Dầu ăn (Chung)');
  const solutions: MealSolution[] = [];

  for (let i = 0; i < mealCount; i++) {
    const items: Array<{ food: FoodItem; grams: number }> = [];

    // ── Step A: VEG — lock grams to hit perMealFiber ─────────────────────
    const vegFoods = pickVegs(i);
    const fiberPerVeg = perMealFiber / Math.max(vegFoods.length, 1);
    let mealVegCarbs = 0;

    for (const food of vegFoods) {
      const fib = (food as FoodItem & { fiber?: number }).fiber ?? 0;
      const grams = fib > 0
        ? Math.round(Math.max(80, Math.min(200, (fiberPerVeg / fib) * 100)))
        : 100;
      items.push({ food, grams });
      mealVegCarbs += food.carbs * grams / 100;
      used.add(food.name);
    }

    // ── Step B: STARCH — cover per-meal carb quota minus veg carbs ───────
    const remainingCarbsForStarch = perMealCarbs - mealVegCarbs;

    if (remainingCarbsForStarch >= 20) {
      const starchFood =
        pickFood(i, 'starch') ??
        FOODS.find(f => f.name.includes('Khoai lang') && notUsed(f.name)) ??
        FOODS.find(f => f.name.includes('Gạo lứt')   && notUsed(f.name)) ??
        FOODS.find(f => classifyFood(f) === 'starch'  && notUsed(f.name) && f.calories > 0) ??
        null;

      if (starchFood) {
        const starchGrams = starchFood.carbs > 0
          ? Math.round(Math.max(30, Math.min(400, (remainingCarbsForStarch / starchFood.carbs) * 100)))
          : 100;
        items.push({ food: starchFood, grams: starchGrams });
        used.add(starchFood.name);
      }
    }

    // ── Step C: PROTEIN — reverse-budget within this meal ────────────────
    // Whey guard: mealCount < 3 → Whey only in meal 0; mealCount ≥ 3 → any meal except last.
    const mealPlantProtein = items.reduce((s, { food, grams }) => s + food.protein * grams / 100, 0);
    const mealAnimalProteinNeeded = Math.max(perMealProtein - mealPlantProtein, 0);
    const wheyAllowed = mealCount < 3 ? i === 0 : i !== mealCount - 1;
    const noWhey = (f: FoodItem) => !isWhey(f);

    if (mealAnimalProteinNeeded >= 5) {
      const proteinFood = wheyAllowed
        ? pickFood(i, 'protein', f => f.protein > 18 && f.fat < 8)
        : pickFood(i, 'protein', f => !isWhey(f) && f.protein > 18 && f.fat < 8, noWhey);

      if (proteinFood) {
        const targetGrams = proteinFood.protein > 0
          ? Math.round(Math.max(50, Math.min(350, (mealAnimalProteinNeeded / proteinFood.protein) * 100)))
          : 100;

        if (isWhey(proteinFood) && targetGrams > 100) {
          items.push({ food: proteinFood, grams: 100 });
          used.add(proteinFood.name);
          const deficitProtein = mealAnimalProteinNeeded - proteinFood.protein;
          if (deficitProtein >= 5) {
            const realFood = pickFood(i, 'protein', f => !isWhey(f) && f.protein > 18 && f.fat < 8, noWhey);
            if (realFood) {
              const realGrams = Math.round(Math.max(50, Math.min(350, (deficitProtein / realFood.protein) * 100)));
              items.push({ food: realFood, grams: realGrams });
              used.add(realFood.name);
            }
          }
        } else {
          items.push({ food: proteinFood, grams: targetGrams });
          used.add(proteinFood.name);
        }
      }
    }

    // ── Step D: OIL — fill per-meal calorie gap, capped by fat budget ─────
    if (oilFood) {
      const currentCalories = items.reduce((s, { food, grams }) => s + food.calories * grams / 100, 0);
      const currentFat      = items.reduce((s, { food, grams }) => s + food.fat      * grams / 100, 0);
      const missingCalories = perMealCalories - currentCalories;
      const remainingFat    = perMealFatBudget - currentFat;

      if (missingCalories > 0 && remainingFat > 0) {
        const oilByCalories  = (missingCalories * 100) / oilFood.calories;
        const oilByFatBudget = (remainingFat    * 100) / oilFood.fat;
        const oilGrams = Math.round(Math.min(oilByCalories, oilByFatBudget));
        if (oilGrams >= 2) items.push({ food: oilFood, grams: oilGrams });
      }
    }

    solutions.push({ mealName: getMealTimeLabel(i, mealCount), items });
  }

  return solutions;
}

// ─── Day-Level Calorie Safety Gate ───────────────────────────────────────────
// Gently scales starch grams if total calories drift >15% from target.
// Carbs and Fat are accepted as flexible; only starch is the calorie lever.
function scaleDayCalories(solutions: MealSolution[], targetCalories: number): MealSolution[] {
  const actual = solutions.reduce(
    (sum, sol) => sum + sol.items.reduce((s, { food, grams }) => s + food.calories * grams / 100, 0),
    0
  );
  const ratio = targetCalories / Math.max(actual, 1);
  if (Math.abs(ratio - 1) <= 0.15) return solutions; // within 15% → accept
  const r = Math.max(0.70, Math.min(1.5, ratio));
  return solutions.map(sol => ({
    ...sol,
    items: sol.items.map(item =>
      classifyFood(item.food) === 'starch'
        ? { ...item, grams: Math.round(Math.max(30, Math.min(500, item.grams * r))) }
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

    // ── Step 2: Core Diet Engine (4-stage day-level cascade) ─────────────
    // Stage 1 Fiber → Stage 2 Starch (carb-driven, dynamic meal count)
    // Stage 3 Protein (reverse: target − plant protein) → Stage 4 Assemble
    let solutions = runCoreEngine(nameLists, macros, mealCount);

    // ── Step 3: Calorie safety gate — starch-only, only if drift >15% ────
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
