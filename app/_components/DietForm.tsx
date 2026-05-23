"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import MealPlanSection from "./MealPlanSection";

// ─── Types ────────────────────────────────────────────────────────────────────

type Gender = "male" | "female";
type BmrFormula = "mifflin" | "harris" | "pyramid";
type ActivityLevel = "level1" | "level2" | "level3" | "level4";
type WeightGoal = "lose" | "gain" | "maintain";
type GoalInputMode = "target_weight" | "kg_to_lose";

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
  goalInputMode: GoalInputMode;
  goalInputValue: string;
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
  totalToLose: number | null;
  weeksToGoal: number | null;
  daysToGoal: number | null;
  monthsToGoal: number | null;
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

function computeRoadmap(
  weight: number,
  goalInputMode: GoalInputMode,
  goalInputValue: string
): { totalToLose: number; weeksToGoal: number; daysToGoal: number; monthsToGoal: number } | null {
  const val = parseFloat(goalInputValue);
  if (isNaN(val) || val <= 0) return null;
  const totalToLose = goalInputMode === "target_weight" ? weight - val : val;
  if (totalToLose <= 0) return null;
  const weeklyLoss = weight * 0.01;
  const weeksToGoal = Math.round(totalToLose / weeklyLoss);
  const daysToGoal = weeksToGoal * 7;
  const monthsToGoal = Math.round((weeksToGoal / 4) * 10) / 10;
  return { totalToLose, weeksToGoal, daysToGoal, monthsToGoal };
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
  goalInputMode: "kg_to_lose",
  goalInputValue: "",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DietForm({ userName }: { userName: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [result, setResult] = useState<NutritionResult | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loggingOut, setLoggingOut] = useState(false);

  // Macro editor state
  const [macroP, setMacroP] = useState(0);
  const [macroF, setMacroF] = useState(0);
  const [macroC, setMacroC] = useState(0);
  const [autoBalance, setAutoBalance] = useState(true);
  const [macroAlert, setMacroAlert] = useState("");

  // Sync macro inputs whenever a new result is calculated
  useEffect(() => {
    if (result) {
      setMacroP(result.protein);
      setMacroF(result.fat);
      setMacroC(result.carbs);
      setMacroAlert("");
    }
  }, [result]);

  // Change-password modal state
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [cpCurrent, setCpCurrent] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpError, setCpError] = useState("");
  const [cpSaving, setCpSaving] = useState(false);

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

  function setGoalMode(mode: GoalInputMode) {
    setForm((prev) => ({ ...prev, goalInputMode: mode, goalInputValue: "" }));
  }

  function handleMacroChange(field: "p" | "f" | "c", rawVal: string) {
    if (!result) return;
    const parsed = parseInt(rawVal, 10);
    if (isNaN(parsed) || parsed < 0) return;
    const val = parsed;
    setMacroAlert("");

    if (!autoBalance) {
      if (field === "p") setMacroP(val);
      else if (field === "f") setMacroF(val);
      else setMacroC(val);
      return;
    }

    const FAT_MIN = 40, CARB_MIN = 30;
    const der = result.der;

    if (field === "p") {
      const remaining = der - val * 4;
      if (remaining < FAT_MIN * 9 + CARB_MIN * 4) {
        setMacroAlert("Fat (40g) và Carb (30g) đã chạm ngưỡng tối thiểu cho sức khỏe tối ưu, không thể điều chỉnh thêm!");
        return;
      }
      setMacroP(val);
      const carbCals = remaining - macroF * 9;
      if (carbCals / 4 >= CARB_MIN) {
        setMacroC(Math.round(carbCals / 4));
      } else {
        setMacroC(CARB_MIN);
        setMacroF(Math.round((remaining - CARB_MIN * 4) / 9));
      }
    } else if (field === "f") {
      const remaining = der - val * 9;
      if (remaining < 0) return;
      setMacroF(val);
      const carbCals = remaining - macroP * 4;
      if (carbCals / 4 >= CARB_MIN) {
        setMacroC(Math.round(carbCals / 4));
      } else {
        setMacroC(CARB_MIN);
        setMacroP(Math.max(0, Math.round((remaining - CARB_MIN * 4) / 4)));
      }
    } else {
      const remaining = der - val * 4;
      if (remaining < 0) return;
      setMacroC(val);
      const fatCals = remaining - macroP * 4;
      if (fatCals / 9 >= FAT_MIN) {
        setMacroF(Math.round(fatCals / 9));
      } else {
        setMacroF(FAT_MIN);
        setMacroP(Math.max(0, Math.round((remaining - FAT_MIN * 9) / 4)));
      }
    }
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
    const roadmap = form.weightGoal === "lose"
      ? computeRoadmap(w, form.goalInputMode, form.goalInputValue)
      : null;

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
      totalToLose: roadmap?.totalToLose ?? null,
      weeksToGoal: roadmap?.weeksToGoal ?? null,
      daysToGoal: roadmap?.daysToGoal ?? null,
      monthsToGoal: roadmap?.monthsToGoal ?? null,
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

  function openChangePwd() {
    setCpCurrent(""); setCpNew(""); setCpConfirm(""); setCpError("");
    setShowChangePwd(true);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (cpSaving) return;
    setCpSaving(true);
    setCpError("");

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew, confirmPassword: cpConfirm }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok) { setCpError(data.error ?? "Đã có lỗi xảy ra"); return; }

      router.push("/login");
      router.refresh();
    } catch {
      setCpError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setCpSaving(false);
    }
  }

  const liveRoadmap = (() => {
    if (form.weightGoal !== "lose") return null;
    const w = parseFloat(form.weight);
    if (isNaN(w) || w < 30) return null;
    return computeRoadmap(w, form.goalInputMode, form.goalInputValue);
  })();

  // Live calorie total: auto-balance always matches DER; manual mode uses edited macros
  const liveDer = result
    ? (autoBalance ? result.der : macroP * 4 + macroF * 9 + macroC * 4)
    : 0;

  return (
    <>
      {/* ── Change Password Modal ── */}
      {showChangePwd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(18,16,13,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowChangePwd(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ background: "white", border: "1px solid rgba(18,16,13,0.08)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold" style={{ color: "#12100d" }}>Đổi mật khẩu</h3>
              <button
                onClick={() => setShowChangePwd(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg"
                style={{ color: "rgba(18,16,13,0.4)", background: "rgba(18,16,13,0.05)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="dp-label">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  value={cpCurrent}
                  onChange={(e) => { setCpCurrent(e.target.value); setCpError(""); }}
                  placeholder="••••••••"
                  required
                  className="dp-input"
                />
              </div>
              <div>
                <label className="dp-label">Mật khẩu mới</label>
                <input
                  type="password"
                  value={cpNew}
                  onChange={(e) => { setCpNew(e.target.value); setCpError(""); }}
                  placeholder="Tối thiểu 6 ký tự"
                  required
                  minLength={6}
                  className="dp-input"
                />
              </div>
              <div>
                <label className="dp-label">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  value={cpConfirm}
                  onChange={(e) => { setCpConfirm(e.target.value); setCpError(""); }}
                  placeholder="••••••••"
                  required
                  className="dp-input"
                />
              </div>

              {cpError && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
                  style={{ background: "rgba(235,9,21,0.05)", border: "1px solid rgba(235,9,21,0.2)", color: "#eb0915" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {cpError}
                </div>
              )}

              <div
                className="rounded-xl px-4 py-2.5 text-xs flex items-start gap-2"
                style={{ background: "rgba(235,9,21,0.04)", border: "1px solid rgba(235,9,21,0.12)", color: "rgba(18,16,13,0.55)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#eb0915" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Sau khi đổi mật khẩu, bạn sẽ được đăng xuất và cần đăng nhập lại.
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowChangePwd(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", background: "transparent" }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={cpSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                  style={{
                    background: cpSaving ? "rgba(235,9,21,0.55)" : "#eb0915",
                    color: "white",
                    cursor: cpSaving ? "not-allowed" : "pointer",
                  }}
                >
                  {cpSaving ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                      </svg>
                      Đang lưu...
                    </span>
                  ) : "Đổi mật khẩu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    <div className="min-h-screen bg-white py-6 md:py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* ── Header ── */}
        <header
          className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6"
          style={{ borderBottom: "1px solid rgba(18,16,13,0.08)" }}
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight" style={{ color: "#12100d" }}>
              Diet Plan{" "}
              <span style={{ color: "#eb0915" }}>của {userName}</span>
            </h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(18,16,13,0.5)" }}>
              Máy tính dinh dưỡng chuyên sâu
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openChangePwd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
              style={{
                background: "rgba(18,16,13,0.05)",
                color: "rgba(18,16,13,0.7)",
                border: "1px solid rgba(18,16,13,0.1)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(18,16,13,0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(18,16,13,0.05)")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Đổi mật khẩu
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors"
              style={{
                background: "rgba(235,9,21,0.06)",
                color: "#eb0915",
                border: "1px solid rgba(235,9,21,0.2)",
                cursor: loggingOut ? "not-allowed" : "pointer",
                opacity: loggingOut ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!loggingOut) e.currentTarget.style.background = "rgba(235,9,21,0.12)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(235,9,21,0.06)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              {loggingOut ? "Đang xuất..." : "Đăng xuất"}
            </button>
          </div>
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

              {/* ── Goal roadmap inputs — only when "lose" ── */}
              {form.weightGoal === "lose" && (
                <div className="sm:col-span-2 space-y-3">
                  {/* Mode selector */}
                  <div>
                    <p className="dp-label">Nhập mục tiêu theo</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["kg_to_lose", "target_weight"] as GoalInputMode[]).map((mode) => {
                        const active = form.goalInputMode === mode;
                        const label = mode === "kg_to_lose" ? "Số cân muốn giảm" : "Cân nặng mục tiêu";
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setGoalMode(mode)}
                            className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                            style={{
                              border: active ? "1px solid #eb0915" : "1px solid rgba(18,16,13,0.15)",
                              background: active ? "rgba(235,9,21,0.08)" : "#ffffff",
                              color: active ? "#eb0915" : "rgba(18,16,13,0.65)",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Value input */}
                  <div>
                    <label htmlFor="goalInputValue" className="dp-label">
                      {form.goalInputMode === "kg_to_lose"
                        ? "Số cân muốn giảm (kg)"
                        : "Cân nặng mục tiêu (kg)"}
                    </label>
                    <div className="relative">
                      <input
                        id="goalInputValue"
                        type="number"
                        name="goalInputValue"
                        value={form.goalInputValue}
                        onChange={handleChange}
                        placeholder={form.goalInputMode === "kg_to_lose" ? "Ví dụ: 5" : "Ví dụ: 60"}
                        min={form.goalInputMode === "target_weight" ? 30 : 0.5}
                        step={0.1}
                        className="dp-input"
                        style={{ paddingRight: "42px" }}
                      />
                      <span
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                        style={{ color: "rgba(18,16,13,0.4)" }}
                      >
                        kg
                      </span>
                    </div>

                  </div>
                </div>
              )}

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <StatBox label="TDEE" value={`${result.tdee.toLocaleString("vi-VN")} kcal`}
                sub="Năng lượng duy trì" />
              <StatBox label="DER — Mục tiêu" value={`${liveDer.toLocaleString("vi-VN")} kcal`}
                sub="Calo cần nạp mỗi ngày" highlight />
            </div>

            {/* ── Macro Editor ── */}
            <div className="mb-4">
              {/* Header row: label + toggle */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: "rgba(18,16,13,0.35)" }}>
                  Macro (g)
                </p>
                <button
                  type="button"
                  onClick={() => { setAutoBalance((v) => !v); setMacroAlert(""); }}
                  className="flex items-center gap-2 focus:outline-none"
                  aria-label="Tự động chỉnh macro"
                >
                  <span className="text-xs font-medium" style={{ color: "rgba(18,16,13,0.5)" }}>
                    Tự động chỉnh
                  </span>
                  <span
                    className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors duration-200"
                    style={{ background: autoBalance ? "#eb0915" : "rgba(18,16,13,0.2)" }}
                  >
                    <span
                      className="absolute w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
                      style={{ left: autoBalance ? "18px" : "2px" }}
                    />
                  </span>
                </button>
              </div>

              {/* Alert banner */}
              {macroAlert && (
                <div
                  className="mb-2 rounded-xl px-3 py-2 text-xs font-medium flex items-start gap-2"
                  style={{ background: "rgba(235,9,21,0.06)", border: "1px solid rgba(235,9,21,0.2)", color: "#eb0915" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {macroAlert}
                </div>
              )}

              {/* Three macro input boxes */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <MacroInput label="Protein" value={macroP} color="#1d4ed8" bg="rgba(59,130,246,0.07)"
                  onChange={(v) => handleMacroChange("p", v)} />
                <MacroInput label="Fat" value={macroF} color="#b45309" bg="rgba(245,158,11,0.07)"
                  onChange={(v) => handleMacroChange("f", v)} />
                <MacroInput label="Carbs" value={macroC} color="#065f46" bg="rgba(16,185,129,0.07)"
                  onChange={(v) => handleMacroChange("c", v)} />
              </div>

              {/* Manual mode: show computed total cals */}
              {!autoBalance && (
                <div
                  className="mt-2 flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: "rgba(18,16,13,0.03)" }}
                >
                  <span className="text-xs font-semibold" style={{ color: "rgba(18,16,13,0.45)" }}>
                    Tổng Calo thực nhập
                  </span>
                  <span className="text-sm font-bold" style={{ color: "#12100d" }}>
                    {(macroP * 4 + macroF * 9 + macroC * 4).toLocaleString("vi-VN")} kcal
                  </span>
                </div>
              )}
            </div>

            {liveRoadmap ? (
              <div
                className="rounded-xl p-4 shadow-sm"
                style={{ background: "#ffffff", border: "1px solid rgba(18,16,13,0.1)" }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-2"
                  style={{ color: "#eb0915" }}
                >
                  Lộ trình giảm cân
                </p>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(18,16,13,0.7)" }}>
                  Cần{" "}
                  <span className="font-bold" style={{ color: "#eb0915" }}>
                    {liveRoadmap.daysToGoal} ngày
                  </span>{" "}
                  để đạt mục tiêu, tương ứng với khoảng{" "}
                  <span className="font-bold" style={{ color: "#eb0915" }}>
                    {liveRoadmap.weeksToGoal} tuần
                  </span>{" "}
                  (khoảng{" "}
                  <span className="font-bold" style={{ color: "#eb0915" }}>
                    {liveRoadmap.monthsToGoal} tháng
                  </span>
                  ).
                </p>
              </div>
            ) : result.weeklyLoss !== null ? (
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
            ) : null}
          </div>
        )}

        {/* ── Meal Plan Section (Bước 3) ── */}
        {result && (
          <MealPlanSection
            result={result}
            liveProtein={macroP}
            liveFat={macroF}
            liveCarbs={macroC}
            liveDer={liveDer}
          />
        )}

      </div>
    </div>
    </>
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

function MacroInput({ label, value, color, bg, onChange }: {
  label: string; value: number; color: string; bg: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: bg }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-1.5"
        style={{ color, opacity: 0.75 }}>
        {label}
      </p>
      <input
        type="number"
        value={value}
        min={0}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-center font-bold text-xl leading-none bg-transparent border-0 outline-none p-0 m-0"
        style={{
          color,
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "textfield",
        }}
      />
      <p className="text-xs font-semibold mt-1" style={{ color, opacity: 0.6 }}>g</p>
    </div>
  );
}
