"use client";

import { useMemo, useState } from "react";
import WeightChart from "./WeightChart";
import {
  type WeightPoint,
  weekStartOf,
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

function fmtFull(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
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
  // Modal bảng chi tiết các ngày + cân nặng (mở khi bấm vào biểu đồ)
  const [showTable, setShowTable] = useState(false);

  const today = localToday();

  // Ngày đang chọn (sửa được, mặc định hôm nay). Tuần đang xem suy ra từ ngày này.
  const [inputDate, setInputDate] = useState<string>(today);
  // undefined = chưa chạm ô nhập → hiển thị cân nặng đã lưu của ngày đang chọn
  const [inputWeight, setInputWeight] = useState<string | undefined>(undefined);

  const byDate = useMemo(() => {
    const m = new Map<string, WeightPoint>();
    for (const e of entries) m.set(e.date, e);
    return m;
  }, [entries]);

  const weekStart = weekStartOf(inputDate);
  const chartPoints = entries.map((e) => ({ date: e.date, weightKg: e.weightKg }));

  const savedForInput = byDate.get(inputDate);
  const weightValue = inputWeight !== undefined ? inputWeight : (savedForInput ? String(savedForInput.weightKg) : "");
  // Không cho nhảy tới tuần tương lai
  const nextWeekDisabled = weekStart >= weekStartOf(today);

  // Đổi ngày đang chọn → hiện lại cân nặng đã lưu (nếu có)
  function changeDate(date: string) {
    if (!date) return;
    setInputDate(date);
    setInputWeight(undefined);
    setStatus(null);
  }

  // Lật tuần: dời ngày đang chọn ±7 (chặn vượt quá hôm nay)
  function shiftWeek(deltaWeeks: number) {
    const next = addDays(inputDate, deltaWeeks * 7);
    changeDate(next > today ? today : next);
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
    // Không đổi so với đã lưu → vẫn báo "đã lưu" cho nút có phản hồi rõ ràng
    if (existing && existing.weightKg === weightKg) {
      setInputWeight(undefined);
      setStatus("saved");
      setTimeout(() => setStatus(null), 1500);
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
      {/* Biểu đồ — bấm vào để xem bảng chi tiết */}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>
            Biểu đồ cân nặng
          </p>
          {entries.length > 0 && (
            <span className="text-xs font-medium" style={{ color: "#eb0915" }}>Bấm để xem bảng chi tiết</span>
          )}
        </div>
        {entries.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowTable(true)}
            className="btn-flat block w-full text-left"
            title="Xem bảng cân nặng theo ngày"
            style={{ cursor: "pointer" }}
          >
            <WeightChart points={chartPoints} />
          </button>
        ) : (
          <WeightChart points={chartPoints} />
        )}
      </div>

      {/* Xem theo tuần + nhập 1 ngày */}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
        {/* Điều hướng tuần — lật về các tuần trước để xem */}
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => shiftWeek(-1)}
            className="px-2.5 py-1 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)" }}>
            ←
          </button>
          <span className="text-sm font-bold" style={{ color: "#12100d" }}>
            Tuần {fmtDM(weekStart)} – {fmtDM(addDays(weekStart, 6))}
          </span>
          <button type="button" onClick={() => shiftWeek(1)}
            disabled={nextWeekDisabled}
            className="px-2.5 py-1 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: nextWeekDisabled ? 0.4 : 1 }}>
            →
          </button>
        </div>

        {/* Dòng hiển thị cân nặng đã lưu của ngày đang chọn */}
        <div
          className="flex items-center justify-between rounded-xl px-4 py-3 mb-3"
          style={{ background: "rgba(235,9,21,0.05)", border: "1px solid rgba(235,9,21,0.15)" }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold" style={{ color: inputDate === today ? "#eb0915" : "#12100d" }}>
              {dowLabel(inputDate)}
            </span>
            <span className="text-xs" style={{ color: "rgba(18,16,13,0.45)" }}>{fmtDM(inputDate)}</span>
          </div>
          <span className="text-base font-bold" style={{ color: savedForInput ? "#12100d" : "rgba(18,16,13,0.3)" }}>
            {savedForInput ? `${savedForInput.weightKg} kg` : "Chưa có"}
          </span>
        </div>

        {/* Chọn ngày + nhập cân nặng + nút Lưu (đa nền tảng, không phụ thuộc auto-save) */}
        <div className="flex items-center gap-2">
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
            onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            className="dp-input flex-1"
          />
          <button
            type="button"
            onClick={commit}
            disabled={status === "saving"}
            className="px-4 py-2 rounded-xl text-sm font-bold shrink-0"
            style={{ background: "#eb0915", color: "#fff", opacity: status === "saving" ? 0.6 : 1 }}
          >
            {status === "saving" ? "Đang lưu…" : "Lưu"}
          </button>
        </div>

        {/* Phản hồi trạng thái lưu */}
        {status === "saved" && (
          <p className="text-sm mt-2 font-medium" style={{ color: "#16a34a" }}>✓ Đã lưu</p>
        )}
        {status === "error" && (
          <p className="text-sm mt-2 font-medium" style={{ color: "#eb0915" }}>! Cân nặng phải lớn hơn 0 và tối đa 500 kg, vui lòng thử lại</p>
        )}
      </div>

      {/* ── Modal bảng chi tiết: ngày + cân nặng ── */}
      {showTable && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(18,16,13,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTable(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl shadow-2xl flex flex-col"
            style={{ background: "white", border: "1px solid rgba(18,16,13,0.08)", maxHeight: "80vh" }}
          >
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="text-base font-bold" style={{ color: "#12100d" }}>
                Bảng cân nặng theo ngày
              </h3>
              <button
                onClick={() => setShowTable(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg"
                style={{ color: "rgba(18,16,13,0.4)", background: "rgba(18,16,13,0.05)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-5">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(18,16,13,0.1)" }}>
                    <th className="text-left font-semibold py-2" style={{ color: "rgba(18,16,13,0.45)" }}>Ngày</th>
                    <th className="text-right font-semibold py-2" style={{ color: "rgba(18,16,13,0.45)" }}>Cân nặng</th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries].reverse().map((e) => (
                    <tr key={e.date} style={{ borderBottom: "1px solid rgba(18,16,13,0.06)" }}>
                      <td className="py-2.5">
                        <span className="font-bold" style={{ color: e.date === today ? "#eb0915" : "#12100d" }}>
                          {dowLabel(e.date)}
                        </span>
                        <span className="ml-2" style={{ color: "rgba(18,16,13,0.5)" }}>{fmtFull(e.date)}</span>
                      </td>
                      <td className="py-2.5 text-right font-bold" style={{ color: "#12100d" }}>
                        {e.weightKg} kg
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
