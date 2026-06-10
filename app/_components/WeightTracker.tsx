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
  // Thông báo lỗi cụ thể (validation / hết phiên / lỗi máy chủ) — hiện cạnh dấu "!"
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Modal bảng chi tiết các ngày + cân nặng (mở khi bấm vào biểu đồ)
  const [showTable, setShowTable] = useState(false);
  const [tablePage, setTablePage] = useState(1);

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

  // Danh sách ngày đã cân (tăng dần) để nút ← → nhảy thẳng tới ngày cân trước/kế tiếp,
  // bỏ qua ngày/tuần trống → luôn hiển thị đúng ngày cân + cân tương ứng.
  const sortedDates = useMemo(() => entries.map((e) => e.date).sort(), [entries]);
  // Ngày cân gần nhất TRƯỚC ngày đang chọn (null nếu không còn)
  const prevWeighIn = useMemo(() => {
    for (let i = sortedDates.length - 1; i >= 0; i--) if (sortedDates[i] < inputDate) return sortedDates[i];
    return null;
  }, [sortedDates, inputDate]);
  // Ngày cân gần nhất SAU ngày đang chọn; nếu không còn nhưng chưa tới hôm nay → về hôm nay (để ghi cân mới)
  const nextWeighIn = useMemo(() => {
    for (let i = 0; i < sortedDates.length; i++) if (sortedDates[i] > inputDate) return sortedDates[i];
    return inputDate < today ? today : null;
  }, [sortedDates, inputDate, today]);

  // Bảng chi tiết: mới nhất lên đầu, tối đa 10 ngày/trang
  const TABLE_PAGE_SIZE = 10;
  const tableRows = [...entries].reverse();
  const tableTotalPages = Math.max(1, Math.ceil(tableRows.length / TABLE_PAGE_SIZE));
  const tableSafePage = Math.min(tablePage, tableTotalPages);
  const tablePageRows = tableRows.slice((tableSafePage - 1) * TABLE_PAGE_SIZE, tableSafePage * TABLE_PAGE_SIZE);

  // Đổi ngày đang chọn → hiện lại cân nặng đã lưu (nếu có)
  function changeDate(date: string) {
    if (!date) return;
    setInputDate(date);
    setInputWeight(undefined);
    setStatus(null);
    setErrorMsg("");
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
      setErrorMsg("Cân nặng phải lớn hơn 0 và tối đa 500 kg, vui lòng thử lại");
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
      if (!res.ok) {
        // Hiện đúng nguyên nhân: hết phiên (single-session) vs lỗi máy chủ
        const data = await res.json().catch(() => null);
        setErrorMsg(
          res.status === 401
            ? "Phiên đăng nhập đã hết hoặc bạn đã đăng nhập ở thiết bị khác. Vui lòng đăng nhập lại."
            : (data?.error ?? "Không lưu được, vui lòng thử lại")
        );
        setStatus("error");
        return;
      }
      setEntries((prev) => {
        const rest = prev.filter((e) => e.date !== date);
        return [...rest, { date, weightKg, note: existing?.note ?? null }].sort((a, b) => (a.date < b.date ? -1 : 1));
      });
      setInputWeight(undefined);
      setStatus("saved");
      setTimeout(() => setStatus(null), 1500);
    } catch {
      setErrorMsg("Mất kết nối mạng, vui lòng thử lại");
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
            onClick={() => { setTablePage(1); setShowTable(true); }}
            className="btn-flat block w-full text-left transition-colors"
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
        {/* Điều hướng — nhảy tới ngày cân trước/kế tiếp (bỏ qua ngày trống) */}
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => prevWeighIn && changeDate(prevWeighIn)}
            disabled={!prevWeighIn}
            title="Ngày cân trước đó"
            className="px-2.5 py-1 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: prevWeighIn ? 1 : 0.4 }}>
            ←
          </button>
          <span className="text-sm font-bold" style={{ color: "#12100d" }}>
            Tuần {fmtDM(weekStart)} – {fmtDM(addDays(weekStart, 6))}
          </span>
          <button type="button" onClick={() => nextWeighIn && changeDate(nextWeighIn)}
            disabled={!nextWeighIn}
            title="Ngày cân kế tiếp"
            className="px-2.5 py-1 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: nextWeighIn ? 1 : 0.4 }}>
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
          {/* Ô ngày: hiển thị dd/mm/yyyy (input type=date native không đổi được định
              dạng) — phủ input trong suốt lên trên để mở lịch chọn ngày */}
          <div className="relative shrink-0" style={{ width: "150px" }}>
            <div className="dp-input flex items-center justify-between" style={{ pointerEvents: "none" }}>
              <span style={{ color: "#12100d" }}>{fmtFull(inputDate)}</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(18,16,13,0.45)" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <input
              type="date"
              max={today}
              value={inputDate}
              onChange={(e) => changeDate(e.target.value)}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* trình duyệt không hỗ trợ showPicker */ } }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Chọn ngày cân"
            />
          </div>
          {/* type="text" + inputMode="decimal": bàn phím số tiếng Việt dùng dấu phẩy,
              type="number" sẽ coi "70,5" là không hợp lệ và trả value rỗng → không lưu được.
              Chỉ giữ chữ số và một dấu phẩy/chấm. */}
          <input
            type="text" inputMode="decimal" placeholder="kg"
            value={weightValue}
            onChange={(e) => setInputWeight(e.target.value.replace(/[^\d.,]/g, ""))}
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
          <p className="text-sm mt-2 font-medium" style={{ color: "#eb0915" }}>! {errorMsg}</p>
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

            <div className="overflow-y-auto px-5 pb-3">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(18,16,13,0.1)" }}>
                    <th className="text-left font-semibold py-2" style={{ color: "rgba(18,16,13,0.45)" }}>Ngày</th>
                    <th className="text-right font-semibold py-2" style={{ color: "rgba(18,16,13,0.45)" }}>Cân nặng</th>
                  </tr>
                </thead>
                <tbody>
                  {tablePageRows.map((e) => (
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

            {/* Phân trang (10 ngày/trang) */}
            {tableTotalPages > 1 && (
              <div className="flex items-center justify-center gap-3 px-5 py-3 border-t" style={{ borderColor: "rgba(18,16,13,0.08)" }}>
                <button
                  type="button"
                  disabled={tableSafePage <= 1}
                  onClick={() => setTablePage(tableSafePage - 1)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                  style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: tableSafePage <= 1 ? 0.4 : 1 }}
                >
                  ← Trước
                </button>
                <span className="text-sm font-medium" style={{ color: "rgba(18,16,13,0.6)" }}>
                  Trang {tableSafePage}/{tableTotalPages}
                </span>
                <button
                  type="button"
                  disabled={tableSafePage >= tableTotalPages}
                  onClick={() => setTablePage(tableSafePage + 1)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                  style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: tableSafePage >= tableTotalPages ? 0.4 : 1 }}
                >
                  Sau →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
