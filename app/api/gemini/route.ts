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
  macros: { calories: number; protein: number; fat: number; carbs: number },
  preferences?: { likes?: string; dislikes?: string }
): string {
  const vegNames     = shuffleFoods(FOODS.filter(f => f.tag === 'veggie')).map(f => f.name);
  const fruitNames   = shuffleFoods(FOODS.filter(f => f.tag === 'fruit')).map(f => f.name);
  const starchNames  = shuffleFoods(FOODS.filter(f => f.tag === 'starch')).map(f => f.name);

  const labels    = MEAL_TIMES[mealCount] ?? Array.from({ length: mealCount }, (_, i) => `Bữa ${i + 1}`);
  const templates = getMealTemplates(mealCount);

  const prefLines: string[] = [];
  if (preferences?.likes)    prefLines.push(`Thích: ${preferences.likes}`);
  if (preferences?.dislikes) prefLines.push(`Ghét/Dị ứng: ${preferences.dislikes}`);
  const prefBlock = prefLines.length > 0
    ? `\n5. SỞ THÍCH: ${prefLines.join(' | ')}`
    : '';

  const isLowCalHighProtein = macros.calories < 1300 && macros.protein > 120;
  const isHighCarbLowFat    = macros.carbs > 100 && macros.fat <= 60;

  // Build restricted protein list and warning block depending on scenario
  const leanProteinNames5 = FOODS.filter(f => f.tag === 'protein' && f.fat <= 5).map(f => f.name);
  const leanProteinNames8 = FOODS.filter(f => f.tag === 'protein' && f.fat <= 8).map(f => f.name);
  const proteinNames = isLowCalHighProtein
    ? leanProteinNames5
    : isHighCarbLowFat
      ? leanProteinNames8
      : shuffleFoods(FOODS.filter(f => f.tag === 'protein')).map(f => f.name);

  const leanProteinBlock = isLowCalHighProtein
    ? `\n\n⚠️ CHẾ ĐỘ THẤP CALO / CAO ĐẠM — LUẬT ĐẶC BIỆT BẮT BUỘC (${macros.calories} kcal, ${macros.protein}g đạm):\nTUYỆT ĐỐI CẤM chọn thịt lợn, trứng gà, vịt quay, gà quay, hay bất kỳ nguồn đạm có Fat > 5g/100g.\nCHỈ ĐƯỢC PHÉP chọn PROTEIN từ danh sách siêu sạch sau:\n${leanProteinNames5.join('\n')}`
    : isHighCarbLowFat
      ? `\n\n⚠️ CHẾ ĐỘ CAO CARBS / FAT THẤP — LUẬT ĐẶC BIỆT BẮT BUỘC (Carbs ${macros.carbs}g, Fat ${macros.fat}g):\nTUYỆT ĐỐI CẤM chọn trứng gà nguyên quả, gà quay có da, ba chỉ lợn, hay bất kỳ nguồn đạm có Fat > 8g/100g.\nLý do: Fat ẩn từ đạm chiếm hết quỹ Calo, tinh bột sẽ không còn chỗ đạt mốc ${macros.carbs}g.\nCHỈ ĐƯỢC PHÉP chọn PROTEIN từ danh sách đạm siêu nạc sau:\n${leanProteinNames8.join('\n')}`
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

// ─── Core Diet Engine — Clean-Sheet Solver ───────────────────────────────────
//
//  Luồng tuyến tính, không có scale-down, không break nửa chừng:
//
//  Bước 1 : Khoá RAU(150g)/QUẢ(100g) theo template → đo vfPro/vfFat/vfCar
//  Bước 2 : PROTEIN  grams = perMealPro / food.protein × 100
//           Fat ceiling 8g/100g khi carbs>100 && fat≤60 (chặn trứng/gà quay/ba chỉ)
//  Bước 3 : TINH BỘT grams = perMealCarbs / food.carbs × 100
//           Nếu grams < 50g → bỏ bữa đó, dồn carbs sang bữa chính cuối
//  Bước 4 : FAT — bù dầu ăn để lấp fat gap (chia đều các bữa)
//  Bước 5 : Micro-Tuning Loop ≤ 5% error tại bữa chính cuối (±5g protein/starch, ±2/-1g dầu)
function runCoreEngine(
  nameLists: Record<string, string[]>,
  macros: { calories: number; protein: number; fat: number; carbs: number },
  mealCount: number
): MealSolution[] {
  const templates = getMealTemplates(mealCount);
  const used      = new Set<string>();
  const isWhey    = (f: FoodItem) => f.name.toLowerCase().includes('whey');
  const needsLean = macros.carbs > 100 && macros.fat <= 60;
  const LEAN_CEIL = 8; // g fat/100g

  // ── pickFood: AI namelist trước, DB lean fallback cho protein ────────────────
  function pickFood(
    mealIdx: number,
    tag: string,
    opts: { noWhey?: boolean; maxFat?: number } = {}
  ): FoodItem | null {
    const names  = nameLists[`meal_${mealIdx + 1}`] ?? [];
    const fromAI = names
      .map(n => findExactFood(n))
      .find((f): f is FoodItem =>
        f !== null &&
        f.tag === tag &&
        !used.has(f.name) &&
        (!opts.noWhey  || !isWhey(f)) &&
        (opts.maxFat === undefined || f.fat <= opts.maxFat)
      ) ?? null;
    if (fromAI) return fromAI;
    if (tag === 'protein' && opts.maxFat !== undefined) {
      const cap = opts.maxFat;
      return FOODS.find(f =>
        f.tag === 'protein' &&
        !used.has(f.name) &&
        (!opts.noWhey || !isWhey(f)) &&
        f.fat <= cap &&
        f.protein > 15
      ) ?? null;
    }
    return null;
  }

  function pickVeggies(mealIdx: number): FoodItem[] {
    const names = nameLists[`meal_${mealIdx + 1}`] ?? [];
    return names
      .map(n => findExactFood(n))
      .filter((f): f is FoodItem => f !== null && f.tag === 'veggie' && !used.has(f.name))
      .slice(0, 2);
  }

  function dayMacro() {
    let cal = 0, pro = 0, fat = 0, car = 0;
    for (const its of mealItems) {
      for (const { food, grams } of its) {
        cal += food.calories * grams / 100;
        pro += food.protein  * grams / 100;
        fat += food.fat      * grams / 100;
        car += food.carbs    * grams / 100;
      }
    }
    return { cal, pro, fat, car };
  }

  const mealItems: Array<Array<{ food: FoodItem; grams: number }>> =
    Array.from({ length: mealCount }, () => []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 1: Khoá RAU & QUẢ — đo tổng macro VF
  // ─────────────────────────────────────────────────────────────────────────────
  let vfPro = 0, vfFat = 0, vfCar = 0;

  for (let i = 0; i < mealCount; i++) {
    const tmpl = templates[i];

    if (tmpl.veggieGrams > 0) {
      const vegs  = pickVeggies(i);
      const gEach = vegs.length > 0 ? Math.round(tmpl.veggieGrams / vegs.length) : 0;
      for (const v of vegs) {
        mealItems[i].push({ food: v, grams: gEach });
        used.add(v.name);
        vfPro += v.protein * gEach / 100;
        vfFat += v.fat     * gEach / 100;
        vfCar += v.carbs   * gEach / 100;
      }
    }

    if (tmpl.fruitGrams > 0) {
      const fruit = pickFood(i, 'fruit');
      if (fruit) {
        mealItems[i].push({ food: fruit, grams: tmpl.fruitGrams });
        used.add(fruit.name);
        vfPro += fruit.protein * tmpl.fruitGrams / 100;
        vfFat += fruit.fat     * tmpl.fruitGrams / 100;
        vfCar += fruit.carbs   * tmpl.fruitGrams / 100;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 2: PROTEIN — grams = perMealPro / food.protein × 100
  // ─────────────────────────────────────────────────────────────────────────────
  const protOpts  = needsLean ? { maxFat: LEAN_CEIL } : {};
  const perMealPro = Math.max(5, (macros.protein - vfPro) / mealCount);

  for (let i = 0; i < mealCount; i++) {
    const noWheyLast = mealCount >= 3 && i === mealCount - 1;
    const meat = pickFood(i, 'protein', { ...protOpts, noWhey: noWheyLast });
    if (!meat || meat.protein <= 0) continue;

    if (isWhey(meat)) {
      const wheyG = Math.max(30, Math.min(100, Math.round((perMealPro / meat.protein) * 100)));
      mealItems[i].push({ food: meat, grams: wheyG });
      used.add(meat.name);
      const rem = perMealPro - (meat.protein * wheyG / 100);
      if (rem >= 5) {
        const real = pickFood(i, 'protein', { ...protOpts, noWhey: true });
        if (real && real.protein > 0) {
          mealItems[i].push({ food: real, grams: Math.round((rem / real.protein) * 100) });
          used.add(real.name);
        }
      }
    } else {
      mealItems[i].push({ food: meat, grams: Math.round((perMealPro / meat.protein) * 100) });
      used.add(meat.name);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 3: TINH BỘT — grams = perMealCarbs / food.carbs × 100
  //   grams < 50g → bỏ bữa đó, dồn carbs sang bữa chính cuối cùng
  // ─────────────────────────────────────────────────────────────────────────────
  const netCarbs     = Math.max(0, macros.carbs - vfCar);
  const perMealCarbs = mealCount > 0 ? netCarbs / mealCount : 0;

  const lastMainIdx = (() => {
    for (let i = mealCount - 1; i >= 0; i--) {
      if (templates[i].type === 'main') return i;
    }
    return mealCount - 1;
  })();

  let carbsCarry = 0;

  for (let i = 0; i < mealCount; i++) {
    const isLast    = i === lastMainIdx;
    const carbsHere = isLast ? perMealCarbs + carbsCarry : perMealCarbs;
    if (carbsHere <= 0) continue;

    const starch = pickFood(i, 'starch');
    if (!starch || starch.carbs <= 0) {
      if (!isLast) carbsCarry += carbsHere;
      continue;
    }

    const g = Math.round((carbsHere / starch.carbs) * 100);
    if (!isLast && g < 50) {
      carbsCarry += carbsHere;
      continue;
    }
    if (g > 0) {
      mealItems[i].push({ food: starch, grams: g });
      used.add(starch.name);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 4: FAT — bù dầu ăn, chia đều các bữa
  // ─────────────────────────────────────────────────────────────────────────────
  const oilFood = FOODS.find(f => f.name === 'Dầu ăn (Chung)')
    ?? FOODS.find(f => f.tag === 'fat' && f.fat >= 80 && f.calories > 0);

  {
    const { fat: currentFat } = dayMacro();
    const fatGap = macros.fat - currentFat;
    if (fatGap > 3 && oilFood && oilFood.fat > 0) {
      const perMealOilG = Math.round((fatGap / oilFood.fat * 100) / mealCount);
      if (perMealOilG >= 1) {
        for (let i = 0; i < mealCount; i++) {
          mealItems[i].push({ food: oilFood, grams: perMealOilG });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Bước 5: Micro-Tuning Loop — sai số ≤ 5% tại bữa chính cuối cùng
  // ─────────────────────────────────────────────────────────────────────────────
  const protFB = (() => {
    const names = nameLists[`meal_${lastMainIdx + 1}`] ?? [];
    return names.map(n => findExactFood(n))
      .find((f): f is FoodItem =>
        f !== null && f.tag === 'protein' && !isWhey(f) &&
        (!needsLean || f.fat <= LEAN_CEIL)
      )
      ?? FOODS.find(f =>
        f.tag === 'protein' && !isWhey(f) && f.protein > 20 &&
        (!needsLean || f.fat <= LEAN_CEIL)
      )
      ?? null;
  })();

  const starchFB = (() => {
    const names = nameLists[`meal_${lastMainIdx + 1}`] ?? [];
    return names.map(n => findExactFood(n))
      .find((f): f is FoodItem => f !== null && f.tag === 'starch')
      ?? FOODS.find(f => f.tag === 'starch' && f.carbs > 20)
      ?? null;
  })();

  function getOrAdd(
    mealIdx: number,
    tag: string,
    fallback: FoodItem | null
  ): { food: FoodItem; grams: number } | null {
    const hit = mealItems[mealIdx].find(x => x.food.tag === tag);
    if (hit) return hit;
    if (!fallback) return null;
    const ni = { food: fallback, grams: 0 };
    mealItems[mealIdx].push(ni);
    return ni;
  }

  for (let iter = 0; iter < 100; iter++) {
    const { cal, pro, fat, car } = dayMacro();
    const calErr = macros.calories > 0 ? Math.abs((cal - macros.calories) / macros.calories) : 0;
    const proErr = macros.protein  > 0 ? Math.abs((pro - macros.protein)  / macros.protein)  : 0;
    const fatErr = macros.fat      > 0 ? Math.abs((fat - macros.fat)      / macros.fat)      : 0;
    const carErr = macros.carbs    > 0 ? Math.abs((car - macros.carbs)    / macros.carbs)    : 0;
    if (calErr <= 0.05 && proErr <= 0.05 && fatErr <= 0.05 && carErr <= 0.05) break;

    if (proErr > 0.05) {
      const it = getOrAdd(lastMainIdx, 'protein', protFB);
      if (it && it.food.protein > 0) it.grams = Math.max(0, it.grams + (pro < macros.protein ? 5 : -5));
    }
    if (carErr > 0.05) {
      const it = getOrAdd(lastMainIdx, 'starch', starchFB);
      if (it && it.food.carbs > 0) it.grams = Math.max(0, it.grams + (car < macros.carbs ? 5 : -5));
    }
    if (fatErr > 0.05 && oilFood && oilFood.fat > 0) {
      const it = getOrAdd(lastMainIdx, 'fat', oilFood);
      if (it) it.grams = Math.max(0, it.grams + (fat < macros.fat ? 2 : -1));
    }
  }

  for (let m = 0; m < mealItems.length; m++) {
    mealItems[m] = mealItems[m].filter(x => x.grams > 0);
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
