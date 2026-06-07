"use client";

import { useMemo, useState } from "react";
import WeightChart from "./WeightChart";
import {
  type WeightPoint,
  weekStartOf,
  weekDays,
  addDays,
} from "@/lib/weight";

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function dowLabel(dateStr: string): string {
  return DOW[new Date(dateStr + "T00:00:00.000Z").getUTCDay()];
}

function fmtDM(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

type RowStatus = "saving" | "saved" | "error";

export default function WeightTracker({
  initialEntries,
  studentId,
}: {
  initialEntries: WeightPoint[];
  // Khi PT/Admin điền hộ học viên: truyền id học viên. Bỏ trống = ghi cho chính mình.
  studentId?: string;
}) {
  const [entries, setEntries] = useState<WeightPoint[]>(initialEntries);
  const [status, setStatus] = useState<RowStatus | null>(null);

  const today = localToday();

  // Tuần đang xem (điều hướng ◀▶) + ngày đang nhập (sửa được, mặc định hôm nay)
  const [weekStart, setWeekStart] = useState<string>(weekStartOf(today));
  const [inputDate, setInputDate] = useState<string>(today);
  // undefined = chưa chạm ô nhập → hiển thị cân nặng đã lưu của ngày đang chọn
  const [inputWeight, setInputWeight] = useState<string | undefined>(undefined);

  const byDate = useMemo(() => {
    const m = new Map<string, WeightPoint>();
    for (const e of entries) m.set(e.date, e);
    return m;
  }, [entries]);

  const days = weekDays(weekStart);
  const chartPoints = entries.map((e) => ({ date: e.date, weightKg: e.weightKg }));

  const savedForInput = byDate.get(inputDate);
  const weightValue = inputWeight !== undefined ? inputWeight : (savedForInput ? String(savedForInput.weightKg) : "");

  // Đổi ngày nhập → nhảy tuần đang xem về tuần chứa ngày đó, hiện lại cân nặng đã lưu (nếu có)
  function changeDate(date: string) {
    if (!date) return;
    setInputDate(date);
    setWeekStart(weekStartOf(date));
    setInputWeight(undefined);
    setStatus(null);
  }

  async function commit() {
    const date = inputDate;
    const weightStr = weightValue.trim();
    const existing = byDate.get(date);

    // Trống mà trước đó có dữ liệu → xoá
    if (weightStr === "") {
      if (existing) {
        const qs = studentId ? `?date=${date}&studentId=${studentId}` : `?date=${date}`;
        await fetch(`/api/weight${qs}`, { method: "DELETE" });
        setEntries((prev) => prev.filter((e) => e.date !== date));
      }
      setInputWeight(undefined);
      return;
    }

    const weightKg = Number(weightStr.replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
      setStatus("error");
      return;
    }
    // Không đổi so với đã lưu → bỏ qua
    if (existing && existing.weightKg === weightKg) {
      setInputWeight(undefined);
      return;
    }

    setStatus("saving");
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Giữ lại ghi chú cũ (nếu có) — UI không còn ô nhập note nhưng không xoá dữ liệu cũ
        body: JSON.stringify({ date, weightKg, note: existing?.note ?? undefined, studentId }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setEntries((prev) => {
        const rest = prev.filter((e) => e.date !== date);
        return [...rest, { date, weightKg, note: existing?.note ?? null }].sort((a, b) => (a.date < b.date ? -1 : 1));
      });
      setInputWeight(undefined);
      setStatus("saved");
      setTimeout(() => setStatus(null), 1500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      {/* Biểu đồ */}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(18,16,13,0.35)" }}>
          Biểu đồ cân nặng
        </p>
        <WeightChart points={chartPoints} />
      </div>

      {/* Xem theo tuần + nhập 1 ngày */}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
        {/* Điều hướng tuần */}
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="px-2.5 py-1 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)" }}>
            ←
          </button>
          <span className="text-sm font-bold" style={{ color: "#12100d" }}>
            Tuần {fmtDM(weekStart)} – {fmtDM(addDays(weekStart, 6))}
          </span>
          <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))}
            disabled={weekStart >= weekStartOf(today)}
            className="px-2.5 py-1 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: weekStart >= weekStartOf(today) ? 0.4 : 1 }}>
            →
          </button>
        </div>

        {/* Danh sách 7 ngày của tuần (chỉ để xem) */}
        <div className="space-y-1 mb-4">
          {days.map((date) => {
            const isToday = date === today;
            const isSelected = date === inputDate;
            const e = byDate.get(date);
            return (
              <div
                key={date}
                className="flex items-center gap-2 rounded-lg px-2 py-1"
                style={{ background: isSelected ? "rgba(235,9,21,0.06)" : "transparent" }}
              >
                <div className="w-14 shrink-0">
                  <span className="text-sm font-bold" style={{ color: isToday ? "#eb0915" : "#12100d" }}>{dowLabel(date)}</span>
                  <span className="text-xs ml-1.5" style={{ color: "rgba(18,16,13,0.4)" }}>{fmtDM(date)}</span>
                </div>
                <span className="text-sm flex-1" style={{ color: e ? "#12100d" : "rgba(18,16,13,0.3)" }}>
                  {e ? `${e.weightKg} kg` : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Ô nhập duy nhất + chọn ngày (mặc định hôm nay, sửa được) */}
        <div className="border-t pt-3" style={{ borderColor: "rgba(18,16,13,0.08)" }}>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold shrink-0" style={{ color: "rgba(18,16,13,0.6)" }}>Ngày</label>
            <input
              type="date"
              max={today}
              value={inputDate}
              onChange={(e) => changeDate(e.target.value)}
              className="dp-input"
              style={{ width: "150px" }}
            />
            <input
              type="number" inputMode="decimal" step="0.1" placeholder="kg"
              value={weightValue}
              onChange={(e) => setInputWeight(e.target.value)}
              onBlur={commit}
              className="dp-input flex-1"
            />
            <span className="w-5 shrink-0 text-center text-sm">
              {status === "saving" ? "…" : status === "saved" ? <span style={{ color: "#16a34a" }}>✓</span> : status === "error" ? <span style={{ color: "#eb0915" }}>!</span> : ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
