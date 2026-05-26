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
  4: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Trưa (12:00)", "Bữa 3 - Phụ (15:30)", "Bữa 4 - Tối (18:00)"],
  5: ["Bữa 1 - Sáng (7:00)", "Bữa 2 - Phụ 1 (10:00)", "Bữa 3 - Trưa (12:00)", "Bữa 4 - Phụ 2 (15:30)", "Bữa 5 - Tối (18:00)"],
};

function getMealTimeLabel(index: number, total: number): string {
  return MEAL_TIMES[total]?.[index] ?? `Bữa ${index + 1}`;
}

// ─── Meal Templates ───────────────────────────────────────────────────────────

type MealSlotType = 'breakfast' | 'main' | 'snack';

interface MealSlot {
  type: MealSlotType;
  veggieGrams: number;  // 0 = bữa không có rau
  fruitGrams: number;   // 0 = bữa không có trái cây
}

function getMealTemplates(mealCount: number): MealSlot[] {
  switch (mealCount) {
    case 2: return [
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
    ];
    case 3: return [
      { type: 'breakfast', veggieGrams: 0,   fruitGrams: 0   },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
    ];
    case 4: return [
      { type: 'breakfast', veggieGrams: 0,   fruitGrams: 0   },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
      { type: 'snack',     veggieGrams: 0,   fruitGrams: 100 },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
    ];
    case 5: return [
      { type: 'breakfast', veggieGrams: 0,   fruitGrams: 0   },
      { type: 'snack',     veggieGrams: 0,   fruitGrams: 100 },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
      { type: 'snack',     veggieGrams: 0,   fruitGrams: 100 },
      { type: 'main',      veggieGrams: 150, fruitGrams: 0   },
    ];
    default: return Array.from({ length: mealCount }, () =>
      ({ type: 'main' as MealSlotType, veggieGrams: 150, fruitGrams: 0 })
    );
  }
}

// ─── AI System Instruction — tag-based food lists ─────────────────────────────

function buildNameOnlySystemInstruction(
  mealCount: number,
  macros: { calories: number; protein: number },
  preferences?: { likes?: string; dislikes?: string }
): string {
  const vegNames     = shuffleFoods(FOODS.filter(f => f.tag === 'veggie')).map(f => f.name);
  const fruitNames   = shuffleFoods(FOODS.filter(f => f.tag === 'fruit')).map(f => f.name);
  const starchNames  = shuffleFoods(FOODS.filter(f => f.tag === 'starch')).map(f => f.name);
  const proteinNames = shuffleFoods(FOODS.filter(f => f.tag === 'protein')).map(f => f.name);

  const labels    = MEAL_TIMES[mealCount] ?? Array.from({ length: mealCount }, (_, i) => `Bữa ${i + 1}`);
  const templates = getMealTemplates(mealCount);

  const prefLines: string[] = [];
  if (preferences?.likes)    prefLines.push(`Thích: ${preferences.likes}`);
  if (preferences?.dislikes) prefLines.push(`Ghét/Dị ứng: ${preferences.dislikes}`);
  const prefBlock = prefLines.length > 0
    ? `\n5. SỞ THÍCH: ${prefLines.join(' | ')}`
    : '';

  const isLowCalHighProtein = macros.calories < 1300 && macros.protein > 120;
  const leanProteinNames    = FOODS.filter(f => f.tag === 'protein' && f.fat <= 5).map(f => f.name);
  const leanProteinBlock    = isLowCalHighProtein
    ? `\n\n⚠️ CHẾ ĐỘ THẤP CALO / CAO ĐẠM — LUẬT ĐẶC BIỆT BẮT BUỘC (${macros.calories} kcal, ${macros.protein}g đạm):\nTUYỆT ĐỐI CẤM chọn thịt lợn, trứng gà, vịt quay, gà quay, hay bất kỳ nguồn đạm có Fat > 5g/100g.\nCHỈ ĐƯỢC PHÉP chọn PROTEIN từ danh sách siêu sạch sau:\n${leanProteinNames.join('\n')}`
    : '';

  // Per-meal slot instructions derived from templates
  const mealSlotLines = templates.map((tmpl, idx) => {
    const label  = labels[idx] ?? `Bữa ${idx + 1}`;
    const slots: string[] = ['1 PROTEIN', '1 TINH BỘT'];
    if (tmpl.veggieGrams > 0) slots.push('1-2 RAU');
    if (tmpl.fruitGrams  > 0) slots.push('1 TRÁI CÂY');
    const banned: string[] = [];
    if (tmpl.veggieGrams === 0) banned.push('RAU');
    if (tmpl.fruitGrams  === 0) banned.push('TRÁI CÂY');
    const bannedStr = banned.length > 0 ? ` | KHÔNG chọn: ${banned.join(', ')}` : '';
    return `  • ${label}: ${slots.join(' + ')}${bannedStr}`;
  }).join('\n');

  return `Mày là chuyên gia dinh dưỡng lên thực đơn giảm cân Việt Nam. Nhiệm vụ DUY NHẤT: trả về TÊN thực phẩm — Backend tự tính 100% số gram và macro, AI KHÔNG được đặt bất kỳ con số nào.

OUTPUT BẮT BUỘC — JSON thuần, không markdown, không giải thích:
{"meal_1":["tên1","tên2",...],"meal_2":[...],...,"meal_${mealCount}":[...]}

${mealCount} bữa lần lượt: ${labels.join(' | ')}

LUẬT TUYỆT ĐỐI — VI PHẠM = OUTPUT BỊ HỦY:
1. CHỈ sao chép chính xác tên từ MENU bên dưới — sai một ký tự = backend không tìm được = bữa rỗng.
2. Cấu trúc BẮT BUỘC theo từng bữa (không được sai slot):
${mealSlotLines}
3. Không lặp cùng tên giữa các bữa.
4. Bữa Sáng ưu tiên TINH BỘT: Cơm lứt, Yến mạch, Bánh mỳ nguyên cám.${prefBlock}${leanProteinBlock}

════════════════ MENU — CHỈ ĐƯỢC CHỌN TỪ ĐÂY ════════════════

RAU (chọn cho bữa có RAU):
${vegNames.join('\n')}

TRÁI CÂY (chọn cho bữa có TRÁI CÂY):
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

// ─── Core Diet Engine — Template-based solver ────────────────────────────────
//
//  Template:   2 bữa → [main, main]
//              3 bữa → [breakfast, main, main]
//              4 bữa → [breakfast, main, snack, main]         (cal ≥ 1600)
//              5 bữa → [breakfast, snack, main, snack, main]  (cal ≥ 2000)
//
//  Bước A : Khóa cứng rau(150g tổng)/trái cây(100g) theo template → đo tổng VF macro
//  Bước B : perMealProtein = (targetProtein − VFProtein) / meals
//           PROTEIN → grams = round(perMealProtein / food.protein × 100)
//  Bước C : perMealCarbs = (targetCarbs − VFCarbs) / meals
//           TINH BỘT → grams = round(perMealCarbs / food.carbs × 100), 0g OK
//  Bước D : Fat-first fill (Dầu ăn, vô điều kiện) → calorie gap tighten sai số < 10%
function runCoreEngine(
  nameLists: Record<string, string[]>,
  macros: { calories: number; protein: number; fat: number; carbs: number },
  mealCount: number
): MealSolution[] {
  const templates = getMealTemplates(mealCount);
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

  const mealItems: Array<Array<{ food: FoodItem; grams: number }>> =
    Array.from({ length: mealCount }, () => []);

  // ── Bước A: Khóa cứng rau(150g tổng)/trái cây(100g) theo template ─────────
  let totalVFProtein = 0;
  let totalVFCarbs   = 0;
  let totalVFFat     = 0;

  for (let i = 0; i < mealCount; i++) {
    const tmpl = templates[i];

    if (tmpl.veggieGrams > 0) {
      const vegFoods = pickAllVeggies(i);
      const gramEach = vegFoods.length > 0 ? Math.round(tmpl.veggieGrams / vegFoods.length) : 0;
      for (const veg of vegFoods) {
        mealItems[i].push({ food: veg, grams: gramEach });
        used.add(veg.name);
        totalVFProtein += veg.protein * gramEach / 100;
        totalVFCarbs   += veg.carbs   * gramEach / 100;
        totalVFFat     += veg.fat     * gramEach / 100;
      }
    }

    if (tmpl.fruitGrams > 0) {
      const fruitFood = pickByTag(i, 'fruit');
      if (fruitFood) {
        mealItems[i].push({ food: fruitFood, grams: tmpl.fruitGrams });
        used.add(fruitFood.name);
        totalVFProtein += fruitFood.protein * tmpl.fruitGrams / 100;
        totalVFCarbs   += fruitFood.carbs   * tmpl.fruitGrams / 100;
        totalVFFat     += fruitFood.fat     * tmpl.fruitGrams / 100;
      }
    }
  }

  // ── Bước B: PROTEIN — chia đều cho toàn bộ các bữa ────────────────────────
  const perMealProtein = Math.max(5, (macros.protein - totalVFProtein) / mealCount);

  for (let i = 0; i < mealCount; i++) {
    const banWheyLastMeal = mealCount >= 3 && i === mealCount - 1;
    const meatFood = pickByTag(i, 'protein', banWheyLastMeal);

    if (meatFood && meatFood.protein > 0) {
      if (isWhey(meatFood)) {
        const wheyGrams = Math.max(30, Math.min(100, Math.round((perMealProtein / meatFood.protein) * 100)));
        mealItems[i].push({ food: meatFood, grams: wheyGrams });
        used.add(meatFood.name);
        const remainder = perMealProtein - (meatFood.protein * wheyGrams / 100);
        if (remainder >= 5) {
          const realMeat = pickByTag(i, 'protein', true);
          if (realMeat && realMeat.protein > 0) {
            mealItems[i].push({ food: realMeat, grams: Math.round((remainder / realMeat.protein) * 100) });
            used.add(realMeat.name);
          }
        }
      } else {
        mealItems[i].push({
          food: meatFood,
          grams: Math.round((perMealProtein / meatFood.protein) * 100),
        });
        used.add(meatFood.name);
      }
    }
  }

  // ── Bước C: TINH BỘT — chia đều cho toàn bộ các bữa, 0g cho phép ─────────
  const perMealCarbs = (macros.carbs - totalVFCarbs) / mealCount;

  for (let i = 0; i < mealCount; i++) {
    if (perMealCarbs <= 0) continue;
    const starchFood = pickByTag(i, 'starch');
    if (starchFood && starchFood.carbs > 0) {
      const starchGrams = Math.round((perMealCarbs / starchFood.carbs) * 100);
      if (starchGrams > 0) {
        mealItems[i].push({ food: starchFood, grams: starchGrams });
        used.add(starchFood.name);
      }
    }
  }

  // ── Bước D: Fat-first fill + calorie gap tighten — sai số < 10% ───────────
  const sumCal   = (its: Array<{ food: FoodItem; grams: number }>) =>
    its.reduce((s, { food, grams }) => s + food.calories * grams / 100, 0);
  const sumFat   = (its: Array<{ food: FoodItem; grams: number }>) =>
    its.reduce((s, { food, grams }) => s + food.fat      * grams / 100, 0);
  const sumCarbs = (its: Array<{ food: FoodItem; grams: number }>) =>
    its.reduce((s, { food, grams }) => s + food.carbs    * grams / 100, 0);

  // D1: Fat-first — bù fat bằng dầu ăn (vô điều kiện, sai số < 3g fat)
  const oilFood = FOODS.find(f => f.name === 'Dầu ăn (Chung)')
    ?? FOODS.find(f => f.tag === 'fat' && f.fat >= 80 && f.calories > 0);

  const fatBefore = mealItems.reduce((s, its) => s + sumFat(its), 0);
  const fatGap    = macros.fat - fatBefore;

  if (fatGap > 3 && oilFood && oilFood.fat > 0) {
    const totalOilGrams   = (fatGap / oilFood.fat) * 100;
    const perMealOilGrams = Math.round(totalOilGrams / mealCount);
    if (perMealOilGrams >= 1) {
      for (let i = 0; i < mealCount; i++) {
        mealItems[i].push({ food: oilFood, grams: perMealOilGrams });
      }
    }
  }

  // D2: Calorie gap (sau khi fat bù xong) — bù/cắt tinh bột, sai số < 10%
  const currentDayCalories = mealItems.reduce((s, its) => s + sumCal(its), 0);
  const calGap    = macros.calories - currentDayCalories;
  const tolerance = macros.calories * 0.10;

  if (calGap > tolerance) {
    const currentDayCarbs = mealItems.reduce((s, its) => s + sumCarbs(its), 0);
    const carbsHeadroom   = macros.carbs - currentDayCarbs;
    if (carbsHeadroom > 0) {
      const extraCalPerMeal   = calGap / mealCount;
      const carbsPerMealExtra = carbsHeadroom / mealCount;
      for (const its of mealItems) {
        const starchItem = its.find(x => x.food.tag === 'starch');
        if (starchItem && starchItem.food.calories > 0 && starchItem.food.carbs > 0) {
          const gramsByCal  = Math.round((extraCalPerMeal   / starchItem.food.calories) * 100);
          const gramsByCarb = Math.round((carbsPerMealExtra / starchItem.food.carbs)    * 100);
          const extraGrams  = Math.min(gramsByCal, gramsByCarb);
          if (extraGrams >= 5) starchItem.grams += extraGrams;
        }
      }
    }
  } else if (calGap < -tolerance) {
    const scale = macros.calories / currentDayCalories;
    if (scale < 0.90) {
      for (const its of mealItems) {
        for (const item of its) {
          if (item.food.tag === 'starch') item.grams = Math.round(item.grams * scale);
        }
      }
      for (let m = 0; m < mealItems.length; m++) {
        mealItems[m] = mealItems[m].filter(x => !(x.food.tag === 'starch' && x.grams <= 0));
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
    if (mealCount === 4 && macros.calories < 1600) {
      return NextResponse.json({ error: "Không đủ Calories để thiết lập chế độ 4 bữa đầy đủ dưỡng chất. Vui lòng chọn số bữa ít hơn hoặc tăng mục tiêu Calories." }, { status: 400 });
    }
    if (mealCount === 5 && macros.calories < 2000) {
      return NextResponse.json({ error: "Không đủ Calories để thiết lập chế độ 5 bữa đầy đủ dưỡng chất. Vui lòng chọn số bữa ít hơn hoặc tăng mục tiêu Calories." }, { status: 400 });
    }

    // Step 1: AI trả về tên thực phẩm
    const systemInstruction = buildNameOnlySystemInstruction(mealCount, macros, preferences);
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
