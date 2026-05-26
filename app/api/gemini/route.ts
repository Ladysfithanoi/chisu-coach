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

// Pure whole-food guards — block mixed-macro foods from ever entering the solver.
// A "Bánh mì gà xé" (carbs 48, protein 18) passes classifyFood as 'protein',
// then solver inflates it to 240g+ = 870+ kcal in one meal. These filters cut it out.
function isPureProtein(f: FoodItem): boolean {
  return f.carbs < 5; // protein source must not carry significant carb load
}
function isPureStarch(f: FoodItem): boolean {
  return f.protein < 5 && f.fat < 5; // starch source must be carb-dominant only
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

// ─── Exact Food Name Match ────────────────────────────────────────────────────
// AI is given the exact DB names and must return them verbatim.
// Only a normalised exact match is accepted — no fuzzy fallback.

function findExactFood(name: string): FoodItem | null {
  const q = name.trim().toLowerCase();
  return FOODS.find(f => f.name.trim().toLowerCase() === q) ?? null;
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
  // Only pure single-ingredient foods — no complex/mixed-macro dishes.
  // isPureStarch/isPureProtein filter ensures no mixed-macro food enters the AI list.
  const vegNames     = shuffleFoods(FOODS.filter(f => isVegetable(f))).map(f => f.name);
  const starchNames  = shuffleFoods(FOODS.filter(f => !isComplexDish(f) && classifyFood(f) === 'starch' && isPureStarch(f))).map(f => f.name);
  const proteinNames = shuffleFoods(FOODS.filter(f => !isComplexDish(f) && classifyFood(f) === 'protein' && isPureProtein(f))).map(f => f.name);

  const labels = MEAL_TIMES[mealCount] ?? Array.from({ length: mealCount }, (_, i) => `Bữa ${i + 1}`);

  const prefLines: string[] = [];
  if (preferences?.likes)    prefLines.push(`Thích: ${preferences.likes}`);
  if (preferences?.dislikes) prefLines.push(`Ghét/Dị ứng: ${preferences.dislikes}`);
  const prefBlock = prefLines.length > 0
    ? `\n4. SỞ THÍCH: ${prefLines.join(' | ')}`
    : '';

  return `Mày là chuyên gia dinh dưỡng lên thực đơn giảm cân Việt Nam. Nhiệm vụ DUY NHẤT: trả về TÊN thực phẩm — Backend tự tính 100% số gram và macro, AI KHÔNG được đặt bất kỳ con số nào.

OUTPUT BẮT BUỘC — JSON thuần, không markdown, không giải thích:
{"meal_1":["tên1","tên2",...],"meal_2":[...],...,"meal_${mealCount}":[...]}

${mealCount} bữa lần lượt: ${labels.join(' | ')}

LUẬT TUYỆT ĐỐI — VI PHẠM = OUTPUT BỊ HỦY HOÀN TOÀN:
1. Mày CHỈ ĐƯỢC PHÉP sao chép chính xác từng chuỗi ký tự tên thực phẩm từ MENU bên dưới vào output. CẤM thêm, bớt, hoặc thay đổi dù chỉ một ký tự. Backend dùng exact-match để tìm kiếm — sai một chữ = không tìm được = bữa ăn rỗng.
2. Mỗi bữa: ĐÚNG 1 tên từ nhóm PROTEIN + ĐÚNG 1 tên từ nhóm TINH BỘT + 1-2 tên từ nhóm RAU XANH.
3. Không lặp cùng một tên thực phẩm giữa các bữa.
4. Bữa Sáng ưu tiên: Cơm lứt, Khoai lang ruột cam (thường) chín.${prefBlock}

══════════════ MENU HỆ THỐNG — CHỈ ĐƯỢC CHỌN TỪ ĐÂY ══════════════

RAU XANH (chọn 1-2/bữa):
${vegNames.join('\n')}

TINH BỘT SẠCH (chọn ĐÚNG 1/bữa):
${starchNames.join('\n')}

PROTEIN SẠCH (chọn ĐÚNG 1/bữa):
${proteinNames.join('\n')}
══════════════════════════════════════════════════════════════════`;
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

// 3-Pass Solver — hard calorie ceiling enforced at every gram-allocation step.
//
//  Global cap: targetCalories × 1.10 — NO food gram can push total above this.
//  Mixed-macro starch (protein > 5g or fat > 10g per 100g): max 150g to prevent
//  inflated portions from single-handedly blowing the day budget.
//
//  Pass 1 VEG + PROTEIN (per meal):
//    Step A: grams = (perMealFiber / veg.fiber) × 100, clamped [80,200], then cap
//    Step B: mealAnimalProtein = perMealProtein − vegProtein, capped by remaining budget
//  Pass 2 STARCH (day-level carb balancer):
//    remainingCarbs = targetCarbs − totalVegCarbs
//    dynamic starchMealCount (≥ 20g carbs/meal); grams capped by remaining budget
//  Pass 3 OIL (day-level calorie top-up):
//    remainingCalories = targetCalories − currentTotal  → fills gap, never overshoots
function runCoreEngine(
  nameLists: Record<string, string[]>,
  macros: { calories: number; protein: number; fat: number; carbs: number },
  mealCount: number
): MealSolution[] {
  const used = new Set<string>();
  const notUsed = (name: string) => !used.has(name);

  // AI returns exact DB names — resolve with normalised exact match only, no fuzzy fallback.
  // mustPass is the only optional filter (used to block Whey in final meals).
  function pickFood(
    mealIndex: number,
    category: FoodCategory,
    mustPass?: (f: FoodItem) => boolean
  ): FoodItem | null {
    const pureGuard = category === 'starch'  ? isPureStarch
                    : category === 'protein' ? isPureProtein
                    : () => true;
    const names = nameLists[`meal_${mealIndex + 1}`] ?? [];
    return names
      .map(n => findExactFood(n))
      .find((f): f is FoodItem =>
        f !== null &&
        !isComplexDish(f) &&
        classifyFood(f) === category &&
        pureGuard(f) &&
        notUsed(f.name) &&
        (!mustPass || mustPass(f))
      ) ?? null;
  }

  function pickVegs(mealIndex: number): FoodItem[] {
    const names = nameLists[`meal_${mealIndex + 1}`] ?? [];
    return names
      .map(n => findExactFood(n))
      .filter((f): f is FoodItem => f !== null && isVegetable(f) && !isComplexDish(f) && notUsed(f.name))
      .slice(0, 2);
  }

  const perMealProtein = macros.protein / mealCount;
  const perMealFiber   = (macros.calories / 1000 * 14) / mealCount;
  const oilFood = FOODS.find(f => f.name === 'Dầu ăn (Chung)');

  // ── Global Calorie Cap helpers ───────────────────────────────────────────────
  // Hard ceiling = target + 10%.  capGrams() shaves desired grams so the running
  // total never crosses this line.  Returns 0 when budget is already exhausted.
  const calCap = macros.calories * 1.10;

  function sumCalItems(its: Array<{ food: FoodItem; grams: number }>): number {
    return its.reduce((s, { food, grams }) => s + food.calories * grams / 100, 0);
  }
  function sumCal(meals: Array<Array<{ food: FoodItem; grams: number }>>): number {
    return meals.reduce((total, its) => total + sumCalItems(its), 0);
  }
  function capGrams(food: FoodItem, desired: number, alreadyCal: number): number {
    if (food.calories <= 0 || desired <= 0) return desired;
    const budget = calCap - alreadyCal;
    if (budget <= 0) return 0;
    return Math.min(desired, Math.floor((budget / food.calories) * 100));
  }

  // ── Pass 1: VEG + PROTEIN per meal ──────────────────────────────────────────
  const mealItems: Array<Array<{ food: FoodItem; grams: number }>> = [];
  let totalVegCarbs = 0;
  const noWhey = (f: FoodItem) => !isWhey(f);

  for (let i = 0; i < mealCount; i++) {
    const items: Array<{ food: FoodItem; grams: number }> = [];

    // Step A: VEG — grams driven by fiber target, capped by global ceiling
    const vegFoods = pickVegs(i);
    const fiberPerVeg = perMealFiber / Math.max(vegFoods.length, 1);
    let mealVegProtein = 0;

    for (const food of vegFoods) {
      const fib = (food as FoodItem & { fiber?: number }).fiber ?? 0;
      const rawGrams = fib > 0
        ? Math.round(Math.max(80, Math.min(200, (fiberPerVeg / fib) * 100)))
        : 100;
      const alreadyCal = sumCal(mealItems) + sumCalItems(items);
      const grams = capGrams(food, rawGrams, alreadyCal);
      used.add(food.name);
      if (grams <= 0) continue; // calorie budget exhausted — skip this veg
      items.push({ food, grams });
      mealVegProtein += food.protein * grams / 100;
      totalVegCarbs  += food.carbs   * grams / 100;
    }

    // Step B: PROTEIN — deducts only veg protein from this meal, capped by global ceiling
    const mealAnimalProteinNeeded = Math.max(perMealProtein - mealVegProtein, 0);
    const wheyAllowed = mealCount < 3 ? i === 0 : i !== mealCount - 1;

    if (mealAnimalProteinNeeded >= 1) {
      const proteinFood = pickFood(i, 'protein', wheyAllowed ? undefined : noWhey);

      if (proteinFood) {
        const rawTargetGrams = proteinFood.protein > 0
          ? Math.round(Math.max(50, Math.min(350, (mealAnimalProteinNeeded / proteinFood.protein) * 100)))
          : 100;
        const calBeforeProtein = sumCal(mealItems) + sumCalItems(items);
        // Protein is never sacrificed by the calorie cap — minimum 50g guaranteed.
        const targetGrams = Math.max(capGrams(proteinFood, rawTargetGrams, calBeforeProtein), 50);

        if (isWhey(proteinFood) && targetGrams > 100) {
          items.push({ food: proteinFood, grams: 100 });
          used.add(proteinFood.name);
          const wheyProtein = proteinFood.protein;
          const deficit = mealAnimalProteinNeeded - wheyProtein;
          if (deficit >= 5) {
            const realFood = pickFood(i, 'protein', noWhey);
            if (realFood) {
              const calAfterWhey = sumCal(mealItems) + sumCalItems(items);
              const rawRealGrams = Math.round(Math.max(50, Math.min(350, (deficit / realFood.protein) * 100)));
              const realGrams = capGrams(realFood, rawRealGrams, calAfterWhey);
              if (realGrams > 0) {
                items.push({ food: realFood, grams: realGrams });
                used.add(realFood.name);
              }
            }
          }
        } else {
          items.push({ food: proteinFood, grams: targetGrams });
          used.add(proteinFood.name);
        }
      }
    }

    mealItems.push(items);
  }

  // ── Pass 2: STARCH — fill remaining carb budget (day-level), dynamic meal count ─
  // Mixed-macro starch (protein > 5g or fat > 10g per 100g) is hard-capped at 150g
  // to prevent the algorithm from inflating one food to 300g+ and spiking total calories.
  const remainingCarbs = macros.carbs - totalVegCarbs;

  if (remainingCarbs >= 20) {
    let starchMealCount = mealCount;
    while (starchMealCount > 1 && remainingCarbs / starchMealCount < 20) {
      starchMealCount--;
    }
    const carbPerStarchMeal = remainingCarbs / starchMealCount;

    for (let i = 0; i < starchMealCount; i++) {
      const starchFood = pickFood(i, 'starch');

      if (starchFood) {
        // Mixed-macro starch (Xôi, Bánh mì enriched, etc.) gets a tighter ceiling
        const maxStarchGrams = (starchFood.protein > 5 || starchFood.fat > 10) ? 150 : 400;
        const rawStarchGrams = starchFood.carbs > 0
          ? Math.round(Math.max(30, Math.min(maxStarchGrams, (carbPerStarchMeal / starchFood.carbs) * 100)))
          : 100;
        const starchGrams = capGrams(starchFood, rawStarchGrams, sumCal(mealItems));
        if (starchGrams > 0) {
          mealItems[i].push({ food: starchFood, grams: starchGrams });
          used.add(starchFood.name);
        }
      }
    }
  }

  // ── Pass 3: OIL — fill day-level calorie gap evenly, capped by fat budget ────
  // Uses macros.calories (not calCap) so oil only fills the actual target gap.
  if (oilFood) {
    const currentTotalCalories = sumCal(mealItems);
    const currentTotalFat = mealItems.reduce(
      (sum, its) => sum + its.reduce((s, { food, grams }) => s + food.fat * grams / 100, 0), 0
    );
    const remainingCalories  = macros.calories - currentTotalCalories;
    const remainingFatBudget = macros.fat - currentTotalFat;

    if (remainingCalories > 0 && remainingFatBudget > 0) {
      const oilByCalories  = (remainingCalories   * 100) / oilFood.calories;
      const oilByFatBudget = (remainingFatBudget  * 100) / oilFood.fat;
      const totalOilGrams  = Math.min(oilByCalories, oilByFatBudget);
      const perMealOilGrams = totalOilGrams / mealCount;

      if (perMealOilGrams >= 2) {
        for (let i = 0; i < mealCount; i++) {
          const grams = Math.round(perMealOilGrams);
          if (grams > 0) mealItems[i].push({ food: oilFood, grams });
        }
      }
    }
  }

  return mealItems.map((items, i) => ({ mealName: getMealTimeLabel(i, mealCount), items }));
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
