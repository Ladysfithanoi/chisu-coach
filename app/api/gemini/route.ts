import { NextRequest, NextResponse } from "next/server";
import { FOODS, type FoodItem } from "@/lib/foods-data";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ─── Gemini config ────────────────────────────────────────────────────────────

const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",").map(k => k.trim()).filter(Boolean)
  : [];

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

// ─── Utilities ────────────────────────────────────────────────────────────────

function shuffleFoods<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

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

// ─── AI System Instruction — tag-based food lists ─────────────────────────────

function buildNameOnlySystemInstruction(
  mealCount: number,
  preferences?: { likes?: string; dislikes?: string }
): string {
  const vegNames    = shuffleFoods(FOODS.filter(f => f.tag === 'veggie')).map(f => f.name);
  const fruitNames  = shuffleFoods(FOODS.filter(f => f.tag === 'fruit')).map(f => f.name);
  const starchNames = shuffleFoods(FOODS.filter(f => f.tag === 'starch')).map(f => f.name);
  const proteinNames = shuffleFoods(FOODS.filter(f => f.tag === 'protein')).map(f => f.name);

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

LUẬT TUYỆT ĐỐI — VI PHẠM = OUTPUT BỊ HỦY:
1. CHỈ sao chép chính xác tên từ MENU bên dưới — sai một ký tự = backend không tìm được = bữa rỗng.
2. Mỗi bữa: ĐÚNG 1 tên PROTEIN + ĐÚNG 1 tên TINH BỘT + 1-2 tên RAU + 0-1 tên TRÁI CÂY (tuỳ chọn).
3. Không lặp cùng tên giữa các bữa.
4. Bữa Sáng ưu tiên: Cơm lứt, Khoai lang ruột cam (thường) chín.${prefBlock}

════════════════ MENU — CHỈ ĐƯỢC CHỌN TỪ ĐÂY ════════════════

RAU (chọn 1-2/bữa):
${vegNames.join('\n')}

TRÁI CÂY — tuỳ chọn (0-1/bữa):
${fruitNames.join('\n')}

TINH BỘT (chọn ĐÚNG 1/bữa):
${starchNames.join('\n')}

PROTEIN (chọn ĐÚNG 1/bữa):
${proteinNames.join('\n')}
════════════════════════════════════════════════════════════════`;
}

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

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Core Diet Engine — 10-step sequential solver ────────────────────────────
//
//  Bước 1 : perMealCalories = targetCalories / mealsCount
//  Bước 2 : totalTargetFiber = (targetCalories / 1000) × 14
//  Bước 3 : perMealFiber = totalTargetFiber / mealsCount
//  Bước 4 : TRÁI CÂY (f.tag==='fruit') → locked 100g
//           RAU (f.tag==='veggie') → fiber-driven, clamped [80,200]
//  Bước 5 : currentMealVeggieCarbs = carbsFromVeg + carbsFromFruit
//  Bước 6 : neededStarchCarbs = (targetCarbs/meals) − currentMealVeggieCarbs
//           TINH BỘT (f.tag==='starch') → starchGrams = round(neededCarbs/carbs×100), min 30g
//  Bước 7 : mealPlantProtein = Σ protein từ rau + quả + tinh bột của bữa đó
//  Bước 8 : neededMealProtein = (targetProtein/meals) − mealPlantProtein
//           safety valve: if < 15g → dùng full perMealProtein
//  Bước 9 : PROTEIN (f.tag==='protein') → meatGrams = round(needed/protein×100), min 150g
//  Bước 10: Tổng Calo ngày vs target → bù Dầu ăn (gap > 5%) hoặc giảm tinh bột (dư > 5%)
function runCoreEngine(
  nameLists: Record<string, string[]>,
  macros: { calories: number; protein: number; fat: number; carbs: number },
  mealCount: number
): MealSolution[] {
  const used = new Set<string>();
  const isWhey = (f: FoodItem) => f.name.toLowerCase().includes('whey');

  function pickByTag(mealIndex: number, tag: string, noWhey = false): FoodItem | null {
    const names = nameLists[`meal_${mealIndex + 1}`] ?? [];
    return names
      .map(n => findExactFood(n))
      .find((f): f is FoodItem =>
        f !== null &&
        f.tag === tag &&
        !used.has(f.name) &&
        (!noWhey || !isWhey(f))
      ) ?? null;
  }

  function pickAllVeggies(mealIndex: number): FoodItem[] {
    const names = nameLists[`meal_${mealIndex + 1}`] ?? [];
    return names
      .map(n => findExactFood(n))
      .filter((f): f is FoodItem => f !== null && f.tag === 'veggie' && !used.has(f.name))
      .slice(0, 2);
  }

  // Bước 2–3: fiber targets
  const totalTargetFiber = (macros.calories / 1000) * 14;
  const perMealFiber     = totalTargetFiber / mealCount;

  const mealItems: Array<Array<{ food: FoodItem; grams: number }>> = [];

  for (let i = 0; i < mealCount; i++) {
    const items: Array<{ food: FoodItem; grams: number }> = [];

    // ── Bước 4a: TRÁI CÂY — khóa cứng 100g ──────────────────────────────────
    let fiberFromFruit = 0;
    let carbsFromFruit = 0;
    const fruitFood = pickByTag(i, 'fruit');
    if (fruitFood) {
      items.push({ food: fruitFood, grams: 100 });
      used.add(fruitFood.name);
      fiberFromFruit = fruitFood.fiber ?? 0;
      carbsFromFruit = fruitFood.carbs;
    }

    // ── Bước 4b: RAU — tam suất theo fiber ───────────────────────────────────
    const vegFoods = pickAllVeggies(i);
    const vegFiberTarget = Math.max(0, perMealFiber - fiberFromFruit);
    const fiberPerVeg    = vegFoods.length > 0 ? vegFiberTarget / vegFoods.length : 0;
    let carbsFromVeg = 0;

    for (const veg of vegFoods) {
      const fib   = veg.fiber ?? 0;
      const grams = fib > 0
        ? Math.round(Math.max(80, Math.min(200, (fiberPerVeg / fib) * 100)))
        : 100;
      items.push({ food: veg, grams });
      used.add(veg.name);
      carbsFromVeg += veg.carbs * grams / 100;
    }

    // ── Bước 5: currentMealVeggieCarbs ───────────────────────────────────────
    const currentMealVeggieCarbs = carbsFromVeg + carbsFromFruit;

    // ── Bước 6: TINH BỘT — tam suất theo carbs ───────────────────────────────
    const perMealCarbs      = macros.carbs / mealCount;
    const neededStarchCarbs = Math.max(0, perMealCarbs - currentMealVeggieCarbs);
    const starchFood        = pickByTag(i, 'starch');

    if (starchFood && starchFood.carbs > 0) {
      const rawGrams    = Math.round((neededStarchCarbs / starchFood.carbs) * 100);
      const starchGrams = Math.max(30, rawGrams); // cấm 0g tinh bột
      items.push({ food: starchFood, grams: starchGrams });
      used.add(starchFood.name);
    }

    // ── Bước 7: mealPlantProtein ──────────────────────────────────────────────
    const mealPlantProtein = items.reduce(
      (s, { food, grams }) => s + food.protein * grams / 100,
      0
    );

    // ── Bước 8: neededMealProtein ─────────────────────────────────────────────
    const perMealProtein = macros.protein / mealCount;
    let neededMealProtein = perMealProtein - mealPlantProtein;
    if (neededMealProtein < 15) neededMealProtein = perMealProtein; // safety valve

    // ── Bước 9: PROTEIN — tam suất thẳng mặt, sàn 150g ──────────────────────
    const banWheyLastMeal = mealCount >= 3 && i === mealCount - 1;
    const meatFood        = pickByTag(i, 'protein', banWheyLastMeal);

    if (meatFood && meatFood.protein > 0) {
      if (isWhey(meatFood)) {
        const wheyGrams = Math.max(30, Math.min(100, Math.round((neededMealProtein / meatFood.protein) * 100)));
        items.push({ food: meatFood, grams: wheyGrams });
        used.add(meatFood.name);
        const remainder = neededMealProtein - (meatFood.protein * wheyGrams / 100);
        if (remainder >= 5) {
          const realMeat = pickByTag(i, 'protein', true);
          if (realMeat && realMeat.protein > 0) {
            const realGrams = Math.max(150, Math.round((remainder / realMeat.protein) * 100));
            items.push({ food: realMeat, grams: realGrams });
            used.add(realMeat.name);
          }
        }
      } else {
        const meatGrams = Math.max(150, Math.round((neededMealProtein / meatFood.protein) * 100));
        items.push({ food: meatFood, grams: meatGrams });
        used.add(meatFood.name);
      }
    }

    mealItems.push(items);
  }

  // ── Bước 10: Vá mịn Calories cuối ngày ───────────────────────────────────
  const sumCal = (its: Array<{ food: FoodItem; grams: number }>) =>
    its.reduce((s, { food, grams }) => s + food.calories * grams / 100, 0);

  const currentDayCalories = mealItems.reduce((s, its) => s + sumCal(its), 0);
  const calGap    = macros.calories - currentDayCalories;
  const tolerance = macros.calories * 0.05; // 5% sai số

  const oilFood = FOODS.find(f => f.name === 'Dầu ăn (Chung)');

  if (calGap > tolerance && oilFood && oilFood.calories > 0) {
    // Thiếu Calo → bù Dầu ăn chia đều các bữa
    const totalOilGrams   = (calGap / oilFood.calories) * 100;
    const perMealOilGrams = Math.round(totalOilGrams / mealCount);
    if (perMealOilGrams >= 2) {
      for (let i = 0; i < mealCount; i++) {
        mealItems[i].push({ food: oilFood, grams: perMealOilGrams });
      }
    }
  } else if (calGap < -tolerance) {
    // Dư Calo → giảm tỷ lệ tinh bột
    const scale = Math.max(0.5, macros.calories / currentDayCalories);
    if (scale < 0.97) {
      for (const items of mealItems) {
        for (const item of items) {
          if (item.food.tag === 'starch') {
            item.grams = Math.max(30, Math.round(item.grams * scale));
          }
        }
      }
    }
  }

  return mealItems.map((items, i) => ({ mealName: getMealTimeLabel(i, mealCount), items }));
}

// ─── Convert Solution → AiMealRaw ─────────────────────────────────────────────

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

    // Step 1: AI trả về tên thực phẩm
    const systemInstruction = buildNameOnlySystemInstruction(mealCount, preferences);
    const userPrompt        = buildNameOnlyUserPrompt(mealCount);

    let rawNames  = await callGemini(userPrompt, systemInstruction);
    let nameLists = parseNameOnlyResponse(rawNames, mealCount);

    if (!nameLists || Object.values(nameLists).every(arr => arr.length === 0)) {
      console.log('[Solver] Name-only response invalid, retrying...');
      rawNames  = await callGemini(
        `${userPrompt}\n\nLần trước JSON sai format. Trả về ĐÚNG: {"meal_1":[...],...,"meal_${mealCount}":[...]}`,
        systemInstruction
      );
      nameLists = parseNameOnlyResponse(rawNames, mealCount);
    }

    if (!nameLists) {
      throw new Error("AI không trả về danh sách tên thực phẩm hợp lệ");
    }

    // Step 2: 10-step sequential solver
    const solutions = runCoreEngine(nameLists, macros, mealCount);

    // Step 3: Convert → AiMealRaw (macro từ DB × gram / 100)
    const meals: AiMealRaw[] = solutions.map(mealSolutionToAiMeal);

    const dayTotal = meals.reduce(
      (a, m) => ({ cal: a.cal + m.calories, prot: a.prot + m.protein }),
      { cal: 0, prot: 0 }
    );
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
