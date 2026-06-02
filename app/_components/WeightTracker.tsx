"use client";

import { useMemo, useState } from "react";
import WeightChart from "./WeightChart";
import {
  type WeightPoint,
  weekStartOf,
  weekDays,
  addDays,
  weekOverWeek,
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
  const [weekStart, setWeekStart] = useState<string>(weekStartOf(localToday()));
  const [form, setForm] = useState<Record<string, { weight: string; note: string }>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});

  const byDate = useMemo(() => {
    const m = new Map<string, WeightPoint>();
    for (const e of entries) m.set(e.date, e);
    return m;
  }, [entries]);

  const today = localToday();
  const days = weekDays(weekStart);

  const { current, previous, delta } = weekOverWeek(entries);
  const chartPoints = entries.map((e) => ({ date: e.date, weightKg: e.weightKg }));

  function getWeight(date: string): string {
    if (form[date]?.weight !== undefined) return form[date].weight;
    const e = byDate.get(date);
    return e ? String(e.weightKg) : "";
  }
  function getNote(date: string): string {
    if (form[date]?.note !== undefined) return form[date].note;
    return byDate.get(date)?.note ?? "";
  }
  function setField(date: string, field: "weight" | "note", value: string) {
    setForm((prev) => ({
      ...prev,
      [date]: {
        weight: field === "weight" ? value : getWeight(date),
        note: field === "note" ? value : getNote(date),
      },
    }));
  }

  async function commit(date: string) {
    const weightStr = getWeight(date).trim();
    const note = getNote(date).trim();
    const existing = byDate.get(date);

    // Trống mà trước đó có dữ liệu → xoá
    if (weightStr === "") {
      if (existing) {
        const qs = studentId ? `?date=${date}&studentId=${studentId}` : `?date=${date}`;
        await fetch(`/api/weight${qs}`, { method: "DELETE" });
        setEntries((prev) => prev.filter((e) => e.date !== date));
      }
      setForm((prev) => { const c = { ...prev }; delete c[date]; return c; });
      return;
    }

    const weightKg = Number(weightStr.replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
      setStatus((s) => ({ ...s, [date]: "error" }));
      return;
    }
    // Không đổi so với đã lưu → bỏ qua
    if (existing && existing.weightKg === weightKg && (existing.note ?? "") === note) {
      setForm((prev) => { const c = { ...prev }; delete c[date]; return c; });
      return;
    }

    setStatus((s) => ({ ...s, [date]: "saving" }));
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, weightKg, note, studentId }),
      });
      if (!res.ok) { setStatus((s) => ({ ...s, [date]: "error" })); return; }
      setEntries((prev) => {
        const rest = prev.filter((e) => e.date !== date);
        return [...rest, { date, weightKg, note }].sort((a, b) => (a.date < b.date ? -1 : 1));
      });
      setForm((prev) => { const c = { ...prev }; delete c[date]; return c; });
      setStatus((s) => ({ ...s, [date]: "saved" }));
      setTimeout(() => setStatus((s) => { const c = { ...s }; delete c[date]; return c; }), 1500);
    } catch {
      setStatus((s) => ({ ...s, [date]: "error" }));
    }
  }

  return (
    <div className="space-y-6">
      {/* Thống kê trung bình tuần */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="TB tuần này" value={current ? `${current.avg} kg` : "—"} sub={current ? `${current.count} ngày` : ""} />
        <StatCard label="TB tuần trước" value={previous ? `${previous.avg} kg` : "—"} sub={previous ? `${previous.count} ngày` : ""} />
        <StatCard
          label="Thay đổi"
          value={delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta} kg`}
          sub={delta === null ? "cần 2 tuần" : delta < 0 ? "↓ giảm" : delta > 0 ? "↑ tăng" : "giữ nguyên"}
          tone={delta === null ? "neutral" : delta < 0 ? "good" : delta > 0 ? "bad" : "neutral"}
        />
      </div>

      {/* Biểu đồ */}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(18,16,13,0.35)" }}>
          Biểu đồ cân nặng
        </p>
        <WeightChart points={chartPoints} />
      </div>

      {/* Nhập theo tuần */}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
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

        <div className="space-y-2">
          {days.map((date) => {
            const isToday = date === today;
            const isFuture = date > today;
            const st = status[date];
            return (
              <div key={date} className="flex items-center gap-2">
                <div className="w-14 shrink-0">
                  <p className="text-sm font-bold" style={{ color: isToday ? "#eb0915" : "#12100d" }}>{dowLabel(date)}</p>
                  <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{fmtDM(date)}</p>
                </div>
                <input
                  type="number" inputMode="decimal" step="0.1" placeholder="kg"
                  disabled={isFuture}
                  value={getWeight(date)}
                  onChange={(e) => setField(date, "weight", e.target.value)}
                  onBlur={() => commit(date)}
                  className="dp-input"
                  style={{ width: "90px", opacity: isFuture ? 0.5 : 1 }}
                />
                <input
                  type="text" placeholder="Ghi chú (tuỳ chọn)"
                  disabled={isFuture}
                  value={getNote(date)}
                  onChange={(e) => setField(date, "note", e.target.value)}
                  onBlur={() => commit(date)}
                  className="dp-input flex-1"
                  style={{ opacity: isFuture ? 0.5 : 1 }}
                />
                <span className="w-5 shrink-0 text-center text-sm">
                  {st === "saving" ? "…" : st === "saved" ? <span style={{ color: "#16a34a" }}>✓</span> : st === "error" ? <span style={{ color: "#eb0915" }}>!</span> : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, tone = "neutral" }: {
  label: string; value: string; sub: string; tone?: "good" | "bad" | "neutral";
}) {
  const color = tone === "good" ? "#16a34a" : tone === "bad" ? "#eb0915" : "#12100d";
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: "rgba(18,16,13,0.04)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(18,16,13,0.4)" }}>{label}</p>
      <p className="text-lg font-bold mt-1 leading-none" style={{ color }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: "rgba(18,16,13,0.4)" }}>{sub}</p>
    </div>
  );
}
