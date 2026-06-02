"use client";

import { useState } from "react";
import AppHeader from "../_components/AppHeader";
import PlanView, { type SavedPlan } from "../_components/PlanView";
import MealPlanSection from "../_components/MealPlanSection";
import WeightTracker from "../_components/WeightTracker";
import FoodLogTracker from "../_components/FoodLogTracker";
import type { NutritionResult } from "../_components/DietForm";
import type { WeightPoint } from "@/lib/weight";

type Tab = "plan" | "foodlog" | "weight";

export default function StudentHome({
  studentName,
  ptPlan,
  weightEntries,
}: {
  studentName: string;
  ptPlan: SavedPlan | null;
  weightEntries: WeightPoint[];
}) {
  const [tab, setTab] = useState<Tab>("plan");

  return (
    <div className="min-h-screen bg-white py-6 md:py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <AppHeader title={`Xin chào, ${studentName}`} subtitle="Chế độ dinh dưỡng của bạn" />

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <TabButton active={tab === "plan"} onClick={() => setTab("plan")}>Thực đơn</TabButton>
          <TabButton active={tab === "foodlog"} onClick={() => setTab("foodlog")}>Nhật ký</TabButton>
          <TabButton active={tab === "weight"} onClick={() => setTab("weight")}>Cân nặng</TabButton>
        </div>

        {tab === "plan" ? (
          ptPlan ? (
            <>
              {/* Calo + thực đơn PT tính cho */}
              <PlanView plan={ptPlan} />

              {/* Tự lên thực đơn bằng AI hoặc thủ công — dùng macro mục tiêu từ PT */}
              <div className="mt-10 pt-6" style={{ borderTop: "1px solid rgba(18,16,13,0.08)" }}>
                <h2 className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(18,16,13,0.35)" }}>
                  Tự lên thực đơn
                </h2>
                <p className="text-sm mb-4" style={{ color: "rgba(18,16,13,0.5)" }}>
                  Tạo thực đơn của riêng bạn bằng AI hoặc thêm món thủ công, theo đúng mục tiêu calo PT đặt ra.
                </p>
                <MealPlanSection
                  result={ptPlan.nutritionJson as NutritionResult}
                  liveProtein={ptPlan.protein}
                  liveFat={ptPlan.fat}
                  liveCarbs={ptPlan.carbs}
                  liveDer={ptPlan.calories}
                />
              </div>
            </>
          ) : (
            <div
              className="bg-white rounded-2xl p-8 text-center text-sm"
              style={{ border: "1px solid rgba(18,16,13,0.1)", color: "rgba(18,16,13,0.5)" }}
            >
              PT chưa gán thực đơn cho bạn. Vui lòng liên hệ PT của bạn.
            </div>
          )
        ) : tab === "foodlog" ? (
          <FoodLogTracker
            target={ptPlan ? { calories: ptPlan.calories, protein: ptPlan.protein, fat: ptPlan.fat, carbs: ptPlan.carbs } : null}
          />
        ) : (
          <WeightTracker initialEntries={weightEntries} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-bold transition-colors"
      style={{
        background: active ? "#eb0915" : "rgba(18,16,13,0.05)",
        color: active ? "#fff" : "rgba(18,16,13,0.6)",
      }}
    >
      {children}
    </button>
  );
}
