"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MealPlanSection from "./MealPlanSection";

// ─── Types ────────────────────────────────────────────────────────────────────

type Gender = "male" | "female";
type BmrFormula = "mifflin" | "harris" | "pyramid";
type ActivityLevel = "level1" | "level2" | "level3" | "level4";
type WeightGoal = "lose" | "gain" | "maintain";

interface FormState {
  name: string;
  gender: Gender;
  height: string;
  weight: string;
  age: string;
  likes: string;
  dislikes: string;
  bmrFormula: BmrFormula;
  activityLevel: ActivityLevel;
  weightGoal: WeightGoal;
}

// Exported so AI-menu route (Bước 3) can import this type
export interface NutritionResult {
  name: string;
  gender: Gender;
  height: number;
  weight: number;
  age: number;
  likes: string;
  dislikes: string;
  bmrFormula: BmrFormula;
  activityLevel: ActivityLevel;
  weightGoal: WeightGoal;
  bmr: number;
  tdee: number;
  der: number;
  protein: number;
  fat: number;
  carbs: number;
  weeklyLoss: number | null;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

// ─── Calculation Logic ────────────────────────────────────────────────────────

function calcBMR(
  formula: BmrFormula,
  gender: Gender,
  weight: number,
  height: number,
  age: number
): number {
  switch (formula) {
    case "mifflin":
      return gender === "male"
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;
    case "harris":
      return gender === "male"
        ? 66.5 + 13.75 * weight + 5.003 * height - 6.75 * age
        : 655.1 + 9.563 * weight + 1.85 * height - 4.676 * age;
    case "pyramid":
      return weight * 22;
  }
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  level1: 1.2,
  level2: 1.4,
  level3: 1.6,
  level4: 1.4,
};

function calcTDEE(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[level];
}

function calcDER(
  tdee: number,
  goal: WeightGoal,
  weight: number
): { der: number; weeklyLoss: number | null } {
  switch (goal) {
    case "lose": {
      const weeklyLoss = weight * 0.01;
      const dailyDeficit = (weeklyLoss * 7700) / 7;
      return { der: tdee - dailyDeficit, weeklyLoss };
    }
    case "gain":
      return { der: tdee + 500, weeklyLoss: null };
    case "maintain":
      return { der: tdee, weeklyLoss: null };
  }
}

function calcMacros(
  height: number,
  der: number
): { protein: number; fat: number; carbs: number } {
  const protein = (height - 100) * 0.9 * 2;
  const fat = 50;
  const carbs = Math.max(0, (der - protein * 4 - fat * 9) / 4);
  return { protein, fat, carbs };
}

// ─── Label Maps ───────────────────────────────────────────────────────────────

const GOAL_LABEL: Record<WeightGoal, string> = {
  lose: "Giảm cân",
  gain: "Tăng cân",
  maintain: "Duy trì",
};

const FORMULA_LABEL: Record<BmrFormula, string> = {
  mifflin: "Mifflin St Jeor",
  harris: "Harris Benedict",
  pyramid: "Pyramid",
};

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  level1: "Tập tạ ≥3 buổi + <5.000 bước/ngày (×1.2)",
  level2: "Tập tạ ≥3 buổi + 5.000–6.999 bước/ngày (×1.4)",
  level3: "Tập tạ ≥3 buổi + 7.000–9.999 bước/ngày (×1.6)",
  level4: "Tập tạ ≥3 buổi + ≥10.000 bước/ngày (×1.4)",
};

const INITIAL_FORM: FormState = {
  name: "",
  gender: "male",
  height: "",
  weight: "",
  age: "",
  likes: "",
  dislikes: "",
  bmrFormula: "mifflin",
  activityLevel: "level1",
  weightGoal: "lose",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DietForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [result, setResult] = useState<NutritionResult | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loggingOut, setLoggingOut] = useState(false);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormState]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  function setGoal(goal: WeightGoal) {
    setForm((prev) => ({ ...prev, weightGoal: goal }));
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = "Vui lòng nhập họ và tên";
    const h = parseFloat(form.height);
    if (!form.height || isNaN(h) || h < 100 || h > 250)
      next.height = "Chiều cao phải từ 100 – 250 cm";
    const w = parseFloat(form.weight);
    if (!form.weight || isNaN(w) || w < 30 || w > 300)
      next.weight = "Cân nặng phải từ 30 – 300 kg";
    const a = parseInt(form.age, 10);
    if (!form.age || isNaN(a) || a < 10 || a > 100)
      next.age = "Tuổi phải từ 10 – 100";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleCalculate() {
    if (!validate()) return;
    const h = parseFloat(form.height);
    const w = parseFloat(form.weight);
    const a = parseInt(form.age, 10);
    const bmr = calcBMR(form.bmrFormula, form.gender, w, h, a);
    const tdee = calcTDEE(bmr, form.activityLevel);
    const { der, weeklyLoss } = calcDER(tdee, form.weightGoal, w);
    const { protein, fat, carbs } = calcMacros(h, der);
    setResult({
      name: form.name.trim(),
      gender: form.gender,
      height: h,
      weight: w,
      age: a,
      likes: form.likes.trim(),
      dislikes: form.dislikes.trim(),
      bmrFormula: form.bmrFormula,
      activityLevel: form.activityLevel,
      weightGoal: form.weightGoal,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      der: Math.round(der),
      protein: Math.round(protein),
      fat,
      carbs: Math.round(carbs),
      weeklyLoss,
    });
    setTimeout(() => {
      document.getElementById("result-card")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-white py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* ── Header ── */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#12100d" }}>
              Diet Plan
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: "rgba(18,16,13,0.5)" }}>
              Máy tính dinh dưỡng chuyên sâu
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-xl transition-all"
            style={{
              border: "1px solid rgba(18,16,13,0.12)",
              color: "rgba(18,16,13,0.55)",
              background: "transparent",
            }}
            title="Đăng xuất"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {loggingOut ? "..." : "Đăng xuất"}
          </button>
        </header>

        {/* ── Form Card ── */}
        <div
          className="bg-white rounded-2xl shadow-sm p-6 space-y-6"
          style={{ border: "1px solid rgba(18,16,13,0.1)" }}
        >
          <section>
            <SectionTitle>Thông tin khách hàng</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div className="sm:col-span-2">
                <label htmlFor="name" className="dp-label">Họ và tên</label>
                <input id="name" type="text" name="name" value={form.name}
                  onChange={handleChange} placeholder="Nguyễn Văn A"
                  className={`dp-input ${errors.name ? "dp-input-error" : ""}`} />
                {errors.name && <p className="dp-error-msg">{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="gender" className="dp-label">Giới tính</label>
                <select id="gender" name="gender" value={form.gender}
                  onChange={handleChange} className="dp-input">
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                </select>
              </div>

              <div>
                <label htmlFor="age" className="dp-label">Tuổi</label>
                <input id="age" type="number" name="age" value={form.age}
                  onChange={handleChange} placeholder="25" min={10} max={100}
                  className={`dp-input ${errors.age ? "dp-input-error" : ""}`} />
                {errors.age && <p className="dp-error-msg">{errors.age}</p>}
              </div>

              <div>
                <label htmlFor="height" className="dp-label">Chiều cao (cm)</label>
                <input id="height" type="number" name="height" value={form.height}
                  onChange={handleChange} placeholder="170" min={100} max={250}
                  className={`dp-input ${errors.height ? "dp-input-error" : ""}`} />
                {errors.height && <p className="dp-error-msg">{errors.height}</p>}
              </div>

              <div>
                <label htmlFor="weight" className="dp-label">Cân nặng (kg)</label>
                <input id="weight" type="number" name="weight" value={form.weight}
                  onChange={handleChange} placeholder="65" min={30} max={300}
                  className={`dp-input ${errors.weight ? "dp-input-error" : ""}`} />
                {errors.weight && <p className="dp-error-msg">{errors.weight}</p>}
              </div>

              <div>
                <label htmlFor="likes" className="dp-label">
                  Thích ăn{" "}
                  <span style={{ color: "rgba(18,16,13,0.35)", fontWeight: 400 }}>(tuỳ chọn)</span>
                </label>
                <input id="likes" type="text" name="likes" value={form.likes}
                  onChange={handleChange} placeholder="Cơm, thịt gà, rau xanh..."
                  className="dp-input" />
              </div>

              <div>
                <label htmlFor="dislikes" className="dp-label">
                  Ghét ăn{" "}
                  <span style={{ color: "rgba(18,16,13,0.35)", fontWeight: 400 }}>(tuỳ chọn)</span>
                </label>
                <input id="dislikes" type="text" name="dislikes" value={form.dislikes}
                  onChange={handleChange} placeholder="Hải sản, cà tím..."
                  className="dp-input" />
              </div>

            </div>
          </section>

          <hr style={{ borderColor: "rgba(18,16,13,0.08)" }} />

          <section>
            <SectionTitle>Công thức & mục tiêu</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <label htmlFor="bmrFormula" className="dp-label">Công thức tính BMR</label>
                <select id="bmrFormula" name="bmrFormula" value={form.bmrFormula}
                  onChange={handleChange} className="dp-input">
                  {(Object.keys(FORMULA_LABEL) as BmrFormula[]).map((f) => (
                    <option key={f} value={f}>{FORMULA_LABEL[f]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="activityLevel" className="dp-label">Mức độ vận động / Bước chân</label>
                <select id="activityLevel" name="activityLevel" value={form.activityLevel}
                  onChange={handleChange} className="dp-input">
                  {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((l) => (
                    <option key={l} value={l}>{ACTIVITY_LABEL[l]}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <p className="dp-label">Mục tiêu cân nặng</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["lose", "maintain", "gain"] as WeightGoal[]).map((g) => {
                    const active = form.weightGoal === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGoal(g)}
                        className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={{
                          border: active ? "1px solid #eb0915" : "1px solid rgba(18,16,13,0.15)",
                          background: active ? "#eb0915" : "#ffffff",
                          color: active ? "#ffffff" : "#12100d",
                        }}
                      >
                        {GOAL_LABEL[g]}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </section>

          <button
            type="button"
            onClick={handleCalculate}
            className="w-full py-3.5 rounded-xl font-bold text-base tracking-wide transition-all active:scale-[0.98]"
            style={{ background: "#eb0915", color: "#ffffff" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#c8071a")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#eb0915")}
          >
            Tính toán ngay
          </button>
        </div>

        {/* ── Result Card ── */}
        {result && (
          <div
            id="result-card"
            className="mt-6 bg-white rounded-2xl shadow-sm p-6"
            style={{ border: "1px solid rgba(18,16,13,0.1)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold" style={{ color: "#12100d" }}>
                  {result.name}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "rgba(18,16,13,0.45)" }}>
                  {result.gender === "male" ? "Nam" : "Nữ"} · {result.age} tuổi · {result.height} cm · {result.weight} kg
                </p>
              </div>
              <span
                className="text-xs font-semibold px-3 py-1 rounded-full"
                style={{ background: "rgba(235,9,21,0.08)", color: "#eb0915" }}
              >
                {GOAL_LABEL[result.weightGoal]}
              </span>
            </div>

            <div
              className="rounded-xl px-4 py-2.5 mb-3 flex items-center justify-between"
              style={{ background: "rgba(18,16,13,0.03)" }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "rgba(18,16,13,0.4)" }}>
                BMR ({FORMULA_LABEL[result.bmrFormula]})
              </span>
              <span className="text-sm font-bold" style={{ color: "#12100d" }}>
                {result.bmr.toLocaleString("vi-VN")} kcal
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <StatBox label="TDEE" value={`${result.tdee.toLocaleString("vi-VN")} kcal`}
                sub="Năng lượng duy trì" />
              <StatBox label="DER — Mục tiêu" value={`${result.der.toLocaleString("vi-VN")} kcal`}
                sub="Calo cần nạp mỗi ngày" highlight />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <MacroBox label="Protein" value={result.protein} unit="g"
                bg="rgba(59,130,246,0.07)" color="#1d4ed8" />
              <MacroBox label="Fat" value={result.fat} unit="g"
                bg="rgba(245,158,11,0.07)" color="#b45309" />
              <MacroBox label="Carbs" value={result.carbs} unit="g"
                bg="rgba(16,185,129,0.07)" color="#065f46" />
            </div>

            {result.weeklyLoss !== null && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "rgba(235,9,21,0.04)",
                  border: "1px solid rgba(235,9,21,0.15)",
                  color: "#12100d",
                }}
              >
                <span className="font-semibold" style={{ color: "#eb0915" }}>Dự kiến:</span>{" "}
                Với mức thâm hụt này, khách có thể giảm khoảng{" "}
                <span className="font-bold" style={{ color: "#eb0915" }}>
                  {result.weeklyLoss.toFixed(2)} kg
                </span>{" "}
                trong 1 tuần.
              </div>
            )}
          </div>
        )}

        {/* ── Meal Plan Section (Bước 3) ── */}
        {result && <MealPlanSection result={result} />}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest mb-4"
      style={{ color: "rgba(18,16,13,0.35)" }}>
      {children}
    </h2>
  );
}

function StatBox({ label, value, sub, highlight = false }: {
  label: string; value: string; sub: string; highlight?: boolean;
}) {
  return (
    <div className="rounded-xl p-4"
      style={{ background: highlight ? "#eb0915" : "rgba(18,16,13,0.04)", color: highlight ? "#ffffff" : "#12100d" }}>
      <p className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: highlight ? "rgba(255,255,255,0.65)" : "rgba(18,16,13,0.45)" }}>
        {label}
      </p>
      <p className="text-2xl font-bold mt-1 leading-none">{value}</p>
      <p className="text-xs mt-1"
        style={{ color: highlight ? "rgba(255,255,255,0.55)" : "rgba(18,16,13,0.4)" }}>
        {sub}
      </p>
    </div>
  );
}

function MacroBox({ label, value, unit, bg, color }: {
  label: string; value: number; unit: string; bg: string; color: string;
}) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: bg }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color, opacity: 0.7 }}>
        {label}
      </p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>
        {value}<span className="text-sm font-semibold ml-0.5">{unit}</span>
      </p>
    </div>
  );
}
