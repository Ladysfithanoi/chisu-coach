"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { photoSrc } from "@/lib/photo";
import { weekStartOf, addDays } from "@/lib/weight";

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

type AlbumLog = {
  id: string;
  date: string;
  mealLabel: string | null;
  photoUrl: string | null;
  name: string;
  calories: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};

type Gran = "quarter" | "month" | "week" | "day";

const GRAN_LABEL: Record<Gran, string> = {
  quarter: "Quý",
  month: "Tháng",
  week: "Tuần",
  day: "Ngày",
};

function dowLabel(dateStr: string): string {
  return DOW[new Date(dateStr + "T00:00:00.000Z").getUTCDay()];
}

function fmtDM(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

function fmtFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Khoá gộp nhóm theo cấp độ — sắp xếp giảm dần được nhờ dạng chuỗi cố định.
function groupKey(date: string, gran: Gran): string {
  const [y, m, d] = date.split("-");
  switch (gran) {
    case "day":
      return date;
    case "week":
      return weekStartOf(date);
    case "month":
      return `${y}-${m}`;
    case "quarter":
      return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`;
    default:
      return date;
  }
}

function groupHeader(date: string, gran: Gran): string {
  const [y, m] = date.split("-");
  switch (gran) {
    case "day":
      return `${dowLabel(date)}, ${fmtFullDate(date)}`;
    case "week": {
      const ws = weekStartOf(date);
      return `Tuần ${fmtDM(ws)} – ${fmtDM(addDays(ws, 6))}/${ws.slice(0, 4)}`;
    }
    case "month":
      return `Tháng ${Number(m)}/${y}`;
    case "quarter":
      return `Quý ${Math.floor((Number(m) - 1) / 3) + 1}/${y}`;
    default:
      return date;
  }
}

export default function FoodAlbum({ studentId }: { studentId: string }) {
  const [logs, setLogs] = useState<AlbumLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [gran, setGran] = useState<Gran>("month");
  const [viewing, setViewing] = useState<AlbumLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/foodlog?studentId=${studentId}`);
      const data = await res.json();
      setLogs(res.ok ? (data.logs ?? []) : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Chỉ lấy bữa ăn có ảnh, gộp theo cấp độ đang chọn (mới nhất lên đầu).
  const groups = useMemo(() => {
    const photos = logs.filter((l) => photoSrc(l.photoUrl));
    photos.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const map = new Map<string, { header: string; items: AlbumLog[] }>();
    for (const l of photos) {
      const key = groupKey(l.date, gran);
      if (!map.has(key)) map.set(key, { header: groupHeader(l.date, gran), items: [] });
      map.get(key)!.items.push(l);
    }
    return [...map.values()];
  }, [logs, gran]);

  const totalPhotos = useMemo(() => logs.filter((l) => photoSrc(l.photoUrl)).length, [logs]);

  return (
    <div className="space-y-5">
      {/* Bộ chọn cấp độ phân chia + tải lại */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {(Object.keys(GRAN_LABEL) as Gran[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGran(g)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
              style={{
                background: gran === g ? "#eb0915" : "rgba(18,16,13,0.05)",
                color: gran === g ? "#fff" : "rgba(18,16,13,0.6)",
              }}
            >
              {GRAN_LABEL[g]}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold"
          style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: loading ? 0.5 : 1 }}>
          ↻ Tải lại
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-center py-10" style={{ color: "rgba(18,16,13,0.4)" }}>Đang tải album…</p>
      ) : totalPhotos === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: "rgba(18,16,13,0.4)" }}>
          Học viên chưa cập nhật ảnh bữa ăn nào.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.header}>
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-sm font-bold" style={{ color: "#12100d" }}>{group.header}</h3>
                <span className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{group.items.length} ảnh</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map((l) => {
                  const src = photoSrc(l.photoUrl)!;
                  return (
                    <button key={l.id} type="button" onClick={() => setViewing(l)}
                      className="btn-flat relative rounded-xl overflow-hidden" style={{ aspectRatio: "1 / 1", background: "rgba(18,16,13,0.05)" }}
                      title={`${l.name} · ${fmtFullDate(l.date)}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={l.name} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 text-[10px] font-semibold text-white text-left truncate"
                        style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }}>
                        {fmtDM(l.date)}{l.mealLabel ? ` · ${l.mealLabel}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal xem ảnh lớn + thông tin bữa ăn */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(18,16,13,0.8)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}>
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc(viewing.photoUrl)!} alt={viewing.name} className="w-full object-cover" style={{ maxHeight: "60vh" }} />
            <div className="p-5">
              {viewing.mealLabel && (
                <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-2"
                  style={{ background: "rgba(235,9,21,0.08)", color: "#eb0915" }}>
                  {viewing.mealLabel}
                </span>
              )}
              <h3 className="text-xl font-bold mb-1" style={{ color: "#12100d" }}>{viewing.name}</h3>
              <p className="text-xs mb-4" style={{ color: "rgba(18,16,13,0.45)" }}>{fmtFullDate(viewing.date)}</p>
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Calo" value={`${viewing.calories}`} unit="kcal" big />
                <Stat label="Đạm" value={`${viewing.protein ?? 0}`} unit="g" />
                <Stat label="Béo" value={`${viewing.fat ?? 0}`} unit="g" />
                <Stat label="Tinh bột" value={`${viewing.carbs ?? 0}`} unit="g" />
              </div>
              <button type="button" onClick={() => setViewing(null)}
                className="w-full mt-5 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.7)" }}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, unit, big = false }: { label: string; value: string; unit: string; big?: boolean }) {
  return (
    <div className="rounded-xl p-2.5 text-center" style={{ background: big ? "rgba(235,9,21,0.06)" : "rgba(18,16,13,0.04)" }}>
      <p className="text-xs mb-0.5" style={{ color: "rgba(18,16,13,0.4)" }}>{label}</p>
      <p className="font-bold leading-none" style={{ color: big ? "#eb0915" : "#12100d", fontSize: big ? "1.25rem" : "1rem" }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: "rgba(18,16,13,0.35)" }}>{unit}</p>
    </div>
  );
}
