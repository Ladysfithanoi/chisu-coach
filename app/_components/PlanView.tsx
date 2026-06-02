"use client";

import type { AiMeal, ManualFood } from "./MealPlanSection";

export interface SavedPlan {
  label: string | null;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  mealCount: number;
  nutritionJson: unknown;
  aiMealsJson: AiMeal[] | null;
  manualFoodsJson: ManualFood[] | null;
  updatedAt?: string;
}

function MacroChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-md"
      style={{ background: `${color}14`, color }}
    >
      {label} {value}g
    </span>
  );
}

export default function PlanView({ plan }: { plan: SavedPlan }) {
  const aiMeals = plan.aiMealsJson ?? [];
  const manualFoods = plan.manualFoodsJson ?? [];
  const hasMeals = aiMeals.length > 0 || manualFoods.length > 0;

  return (
    <div className="space-y-6">
      {/* ── Tổng quan macro mục tiêu ── */}
      <div
        className="bg-white rounded-2xl shadow-sm p-6"
        style={{ border: "1px solid rgba(18,16,13,0.1)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: "#12100d" }}>
            {plan.label ?? "Thực đơn của bạn"}
          </h2>
          <span
            className="text-2xl font-extrabold"
            style={{ color: "#eb0915" }}
          >
            {plan.calories.toLocaleString("vi-VN")}
            <span className="text-sm font-semibold"> kcal/ngày</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <MacroChip label="Đạm" value={plan.protein} color="#eb0915" />
          <MacroChip label="Béo" value={plan.fat} color="#d97706" />
          <MacroChip label="Tinh bột" value={plan.carbs} color="#2563eb" />
        </div>
      </div>

      {!hasMeals && (
        <div
          className="bg-white rounded-2xl p-6 text-center text-sm"
          style={{ border: "1px solid rgba(18,16,13,0.1)", color: "rgba(18,16,13,0.5)" }}
        >
          PT chưa thêm chi tiết món ăn cho thực đơn này.
        </div>
      )}

      {/* ── Các bữa AI ── */}
      {aiMeals.map((meal, i) => (
        <div
          key={`ai-${i}`}
          className="bg-white rounded-2xl shadow-sm p-5"
          style={{ border: "1px solid rgba(18,16,13,0.1)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: "#eb0915" }}>
              {meal.mealName}
            </h3>
            <span className="text-sm font-bold" style={{ color: "#12100d" }}>
              {meal.calories} kcal
            </span>
          </div>
          <p className="text-sm mb-3" style={{ color: "#12100d" }}>{meal.name}</p>
          <div className="flex flex-wrap gap-2">
            <MacroChip label="Đạm" value={meal.protein} color="#eb0915" />
            <MacroChip label="Béo" value={meal.fat} color="#d97706" />
            <MacroChip label="Tinh bột" value={meal.carbs} color="#2563eb" />
          </div>
        </div>
      ))}

      {/* ── Món thủ công ── */}
      {manualFoods.map((food) => (
        <div
          key={`m-${food.id}`}
          className="bg-white rounded-2xl shadow-sm p-5"
          style={{ border: "1px solid rgba(18,16,13,0.1)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold" style={{ color: "#12100d" }}>{food.name}</h3>
            <span className="text-sm font-bold" style={{ color: "#12100d" }}>
              {food.calories} kcal
            </span>
          </div>
          {food.ingredients.length > 0 && (
            <ul className="mb-3 text-xs space-y-0.5" style={{ color: "rgba(18,16,13,0.6)" }}>
              {food.ingredients.map((ing, idx) => (
                <li key={idx}>• {ing.food.name} — {ing.grams}g</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <MacroChip label="Đạm" value={food.protein} color="#eb0915" />
            <MacroChip label="Béo" value={food.fat} color="#d97706" />
            <MacroChip label="Tinh bột" value={food.carbs} color="#2563eb" />
          </div>
        </div>
      ))}
    </div>
  );
}
