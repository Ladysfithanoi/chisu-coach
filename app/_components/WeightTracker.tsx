"use client";

import { useMemo, useState } from "react";
import WeightChart from "./WeightChart";
import { type WeightPoint } from "@/lib/weight";

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

  const byDate = useMemo(() => {
    const m = new Map<string, WeightPoint>();
    for (const e of entries) m.set(e.date, e);
    return m;
  }, [entries]);

  // Ô nhập cân nặng hôm nay: undefined = chưa chạm, dùng giá trị đã lưu (nếu có)
  const [weight, setWeight] = useState<string | undefined>(undefined);
  const weightValue = weight !== undefined ? weight : (byDate.get(today) ? String(byDate.get(today)!.weightKg) : "");
  // Thứ + ngày tháng chỉ hiện khi đã có cân nặng (nhập hoặc đã lưu)
  const showDate = weightValue.trim() !== "";

  const chartPoints = entries.map((e) => ({ date: e.date, weightKg: e.weightKg }));

  async function commit() {
    const weightStr = weightValue.trim();
    const existing = byDate.get(today);

    // Trống mà trước đó có dữ liệu → xoá
    if (weightStr === "") {
      if (existing) {
        const qs = studentId ? `?date=${today}&studentId=${studentId}` : `?date=${today}`;
        await fetch(`/api/weight${qs}`, { method: "DELETE" });
        setEntries((prev) => prev.filter((e) => e.date !== today));
      }
      setWeight(undefined);
      return;
    }

    const weightKg = Number(weightStr.replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
      setStatus("error");
      return;
    }
    // Không đổi so với đã lưu → bỏ qua
    if (existing && existing.weightKg === weightKg) {
      setWeight(undefined);
      return;
    }

    setStatus("saving");
    try {
      const res = await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Giữ lại ghi chú cũ (nếu có) — UI không còn ô nhập note nhưng không xoá dữ liệu cũ
        body: JSON.stringify({ date: today, weightKg, note: existing?.note ?? undefined, studentId }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setEntries((prev) => {
        const rest = prev.filter((e) => e.date !== today);
        return [...rest, { date: today, weightKg, note: existing?.note ?? null }].sort((a, b) => (a.date < b.date ? -1 : 1));
      });
      setWeight(undefined);
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

      {/* Nhập cân nặng hôm nay (1 ô duy nhất) */}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(18,16,13,0.35)" }}>
          Ghi cân nặng
        </p>
        <div className="flex items-center gap-2">
          {/* Thứ + ngày tháng — để trống cho tới khi nhập cân nặng */}
          <div className="w-14 shrink-0">
            {showDate && (
              <>
                <p className="text-sm font-bold" style={{ color: "#eb0915" }}>{dowLabel(today)}</p>
                <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{fmtDM(today)}</p>
              </>
            )}
          </div>
          <input
            type="number" inputMode="decimal" step="0.1" placeholder="kg"
            value={weightValue}
            onChange={(e) => setWeight(e.target.value)}
            onBlur={commit}
            className="dp-input flex-1"
          />
          <span className="w-5 shrink-0 text-center text-sm">
            {status === "saving" ? "…" : status === "saved" ? <span style={{ color: "#16a34a" }}>✓</span> : status === "error" ? <span style={{ color: "#eb0915" }}>!</span> : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
