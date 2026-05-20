"use client";

import { useState, useRef } from "react";
import type { NutritionResult } from "./DietForm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiFood {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface AiMeal {
  meal: string;
  time: string;
  foods: AiFood[];
  total_calories: number;
  total_protein: number;
  total_fat: number;
  total_carbs: number;
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
  return (parsed as Record<string, unknown>[]).map((item, i) => {
    const foods: AiFood[] = Array.isArray(item.foods)
      ? (item.foods as Record<string, unknown>[]).map((f) => ({
          name: String(f.name ?? ""),
          quantity: String(f.quantity ?? ""),
          calories: Number(f.calories ?? 0),
          protein: Number(f.protein ?? 0),
          fat: Number(f.fat ?? 0),
          carbs: Number(f.carbs ?? 0),
        }))
      : [];
    return {
      meal: String(item.meal ?? `Bữa ${i + 1}`),
      time: String(item.time ?? ""),
      foods,
      total_calories: Number(item.total_calories ?? foods.reduce((s, f) => s + f.calories, 0)),
      total_protein: Number(item.total_protein ?? foods.reduce((s, f) => s + f.protein, 0)),
      total_fat: Number(item.total_fat ?? foods.reduce((s, f) => s + f.fat, 0)),
      total_carbs: Number(item.total_carbs ?? foods.reduce((s, f) => s + f.carbs, 0)),
    };
  });
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
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ background: "rgba(235,9,21,0.05)" }}
      >
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#eb0915" }}>{meal.meal}</span>
        {meal.time && (
          <span style={{ fontSize: "0.75rem", color: "rgba(18,16,13,0.4)" }}>{meal.time}</span>
        )}
      </div>
      <div>
        {meal.foods.map((food, i) => (
          <div
            key={i}
            className="px-4 py-2.5 flex items-start justify-between gap-3"
            style={{ borderTop: i > 0 ? "1px solid rgba(18,16,13,0.05)" : undefined }}
          >
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#12100d" }}>{food.name}</p>
              <p style={{ fontSize: "0.75rem", color: "rgba(18,16,13,0.38)", marginTop: "1px" }}>
                {food.quantity}
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "#12100d" }}>
                {food.calories} kcal
              </p>
              <p style={{ fontSize: "0.7rem", color: "rgba(18,16,13,0.38)" }}>
                P:{food.protein} F:{food.fat} C:{food.carbs}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(18,16,13,0.07)", background: "rgba(18,16,13,0.025)" }}
      >
        <span style={{ fontSize: "0.75rem", color: "rgba(18,16,13,0.38)" }}>Tổng bữa</span>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#12100d" }}>
          {meal.total_calories} kcal &nbsp;·&nbsp; P:{meal.total_protein}g F:{meal.total_fat}g C:{meal.total_carbs}g
        </span>
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
          cal: a.cal + m.total_calories,
          p: a.p + m.total_protein,
          f: a.f + m.total_fat,
          c: a.c + m.total_carbs,
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

      {/* ── AI Meal tables ── */}
      {aiMeals && aiMeals.length > 0 && (
        <div style={{ padding: "0 40px 24px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "12px" }}>
            Kế hoạch thực đơn AI
          </div>
          {aiMeals.map((meal, mi) => (
            <div key={mi} style={{ marginBottom: "18px" }}>
              <div style={{
                fontSize: "12px", fontWeight: 700, color: "#eb0915",
                background: "rgba(235,9,21,0.05)", padding: "8px 13px",
                borderLeft: "3px solid #eb0915",
              }}>
                {meal.meal}{meal.time ? `  ·  ${meal.time}` : ""}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thDark}>Món ăn</th>
                    <th style={{ ...thDark, textAlign: "center" }}>Định lượng</th>
                    <th style={{ ...thDark, textAlign: "right" }}>Calo</th>
                    <th style={{ ...thDark, textAlign: "right" }}>P(g)</th>
                    <th style={{ ...thDark, textAlign: "right" }}>F(g)</th>
                    <th style={{ ...thDark, textAlign: "right" }}>C(g)</th>
                  </tr>
                </thead>
                <tbody>
                  {meal.foods.map((food, fi) => (
                    <tr key={fi} style={{ background: fi % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}>
                      <td style={td}>{food.name}</td>
                      <td style={{ ...td, textAlign: "center", color: "rgba(18,16,13,0.48)" }}>{food.quantity}</td>
                      <td style={{ ...tdRight, fontWeight: 600 }}>{food.calories}</td>
                      <td style={{ ...tdRight }}>{food.protein}</td>
                      <td style={{ ...tdRight }}>{food.fat}</td>
                      <td style={{ ...tdRight }}>{food.carbs}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "rgba(235,9,21,0.04)" }}>
                    <td style={{ ...tdBold, color: "#eb0915" }} colSpan={2}>Tổng bữa</td>
                    <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{meal.total_calories}</td>
                    <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{meal.total_protein}</td>
                    <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{meal.total_fat}</td>
                    <td style={{ ...tdRight, fontWeight: 700, color: "#eb0915" }}>{meal.total_carbs}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          {/* AI grand total boxes */}
          {aiGrand && (
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              {[
                { label: "Tổng Calo", value: `${aiGrand.cal} kcal`, color: "#eb0915" },
                { label: "Protein", value: `${aiGrand.p}g`, color: "#1d4ed8" },
                { label: "Fat", value: `${aiGrand.f}g`, color: "#b45309" },
                { label: "Carbs", value: `${aiGrand.c}g`, color: "#065f46" },
              ].map((item) => (
                <div key={item.label} style={{
                  flex: 1, padding: "10px 12px", borderRadius: "8px",
                  background: "rgba(18,16,13,0.03)", textAlign: "center",
                  border: "1px solid rgba(18,16,13,0.07)",
                }}>
                  <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.38)", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MealPlanSection({ result }: { result: NutritionResult }) {
  const pdfRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<Tab>("ai");
  const [mealCount, setMealCount] = useState<MealCount>(3);
  const [aiLoading, setAiLoading] = useState(false);
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

  async function handleGenerateAI() {
    setAiLoading(true);
    setAiError(null);
    setAiMeals(null);

    const prompt = `Bạn là chuyên gia dinh dưỡng cao cấp của Diet Plan.
Thiết kế thực đơn ${mealCount} bữa ăn trong ngày cho khách hàng sau:

THÔNG TIN KHÁCH HÀNG:
- DER (Calo mục tiêu): ${result.der} kcal/ngày
- Protein: ${result.protein}g | Fat: ${result.fat}g | Carbs: ${result.carbs}g
- Món THÍCH: ${result.likes || "Không có yêu cầu đặc biệt"}
- Món GHÉT: ${result.dislikes || "Không có yêu cầu đặc biệt"}

QUY TẮC BẮT BUỘC (vi phạm = thất bại toàn bộ):
1. ƯU TIÊN dùng món khách THÍCH. TUYỆT ĐỐI KHÔNG đưa vào bất kỳ món khách GHÉT.
2. Nếu khách ghét cơm trắng: thay bằng cơm lứt, khoai lang hoặc bún gạo lứt.
3. DANH SÁCH CẤM tuyệt đối (không được xuất hiện): ức gà, lòng trắng trứng, nước ép trái cây, sữa hạt.
4. Ghi rõ định lượng từng món (ví dụ: 150g cá lóc hấp, 200g cơm lứt, 1 quả trứng nguyên).
5. Tổng calo tất cả bữa xấp xỉ ${result.der} kcal (±50 kcal chấp nhận được).
6. Phân bổ macro đạt: ~${result.protein}g protein, ~${result.fat}g fat, ~${result.carbs}g carbs.

Trả về CHỈ JSON hợp lệ (không markdown, không giải thích):
[{"meal":"Bữa 1 - Sáng","time":"7:00","foods":[{"name":"Tên món","quantity":"150g","calories":200,"protein":15,"fat":5,"carbs":20}],"total_calories":200,"total_protein":15,"total_fat":5,"total_carbs":20}]`;

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
    }
  }

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

  // ── Spinner SVG ───────────────────────────────────────────────────────────

  const Spinner = ({ light = false }: { light?: boolean }) => (
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

              {/* Generate button */}
              <button
                type="button"
                onClick={handleGenerateAI}
                disabled={aiLoading}
                className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: aiLoading ? "rgba(235,9,21,0.65)" : "#eb0915",
                  color: "#ffffff",
                  cursor: aiLoading ? "not-allowed" : "pointer",
                }}
              >
                {aiLoading ? (
                  <><Spinner light /> AI đang phân tích...</>
                ) : (
                  "✨ Gợi ý bằng AI"
                )}
              </button>

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
                      (a, m) => ({ cal: a.cal + m.total_calories, p: a.p + m.total_protein, f: a.f + m.total_fat, c: a.c + m.total_carbs }),
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
