"use client";

import { useState, useRef, useCallback } from "react";
import type { NutritionResult } from "./DietForm";

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

interface ManualFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

type Tab = "ai" | "manual";
type MealCount = 2 | 3 | 4 | 5;

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
    calories: Number(item.calories ?? 0),
    protein: Number(item.protein ?? 0),
    fat: Number(item.fat ?? 0),
    carbs: Number(item.carbs ?? 0),
  }));
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
          {over ? `+${current - target} vượt` : `còn ${target - current}`}
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
          P: {meal.protein}g<br />
          F: {meal.fat}g<br />
          C: {meal.carbs}g
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

      {/* ── AI Meal table (flat — one row per meal) ── */}
      {aiMeals && aiMeals.length > 0 && (
        <div style={{ padding: "0 40px 24px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
            Kế hoạch thực đơn AI
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, whiteSpace: "nowrap" }}>Bữa ăn</th>
                <th style={thDark}>Thực đơn chi tiết</th>
                <th style={{ ...thDark, textAlign: "right" }}>Calo</th>
                <th style={{ ...thDark, textAlign: "right" }}>P(g)</th>
                <th style={{ ...thDark, textAlign: "right" }}>F(g)</th>
                <th style={{ ...thDark, textAlign: "right" }}>C(g)</th>
              </tr>
            </thead>
            <tbody>
              {aiMeals.map((meal, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}>
                  <td style={{ ...tdBold, color: "#eb0915", whiteSpace: "nowrap" }}>{meal.mealName}</td>
                  <td style={td}>{meal.name}</td>
                  <td style={{ ...tdRight, fontWeight: 600 }}>{meal.calories}</td>
                  <td style={tdRight}>{meal.protein}</td>
                  <td style={tdRight}>{meal.fat}</td>
                  <td style={tdRight}>{meal.carbs}</td>
                </tr>
              ))}
              {aiGrand && (
                <tr style={{ background: "rgba(235,9,21,0.05)" }}>
                  <td style={{ ...tdBold, color: "#eb0915" }} colSpan={2}>Tổng cả ngày</td>
                  <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{aiGrand.cal}</td>
                  <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{aiGrand.p}</td>
                  <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{aiGrand.f}</td>
                  <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{aiGrand.c}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Manual foods table ── */}
      {manualFoods.length > 0 && (
        <div style={{ padding: "0 40px 24px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "10px" }}>
            Thực đơn tự nhập
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Món ăn</th>
                <th style={{ ...th, textAlign: "right" }}>Calo</th>
                <th style={{ ...th, textAlign: "right" }}>P(g)</th>
                <th style={{ ...th, textAlign: "right" }}>F(g)</th>
                <th style={{ ...th, textAlign: "right" }}>C(g)</th>
              </tr>
            </thead>
            <tbody>
              {manualFoods.map((food, i) => (
                <tr key={food.id} style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}>
                  <td style={td}>{food.name}</td>
                  <td style={{ ...tdRight, fontWeight: 600 }}>{food.calories}</td>
                  <td style={tdRight}>{food.protein}</td>
                  <td style={tdRight}>{food.fat}</td>
                  <td style={tdRight}>{food.carbs}</td>
                </tr>
              ))}
              <tr style={{ background: "rgba(235,9,21,0.04)" }}>
                <td style={{ ...tdBold, color: "#eb0915" }}>Tổng ngày</td>
                <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{manualTotal.cal}</td>
                <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{manualTotal.p}</td>
                <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{manualTotal.f}</td>
                <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{manualTotal.c}</td>
              </tr>
            </tbody>
          </table>
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

export default function MealPlanSection({ result }: { result: NutritionResult }) {
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
  const [manualForm, setManualForm] = useState({ name: "", calories: "", protein: "", fat: "", carbs: "" });
  const [manualError, setManualError] = useState<string | null>(null);

  const [pdfLoading, setPdfLoading] = useState(false);

  const totals = manualFoods.reduce(
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

    const prompt = `Bạn là chuyên gia dinh dưỡng của Diet Plan. Thiết kế thực đơn ${mealCount} bữa cho khách hàng sau (1 lần gọi duy nhất, trả về toàn bộ ngày):

Mục tiêu: ${result.der} kcal | P:${result.protein}g F:${result.fat}g C:${result.carbs}g
Thích: ${result.likes || "không có"} | Ghét: ${result.dislikes || "không có"}

Quy tắc bắt buộc:
- Ưu tiên món khách THÍCH. Tuyệt đối không dùng món khách GHÉT.
- Nếu ghét cơm trắng: thay bằng cơm lứt, khoai lang hoặc bún gạo lứt.
- Cấm tuyệt đối: ức gà, lòng trắng trứng, nước ép, sữa hạt.
- Ghi định lượng rõ ràng trong trường "name" (vd: "Cơm lứt 200g + Cá lóc hấp 150g + Rau cải 100g").
- Tổng calo ≈ ${result.der} kcal (±50 kcal).

Trả về CHỈ JSON hợp lệ, không markdown, không giải thích:
[{"mealName":"Bữa 1 - Sáng (7:00)","name":"Tên món 1 150g + Tên món 2 200g","calories":500,"protein":35,"fat":15,"carbs":55}]`;

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data: { result?: string; error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Lỗi từ Gemini API");
      if (!data.result) throw new Error("Gemini không trả về nội dung");
      const meals = parseAiResponse(data.result);
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

  function handleAddFood() {
    if (!manualForm.name.trim()) {
      setManualError("Vui lòng nhập tên món");
      return;
    }
    setManualFoods((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        name: manualForm.name.trim(),
        calories: Math.round(parseFloat(manualForm.calories) || 0),
        protein: Math.round(parseFloat(manualForm.protein) || 0),
        fat: Math.round(parseFloat(manualForm.fat) || 0),
        carbs: Math.round(parseFloat(manualForm.carbs) || 0),
      },
    ]);
    setManualForm({ name: "", calories: "", protein: "", fat: "", carbs: "" });
    setManualError(null);
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
        className="bg-white rounded-2xl shadow-sm overflow-hidden"
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
                    Thực đơn AI gợi ý
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
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: "Calo", value: gt.cal, unit: "kcal", color: "#eb0915" },
                            { label: "Protein", value: gt.p, unit: "g", color: "#1d4ed8" },
                            { label: "Fat", value: gt.f, unit: "g", color: "#b45309" },
                            { label: "Carbs", value: gt.c, unit: "g", color: "#065f46" },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="text-center rounded-lg py-2.5 px-1"
                              style={{ background: "#ffffff", border: "1px solid rgba(18,16,13,0.07)" }}
                            >
                              <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{item.label}</p>
                              <p className="text-lg font-bold mt-0.5" style={{ color: item.color }}>
                                {item.value}
                                <span className="text-xs font-semibold ml-0.5">{item.unit}</span>
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
                  label={`Calo · ${totals.calories} / ${result.der} kcal`}
                  current={totals.calories}
                  target={result.der}
                  color="#eb0915"
                />
                <TrackingBar
                  label={`Protein · ${totals.protein} / ${result.protein}g`}
                  current={totals.protein}
                  target={result.protein}
                  color="#1d4ed8"
                />
                <TrackingBar
                  label={`Fat · ${totals.fat} / ${result.fat}g`}
                  current={totals.fat}
                  target={result.fat}
                  color="#b45309"
                />
                <TrackingBar
                  label={`Carbs · ${totals.carbs} / ${result.carbs}g`}
                  current={totals.carbs}
                  target={result.carbs}
                  color="#065f46"
                />
              </div>

              {/* Add food form */}
              <div>
                <p className="dp-label">Thêm món ăn</p>
                <div className="space-y-2 mt-1">
                  <input
                    type="text"
                    placeholder="Tên món ăn (bắt buộc)"
                    value={manualForm.name}
                    onChange={(e) => setManualForm((p) => ({ ...p, name: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleAddFood()}
                    className="dp-input"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    {(["calories", "protein", "fat", "carbs"] as const).map((field) => (
                      <input
                        key={field}
                        type="number"
                        placeholder={{ calories: "Calo", protein: "P (g)", fat: "F (g)", carbs: "C (g)" }[field]}
                        value={manualForm[field]}
                        onChange={(e) => setManualForm((p) => ({ ...p, [field]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && handleAddFood()}
                        className="dp-input"
                        min={0}
                      />
                    ))}
                  </div>
                </div>
                {manualError && <p className="dp-error-msg mt-1">{manualError}</p>}
                <button
                  type="button"
                  onClick={handleAddFood}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                  style={{ background: "#12100d", color: "#ffffff" }}
                >
                  + Thêm món
                </button>
              </div>

              {/* Food list */}
              {manualFoods.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>
                    Danh sách đã nhập ({manualFoods.length} món)
                  </p>
                  {manualFoods.map((food) => (
                    <div
                      key={food.id}
                      className="flex items-center gap-3 rounded-xl px-4 py-3"
                      style={{ background: "rgba(18,16,13,0.025)", border: "1px solid rgba(18,16,13,0.07)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#12100d" }}>
                          {food.name}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(18,16,13,0.4)" }}>
                          {food.calories} kcal &nbsp;·&nbsp; P:{food.protein}g F:{food.fat}g C:{food.carbs}g
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setManualFoods((prev) => prev.filter((f) => f.id !== food.id))}
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base font-bold transition-all"
                        style={{ background: "rgba(235,9,21,0.08)", color: "#eb0915" }}
                        aria-label="Xoá"
                      >
                        ×
                      </button>
                    </div>
                  ))}
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
