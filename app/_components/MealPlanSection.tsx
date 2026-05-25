"use client";

import { useState, useRef, useCallback } from "react";
import type { NutritionResult } from "./DietForm";
import { FOODS, type FoodItem } from "@/lib/foods-data";

// ─── Types ────────────────────────────────────────────────────────────────────

// Flat structure — one object per meal, foods listed as a single string.
// Simpler JSON = fewer tokens = faster + less likely to hit rate limits.
interface AiMeal {
  mealName: string;  // e.g. "Bữa 1 - Sáng (7:00)"
  name: string;      // e.g. "Cơm lứt 200g + Cá lóc hấp 150g + Rau cải luộc 100g"
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface SavedIngredient {
  food: FoodItem;
  grams: number;
}

interface ManualFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  ingredients: SavedIngredient[];
}

type Tab = "ai" | "manual";
type MealCount = 2 | 3 | 4 | 5;

interface IngredientRow {
  id: string;
  query: string;
  food: FoodItem | null;
  grams: number;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
}

function parseAiResponse(raw: string): AiMeal[] {
  const cleaned = stripMarkdown(raw);
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("AI trả về dữ liệu không đúng định dạng mảng");
  return (parsed as Record<string, unknown>[]).map((item, i) => ({
    mealName: String(item.mealName ?? `Bữa ${i + 1}`),
    name: String(item.name ?? ""),
    calories: Math.max(0, Math.round(Number(item.calories ?? 0))),
    protein: Math.max(0, Math.round(Number(item.protein ?? 0))),
    fat:     Math.max(0, Math.round(Number(item.fat     ?? 0))),
    carbs:   Math.max(0, Math.round(Number(item.carbs   ?? 0))),
  }));
}

// ─── Food search helpers ──────────────────────────────────────────────────────

function newRow(): IngredientRow {
  return { id: `${Date.now()}-${Math.random()}`, query: "", food: null, grams: 100 };
}

function computeRowMacros(food: FoodItem, grams: number) {
  const r = grams / 100;
  return {
    calories: Math.round(food.calories * r),
    protein: Math.round(food.protein * r),
    fat: Math.round(food.fat * r),
    carbs: Math.round(food.carbs * r),
  };
}

function searchFoods(query: string): FoodItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  return FOODS.filter(f =>
    f.name.toLowerCase().includes(q) ||
    (f.nameEn ?? '').toLowerCase().includes(q)
  )
    .sort((a, b) => {
      const aS = a.name.toLowerCase().startsWith(q) || (a.nameEn ?? '').toLowerCase().startsWith(q);
      const bS = b.name.toLowerCase().startsWith(q) || (b.nameEn ?? '').toLowerCase().startsWith(q);
      return aS === bS ? 0 : aS ? -1 : 1;
    })
    .slice(0, 8);
}

// ─── TrackingBar ──────────────────────────────────────────────────────────────

function TrackingBar({
  label, current, target, color,
}: {
  label: string; current: number; target: number; color: string;
}) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const over = current > target;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(18,16,13,0.5)" }}>{label}</span>
        <span style={{ fontSize: "0.75rem", color: over ? "#eb0915" : "rgba(18,16,13,0.38)" }}>
          {over ? `+${Math.round(current - target)} vượt` : `còn ${Math.round(target - current)}`}
        </span>
      </div>
      <div style={{ height: "6px", borderRadius: "99px", background: "rgba(18,16,13,0.08)" }}>
        <div
          style={{
            height: "100%",
            borderRadius: "99px",
            width: `${pct}%`,
            background: over ? "#eb0915" : color,
            transition: "width 0.35s ease",
          }}
        />
      </div>
    </div>
  );
}

// ─── AiMealCard ───────────────────────────────────────────────────────────────

function AiMealCard({ meal }: { meal: AiMeal }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ background: "rgba(235,9,21,0.05)" }}
      >
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#eb0915" }}>{meal.mealName}</span>
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#12100d" }}>
          {meal.calories} kcal
        </span>
      </div>
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <p style={{ fontSize: "0.875rem", color: "#12100d", lineHeight: 1.55, flex: 1 }}>
          {meal.name}
        </p>
        <p className="flex-shrink-0 text-right" style={{ fontSize: "0.75rem", color: "rgba(18,16,13,0.45)", lineHeight: 1.8 }}>
          P: {Math.round(meal.protein)}g<br />
          F: {Math.round(meal.fat)}g<br />
          C: {Math.round(meal.carbs)}g
        </p>
      </div>
    </div>
  );
}

// ─── PdfTemplate (rendered off-screen for html2canvas) ────────────────────────

function PdfTemplate({
  result, aiMeals, manualFoods, date,
}: {
  result: NutritionResult;
  aiMeals: AiMeal[] | null;
  manualFoods: ManualFood[];
  date: string;
}) {
  const GOAL_LABEL: Record<string, string> = {
    lose: "Giảm cân", gain: "Tăng cân", maintain: "Duy trì",
  };

  const th: React.CSSProperties = {
    padding: "9px 13px",
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    background: "#eb0915",
    color: "#ffffff",
    fontFamily: "Montserrat, sans-serif",
    textAlign: "left",
  };
  const thDark: React.CSSProperties = { ...th, background: "#12100d" };
  const td: React.CSSProperties = {
    padding: "9px 13px",
    fontSize: "12px",
    borderBottom: "1px solid rgba(18,16,13,0.07)",
    color: "#12100d",
    fontFamily: "Montserrat, sans-serif",
  };
  const tdRight: React.CSSProperties = { ...td, textAlign: "right" };
  const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
  const tdBold: React.CSSProperties = { ...td, fontWeight: 700 };

  // Grand total across all AI meals
  const aiGrand = aiMeals
    ? aiMeals.reduce(
        (a, m) => ({
          cal: a.cal + m.calories,
          p: a.p + m.protein,
          f: a.f + m.fat,
          c: a.c + m.carbs,
        }),
        { cal: 0, p: 0, f: 0, c: 0 }
      )
    : null;

  const manualTotal = manualFoods.reduce(
    (a, f) => ({
      cal: a.cal + f.calories, p: a.p + f.protein, f: a.f + f.fat, c: a.c + f.carbs,
    }),
    { cal: 0, p: 0, f: 0, c: 0 }
  );

  return (
    <div style={{ background: "#ffffff", fontFamily: "Montserrat, sans-serif", color: "#12100d" }}>
      {/* ── Header ── */}
      <div style={{ background: "#eb0915", padding: "28px 40px 24px" }}>
        <div style={{ fontSize: "30px", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.03em", lineHeight: 1 }}>
          DIET PLAN
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", marginTop: "6px", letterSpacing: "0.04em" }}>
          Máy Tính Dinh Dưỡng Chuyên Sâu
        </div>
      </div>

      {/* ── Client info ── */}
      <div style={{ padding: "24px 40px", display: "flex", gap: "32px", flexWrap: "wrap" }}>
        {[
          { label: "Khách hàng", value: result.name, large: true },
          { label: "Ngày tạo", value: date },
          { label: "Mục tiêu", value: GOAL_LABEL[result.weightGoal] ?? result.weightGoal },
          {
            label: "Thông số",
            value: `${result.gender === "male" ? "Nam" : "Nữ"} · ${result.age}t · ${result.height}cm · ${result.weight}kg`,
          },
        ].map((item) => (
          <div key={item.label}>
            <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "4px" }}>
              {item.label}
            </div>
            <div style={{ fontSize: item.large ? "20px" : "13px", fontWeight: item.large ? 800 : 600 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Nutrition targets ── */}
      <div style={{ padding: "0 40px 24px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
          Mục tiêu dinh dưỡng hàng ngày
        </div>
        <div className="w-full overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Chỉ số</th>
              <th style={{ ...th, textAlign: "right" }}>Mục tiêu / ngày</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "DER (Calo mục tiêu)", value: `${result.der.toLocaleString("vi-VN")} kcal` },
              { label: "Protein", value: `${result.protein}g` },
              { label: "Fat", value: `${result.fat}g` },
              { label: "Carbs", value: `${result.carbs}g` },
            ].map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}>
                <td style={td}>{row.label}</td>
                <td style={{ ...tdRight, fontWeight: 600 }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── AI Meal table (flat — one row per meal) ── */}
      {aiMeals && aiMeals.length > 0 && (
        <div style={{ padding: "0 40px 24px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
            Kế hoạch thực đơn
          </div>
          <div className="w-full overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, whiteSpace: "nowrap" }}>Bữa ăn</th>
                <th style={thDark}>Thực đơn chi tiết</th>
                <th style={{ ...thDark, textAlign: "center" }}>Calo</th>
                <th style={{ ...thDark, textAlign: "center" }}>P(g)</th>
                <th style={{ ...thDark, textAlign: "center" }}>F(g)</th>
                <th style={{ ...thDark, textAlign: "center" }}>C(g)</th>
              </tr>
            </thead>
            <tbody>
              {aiMeals.map((meal, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}>
                  <td style={{ ...tdBold, color: "#eb0915", whiteSpace: "nowrap" }}>{meal.mealName}</td>
                  <td style={td}>{meal.name}</td>
                  <td style={{ ...tdCenter, fontWeight: 600 }}>{Math.round(meal.calories)}</td>
                  <td style={tdCenter}>{Math.round(meal.protein)}</td>
                  <td style={tdCenter}>{Math.round(meal.fat)}</td>
                  <td style={tdCenter}>{Math.round(meal.carbs)}</td>
                </tr>
              ))}
              {aiGrand && (
                <tr style={{ background: "rgba(235,9,21,0.05)" }}>
                  <td style={{ ...tdBold, color: "#eb0915" }} colSpan={2}>Tổng cả ngày</td>
                  <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>{Math.round(aiGrand.cal)}</td>
                  <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>{Math.round(aiGrand.p)}</td>
                  <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>{Math.round(aiGrand.f)}</td>
                  <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>{Math.round(aiGrand.c)}</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* ── Manual foods table ── */}
      {manualFoods.length > 0 && (
        <div style={{ padding: "0 40px 24px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
            Thực đơn tự nhập
          </div>
          <div className="w-full overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Món ăn</th>
                <th style={{ ...th, textAlign: "center" }}>Calo</th>
                <th style={{ ...th, textAlign: "center" }}>P(g)</th>
                <th style={{ ...th, textAlign: "center" }}>F(g)</th>
                <th style={{ ...th, textAlign: "center" }}>C(g)</th>
              </tr>
            </thead>
            <tbody>
              {manualFoods.map((food, i) => (
                <tr key={food.id} style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}>
                  <td style={td}>{food.name}</td>
                  <td style={{ ...tdCenter, fontWeight: 600 }}>{Math.round(food.calories)}</td>
                  <td style={tdCenter}>{Math.round(food.protein)}</td>
                  <td style={tdCenter}>{Math.round(food.fat)}</td>
                  <td style={tdCenter}>{Math.round(food.carbs)}</td>
                </tr>
              ))}
              <tr style={{ background: "rgba(235,9,21,0.04)" }}>
                <td style={{ ...tdBold, color: "#eb0915" }}>Tổng ngày</td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>{Math.round(manualTotal.cal)}</td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>{Math.round(manualTotal.p)}</td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>{Math.round(manualTotal.f)}</td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>{Math.round(manualTotal.c)}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{
        padding: "16px 40px",
        borderTop: "1px solid rgba(18,16,13,0.08)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: "10px", color: "rgba(18,16,13,0.3)", fontStyle: "italic" }}>
          Được tạo bởi Diet Plan · Máy Tính Dinh Dưỡng Chuyên Sâu
        </span>
        <span style={{ fontSize: "12px", fontWeight: 900, color: "#eb0915", letterSpacing: "-0.01em" }}>
          DIET PLAN
        </span>
      </div>
    </div>
  );
}

// ─── IngredientSearchRow ──────────────────────────────────────────────────────

function IngredientSearchRow({
  row,
  isActive,
  canRemove,
  onQueryChange,
  onSelect,
  onGramsChange,
  onRemove,
  onFocus,
  onBlur,
}: {
  row: IngredientRow;
  isActive: boolean;
  canRemove: boolean;
  onQueryChange: (val: string) => void;
  onSelect: (food: FoodItem) => void;
  onGramsChange: (g: number) => void;
  onRemove: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const results = isActive && row.query ? searchFoods(row.query) : [];
  const macros = row.food ? computeRowMacros(row.food, row.grams) : null;
  const [gramsInput, setGramsInput] = useState(String(row.grams));

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            placeholder="Tìm nguyên liệu... (VD: cá lóc, gạo lứt)"
            value={row.query}
            onChange={e => onQueryChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            className="dp-input w-full"
            autoComplete="off"
          />
          {results.length > 0 && (
            <div
              className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-xl"
              style={{ background: "#fff", border: "1px solid rgba(18,16,13,0.12)" }}
            >
              {results.map(food => (
                <button
                  key={food.name}
                  type="button"
                  onMouseDown={() => onSelect(food)}
                  className="w-full text-left px-3 py-2.5 transition-colors"
                  style={{ borderBottom: "1px solid rgba(18,16,13,0.05)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(235,9,21,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <span className="text-sm font-semibold" style={{ color: "#12100d" }}>
                    {food.name}
                  </span>
                  <span className="text-xs ml-2" style={{ color: "rgba(18,16,13,0.4)" }}>
                    {food.calories} kcal · P:{food.protein}g F:{food.fat}g C:{food.carbs}g /100g
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Gram input */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number"
            value={gramsInput}
            min={1}
            onChange={e => {
              setGramsInput(e.target.value);
              const parsed = parseInt(e.target.value);
              if (!isNaN(parsed) && parsed >= 1) onGramsChange(parsed);
            }}
            className="dp-input text-center"
            style={{ width: "68px" }}
          />
          <span className="text-xs font-semibold" style={{ color: "rgba(18,16,13,0.4)" }}>g</span>
        </div>
        {/* Remove */}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg"
            style={{ background: "rgba(235,9,21,0.08)", color: "#eb0915" }}
            aria-label="Xoá nguyên liệu"
          >
            ×
          </button>
        )}
      </div>
      {/* Per-row macro preview */}
      {macros && (
        <div className="flex gap-3 pl-1 flex-wrap">
          {(
            [
              { label: "Calo", value: `${macros.calories} kcal`, color: "#eb0915" },
              { label: "P", value: `${macros.protein}g`, color: "#1d4ed8" },
              { label: "F", value: `${macros.fat}g`, color: "#b45309" },
              { label: "C", value: `${macros.carbs}g`, color: "#065f46" },
            ] as const
          ).map(item => (
            <span key={item.label} className="text-xs font-semibold" style={{ color: item.color }}>
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Spinner (defined outside component to avoid recreation on every render) ──

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <svg
      className="animate-spin"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12" cy="12" r="10"
        stroke={light ? "rgba(255,255,255,0.3)" : "rgba(18,16,13,0.15)"}
        strokeWidth="3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke={light ? "white" : "#12100d"}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MealPlanSection({
  result,
  liveProtein,
  liveFat,
  liveCarbs,
  liveDer,
}: {
  result: NutritionResult;
  liveProtein: number;
  liveFat: number;
  liveCarbs: number;
  liveDer: number;
}) {
  const pdfRef = useRef<HTMLDivElement>(null);
  // Synchronous ref-based lock — set BEFORE any setState so no race condition
  // can allow a second call between the click and React re-rendering disabled
  const aiInFlight = useRef(false);

  const [activeTab, setActiveTab] = useState<Tab>("ai");
  const [mealCount, setMealCount] = useState<MealCount>(3);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCooldown, setAiCooldown] = useState(0); // seconds remaining after success
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMeals, setAiMeals] = useState<AiMeal[] | null>(null);

  const [manualFoods, setManualFoods] = useState<ManualFood[]>([]);
  const [rows, setRows] = useState<IngredientRow[]>(() => [newRow()]);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);

  const [pdfLoading, setPdfLoading] = useState(false);

  // Bữa đang được chỉnh sửa bị loại khỏi tracking để PT thấy ngân sách thực
  const totals = manualFoods
    .filter(f => f.id !== editingMealId)
    .reduce(
      (a, f) => ({
        calories: a.calories + f.calories,
        protein: a.protein + f.protein,
        fat: a.fat + f.fat,
        carbs: a.carbs + f.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

  // ── AI generation ─────────────────────────────────────────────────────────

  const handleGenerateAI = useCallback(async () => {
    // Hard lock: ref is synchronous — immune to React batching delays
    if (aiInFlight.current) return;
    console.log("🚀 CHỈ KÍCH HOẠT KHI BẤM NÚT TẠO THỰC ĐƠN!");
    aiInFlight.current = true;
    setAiLoading(true);
    setAiError(null);
    setAiMeals(null);

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          macros: { calories: liveDer, protein: liveProtein, fat: liveFat, carbs: liveCarbs },
          mealCount,
          preferences: { likes: result.likes, dislikes: result.dislikes },
        }),
      });

      if (res.status === 401) {
        const errData = await res.json() as { kicked?: boolean };
        window.location.replace(errData.kicked ? "/login?kicked=1" : "/login");
        return;
      }

      const data: { result?: string; error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Lỗi từ Gemini API");
      if (!data.result) throw new Error("Gemini không trả về nội dung");
      // Slice là tuyến phòng thủ cuối — loại bỏ bữa thừa dù AI có vượt rào
      const meals = parseAiResponse(data.result).slice(0, mealCount);
      setAiMeals(meals);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Đã xảy ra lỗi, vui lòng thử lại");
    } finally {
      setAiLoading(false);
      aiInFlight.current = false;

      // 5-second cooldown to prevent rapid re-clicks after a request
      setAiCooldown(5);
      const t = setInterval(() => {
        setAiCooldown((s) => {
          if (s <= 1) { clearInterval(t); return 0; }
          return s - 1;
        });
      }, 1000);
    }
  }, [result, mealCount]); // only re-create when inputs change

  // ── Manual food ────────────────────────────────────────────────────────────

  function handleConfirmMeal() {
    const filled = rows.filter((r): r is IngredientRow & { food: FoodItem } => r.food !== null);
    if (filled.length === 0) return;

    const total = filled.reduce(
      (acc, row) => {
        const m = computeRowMacros(row.food, row.grams);
        return {
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          fat: acc.fat + m.fat,
          carbs: acc.carbs + m.carbs,
        };
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    const ingredients: SavedIngredient[] = filled.map(r => ({ food: r.food, grams: r.grams }));

    if (editingMealId !== null) {
      // Cập nhật bữa đang sửa, giữ nguyên vị trí trong danh sách
      setManualFoods(prev => prev.map(f => {
        if (f.id !== editingMealId) return f;
        const idx = prev.findIndex(m => m.id === editingMealId);
        const mealName = `Bữa ${idx + 1}: ` + filled.map(r => `${r.food.name} (${r.grams}g)`).join(" + ");
        return {
          ...f,
          name: mealName,
          calories: Math.round(total.calories),
          protein: Math.round(total.protein),
          fat: Math.round(total.fat),
          carbs: Math.round(total.carbs),
          ingredients,
        };
      }));
      setEditingMealId(null);
    } else {
      const mealOrder = manualFoods.length + 1;
      const mealName = `Bữa ${mealOrder}: ` + filled.map(r => `${r.food.name} (${r.grams}g)`).join(" + ");
      setManualFoods(prev => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          name: mealName,
          calories: Math.round(total.calories),
          protein: Math.round(total.protein),
          fat: Math.round(total.fat),
          carbs: Math.round(total.carbs),
          ingredients,
        },
      ]);
    }

    setRows([newRow()]);
    setActiveDropdown(null);
  }

  function handleEditMeal(meal: ManualFood) {
    const restoredRows: IngredientRow[] = meal.ingredients.map(ing => ({
      id: `${Date.now()}-${Math.random()}`,
      query: ing.food.name,
      food: ing.food,
      grams: ing.grams,
    }));
    setRows(restoredRows.length > 0 ? restoredRows : [newRow()]);
    setEditingMealId(meal.id);
    setActiveDropdown(null);
  }

  function handleCancelEdit() {
    setEditingMealId(null);
    setRows([newRow()]);
    setActiveDropdown(null);
  }

  // ── PDF export ─────────────────────────────────────────────────────────────

  async function handleExportPDF() {
    if (!pdfRef.current) return;
    setPdfLoading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const margin = 10;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;

      // Scale canvas px → mm
      const pxToMm = contentW / canvas.width;
      const totalImgH = canvas.height * pxToMm;
      const pageCount = Math.ceil(totalImgH / contentH);

      const imgData = canvas.toDataURL("image/png");

      for (let page = 0; page < pageCount; page++) {
        if (page > 0) pdf.addPage();
        // Each page offsets the image upward to show the next portion
        const yOffset = margin - page * contentH;
        pdf.addImage(imgData, "PNG", margin, yOffset, contentW, totalImgH);
      }

      pdf.save(`diet-plan-${result.name.replace(/\s+/g, "-")}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  const hasMealData = (aiMeals && aiMeals.length > 0) || manualFoods.length > 0;
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <div id="meal-plan-section" className="mt-6 space-y-4">
      {/* ── Tab container ── */}
      <div
        className="bg-white rounded-2xl shadow-sm"
        style={{ border: "1px solid rgba(18,16,13,0.1)" }}
      >
        {/* Tab bar */}
        <div className="flex" style={{ borderBottom: "1px solid rgba(18,16,13,0.08)" }}>
          {(["ai", "manual"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-3.5 text-sm font-semibold transition-all"
              style={{
                borderBottom: activeTab === tab ? "2px solid #eb0915" : "2px solid transparent",
                color: activeTab === tab ? "#eb0915" : "rgba(18,16,13,0.45)",
                background: "transparent",
              }}
            >
              {tab === "ai" ? "✨ AI Thực đơn" : "✏️ Tự nhập tay"}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ════ AI Tab ════ */}
          {activeTab === "ai" && (
            <div className="space-y-5">
              {/* Meal count */}
              <div>
                <p className="dp-label">Số bữa ăn trong ngày</p>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {([2, 3, 4, 5] as MealCount[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMealCount(n)}
                      className="py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{
                        border: mealCount === n ? "1px solid #eb0915" : "1px solid rgba(18,16,13,0.15)",
                        background: mealCount === n ? "#eb0915" : "#ffffff",
                        color: mealCount === n ? "#ffffff" : "#12100d",
                      }}
                    >
                      {n} bữa
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button — disabled during request AND during cooldown */}
              {(() => {
                const blocked = aiLoading || aiCooldown > 0;
                return (
                  <button
                    type="button"
                    onClick={handleGenerateAI}
                    disabled={blocked}
                    className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    style={{
                      background: blocked ? "rgba(235,9,21,0.55)" : "#eb0915",
                      color: "#ffffff",
                      cursor: blocked ? "not-allowed" : "pointer",
                      pointerEvents: blocked ? "none" : "auto",
                    }}
                  >
                    {aiLoading ? (
                      <><Spinner light /> AI đang phân tích...</>
                    ) : aiCooldown > 0 ? (
                      `Chờ ${aiCooldown}s...`
                    ) : (
                      "✨ Gợi ý bằng AI"
                    )}
                  </button>
                );
              })()}

              {/* Error */}
              {aiError && (
                <div
                  className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
                  style={{ background: "rgba(235,9,21,0.06)", border: "1px solid rgba(235,9,21,0.2)", color: "#eb0915" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {aiError}
                </div>
              )}

              {/* AI results */}
              {aiMeals && (
                <div className="space-y-3">
                  <p
                    className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: "rgba(18,16,13,0.35)" }}
                  >
                    Thực đơn gợi ý
                  </p>
                  {aiMeals.map((meal, i) => (
                    <AiMealCard key={i} meal={meal} />
                  ))}

                  {/* Daily grand total */}
                  {(() => {
                    const gt = aiMeals.reduce(
                      (a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein, f: a.f + m.fat, c: a.c + m.carbs }),
                      { cal: 0, p: 0, f: 0, c: 0 }
                    );
                    return (
                      <div
                        className="rounded-xl p-4"
                        style={{ background: "rgba(18,16,13,0.03)", border: "1px solid rgba(18,16,13,0.08)" }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(18,16,13,0.35)" }}>
                          Tổng cả ngày
                        </p>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                          {[
                            { label: "Calo", value: gt.cal, unit: "kcal", color: "#eb0915" },
                            { label: "Protein", value: Math.round(gt.p), unit: "g", color: "#1d4ed8" },
                            { label: "Fat", value: Math.round(gt.f), unit: "g", color: "#b45309" },
                            { label: "Carbs", value: Math.round(gt.c), unit: "g", color: "#065f46" },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="text-center rounded-lg py-2.5 px-1"
                              style={{ background: "#ffffff", border: "1px solid rgba(18,16,13,0.07)" }}
                            >
                              <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{item.label}</p>
                              <p className="text-lg md:text-xl font-bold mt-0.5" style={{ color: item.color }}>
                                {item.value}
                                <span className="text-xs md:text-sm font-semibold ml-0.5">{item.unit}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ════ Manual Tab ════ */}
          {activeTab === "manual" && (
            <div className="space-y-5">
              {/* Tracking Board */}
              <div
                className="rounded-xl p-4 space-y-3.5"
                style={{ background: "rgba(18,16,13,0.02)", border: "1px solid rgba(18,16,13,0.08)" }}
              >
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>
                  Tracking Board
                </p>
                <TrackingBar
                  label={`Calo · ${totals.calories} / ${liveDer} kcal`}
                  current={totals.calories}
                  target={liveDer}
                  color="#eb0915"
                />
                <TrackingBar
                  label={`Protein · ${Math.round(totals.protein)} / ${liveProtein}g`}
                  current={totals.protein}
                  target={liveProtein}
                  color="#1d4ed8"
                />
                <TrackingBar
                  label={`Fat · ${Math.round(totals.fat)} / ${liveFat}g`}
                  current={totals.fat}
                  target={liveFat}
                  color="#b45309"
                />
                <TrackingBar
                  label={`Carbs · ${Math.round(totals.carbs)} / ${liveCarbs}g`}
                  current={totals.carbs}
                  target={liveCarbs}
                  color="#065f46"
                />
              </div>

              {/* Meal builder */}
              <div className="space-y-4">
                {editingMealId !== null && (
                  <div
                    className="px-3 py-2 rounded-lg text-xs font-bold"
                    style={{ background: "rgba(235,9,21,0.06)", color: "#eb0915", border: "1px solid rgba(235,9,21,0.18)" }}
                  >
                    ✏️ Đang chỉnh sửa — {manualFoods.find(f => f.id === editingMealId)?.name.split(':')[0] ?? 'Bữa ăn'}
                  </div>
                )}
                <p className="dp-label">Ghép bữa ăn từ nguyên liệu</p>
                <div className="space-y-4">
                  {rows.map((row) => (
                    <IngredientSearchRow
                      key={row.id}
                      row={row}
                      isActive={activeDropdown === row.id}
                      canRemove={rows.length > 1}
                      onQueryChange={(val) => {
                        setRows(prev =>
                          prev.map(r => r.id === row.id ? { ...r, query: val, food: null } : r)
                        );
                        setActiveDropdown(row.id);
                      }}
                      onSelect={(food) => {
                        setRows(prev =>
                          prev.map(r => r.id === row.id ? { ...r, food, query: food.name } : r)
                        );
                        setActiveDropdown(null);
                      }}
                      onGramsChange={(g) =>
                        setRows(prev =>
                          prev.map(r => r.id === row.id ? { ...r, grams: g } : r)
                        )
                      }
                      onRemove={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                      onFocus={() => setActiveDropdown(row.id)}
                      onBlur={() =>
                        setTimeout(
                          () => setActiveDropdown(prev => (prev === row.id ? null : prev)),
                          150
                        )
                      }
                    />
                  ))}
                </div>

                {rows.length < 5 && (
                  <button
                    type="button"
                    onClick={() => setRows(prev => [...prev, newRow()])}
                    className="text-sm font-semibold"
                    style={{ color: "#eb0915" }}
                  >
                    + Thêm nguyên liệu ({rows.length}/5)
                  </button>
                )}

                {/* Meal total preview */}
                {(() => {
                  const filled = rows.filter(
                    (r): r is IngredientRow & { food: FoodItem } => r.food !== null
                  );
                  if (filled.length === 0) return null;
                  const total = filled.reduce(
                    (acc, r) => {
                      const m = computeRowMacros(r.food, r.grams);
                      return {
                        calories: acc.calories + m.calories,
                        protein: acc.protein + m.protein,
                        fat: acc.fat + m.fat,
                        carbs: acc.carbs + m.carbs,
                      };
                    },
                    { calories: 0, protein: 0, fat: 0, carbs: 0 }
                  );
                  return (
                    <div
                      className="rounded-xl p-3"
                      style={{ background: "rgba(18,16,13,0.03)", border: "1px solid rgba(18,16,13,0.08)" }}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-widest mb-2"
                        style={{ color: "rgba(18,16,13,0.35)" }}
                      >
                        Tổng bữa · {filled.length} nguyên liệu
                      </p>
                      <div className="flex gap-4 flex-wrap">
                        {[
                          { label: "Calo", value: `${Math.round(total.calories)} kcal`, color: "#eb0915" },
                          { label: "Protein", value: `${Math.round(total.protein)}g`, color: "#1d4ed8" },
                          { label: "Fat", value: `${Math.round(total.fat)}g`, color: "#b45309" },
                          { label: "Carbs", value: `${Math.round(total.carbs)}g`, color: "#065f46" },
                        ].map(item => (
                          <div key={item.label}>
                            <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{item.label}</p>
                            <p className="text-sm font-bold" style={{ color: item.color }}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmMeal}
                    disabled={rows.every(r => r.food === null)}
                    className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                    style={{
                      background: rows.some(r => r.food !== null) ? "#12100d" : "rgba(18,16,13,0.3)",
                      color: "#ffffff",
                      cursor: rows.some(r => r.food !== null) ? "pointer" : "not-allowed",
                    }}
                  >
                    {editingMealId !== null ? "↩ Cập nhật Bữa ăn" : "✓ Xác nhận gộp bữa"}
                  </button>
                  {editingMealId !== null && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="py-3 px-4 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                      style={{ background: "rgba(18,16,13,0.08)", color: "rgba(18,16,13,0.6)" }}
                    >
                      Hủy
                    </button>
                  )}
                </div>
              </div>

              {/* Food list */}
              {manualFoods.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>
                    Danh sách đã nhập ({manualFoods.length} bữa)
                  </p>
                  {manualFoods.map((food) => {
                    const isEditing = food.id === editingMealId;
                    return (
                      <div
                        key={food.id}
                        className="flex items-center gap-2 rounded-xl px-4 py-3"
                        style={{
                          background: isEditing ? "rgba(235,9,21,0.04)" : "rgba(18,16,13,0.025)",
                          border: isEditing ? "1px solid rgba(235,9,21,0.25)" : "1px solid rgba(18,16,13,0.07)",
                          opacity: isEditing ? 0.75 : 1,
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold truncate" style={{ color: "#12100d" }}>
                              {food.name}
                            </p>
                            {isEditing && (
                              <span
                                className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                                style={{ background: "rgba(235,9,21,0.1)", color: "#eb0915" }}
                              >
                                đang sửa
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(18,16,13,0.4)" }}>
                            {Math.round(food.calories)} kcal &nbsp;·&nbsp; P:{Math.round(food.protein)}g F:{Math.round(food.fat)}g C:{Math.round(food.carbs)}g
                          </p>
                        </div>
                        {/* Nút chỉnh sửa ✏️ */}
                        <button
                          type="button"
                          onClick={() => handleEditMeal(food)}
                          disabled={isEditing}
                          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all"
                          style={{
                            background: isEditing ? "rgba(18,16,13,0.04)" : "rgba(18,16,13,0.07)",
                            color: isEditing ? "rgba(18,16,13,0.2)" : "rgba(18,16,13,0.5)",
                            cursor: isEditing ? "not-allowed" : "pointer",
                          }}
                          aria-label="Chỉnh sửa bữa"
                        >
                          ✏️
                        </button>
                        {/* Nút xoá */}
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingMealId(null);
                              setRows([newRow()]);
                            }
                            setManualFoods((prev) => prev.filter((f) => f.id !== food.id));
                          }}
                          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base font-bold transition-all"
                          style={{ background: "rgba(235,9,21,0.08)", color: "#eb0915" }}
                          aria-label="Xoá bữa"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── PDF export ── */}
      {hasMealData && (
        <button
          type="button"
          onClick={handleExportPDF}
          disabled={pdfLoading}
          className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
          style={{
            background: pdfLoading ? "rgba(18,16,13,0.55)" : "#12100d",
            color: "#ffffff",
            cursor: pdfLoading ? "not-allowed" : "pointer",
          }}
        >
          {pdfLoading ? (
            <><Spinner light /> Đang tạo PDF...</>
          ) : (
            <>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Tải PDF thực đơn
            </>
          )}
        </button>
      )}

      {/* ── Hidden PDF template (off-screen for html2canvas) ── */}
      <div
        ref={pdfRef}
        style={{
          position: "absolute",
          top: 0,
          left: "-9999px",
          width: "794px",
          background: "#ffffff",
          fontFamily: "Montserrat, sans-serif",
          zIndex: -1,
        }}
      >
        <PdfTemplate
          result={result}
          aiMeals={aiMeals}
          manualFoods={manualFoods}
          date={today}
        />
      </div>
    </div>
  );
}
