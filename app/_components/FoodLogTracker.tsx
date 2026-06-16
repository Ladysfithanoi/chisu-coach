"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/compress";
import { photoSrc } from "@/lib/photo";
import { FOODS, type FoodItem } from "@/lib/foods-data";

export type FoodLog = {
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

type ScanResult = {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  confidence?: string;
};

function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function fmtDM(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Bản nháp món đang thêm (từ ảnh quét AI hoặc nhập tay/chọn từ thư viện).
type Draft = {
  source: "photo" | "manual";
  imageBase64?: string;
  mimeType?: string;
  preview?: string;
  scanning: boolean;
  saving: boolean;
  error?: string;
  confidence?: string;
  mealLabel: string;
  name: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  // Chế độ thư viện: ô tìm kiếm + món đã chọn + khối lượng để quy đổi macro.
  query: string;
  selectedFood: FoodItem | null;
  grams: string;
};

const EMPTY_DRAFT: Omit<Draft, "source"> = {
  scanning: false,
  saving: false,
  mealLabel: "",
  name: "",
  calories: "",
  protein: "",
  fat: "",
  carbs: "",
  query: "",
  selectedFood: null,
  grams: "100",
};

// Tìm món trong CSDL app — khớp tên tiếng Việt/Anh, ưu tiên khớp đầu chuỗi.
function searchFoods(query: string): FoodItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return FOODS.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.nameEn ?? "").toLowerCase().includes(q)
  )
    .sort((a, b) => {
      const aS = a.name.toLowerCase().startsWith(q) || (a.nameEn ?? "").toLowerCase().startsWith(q);
      const bS = b.name.toLowerCase().startsWith(q) || (b.nameEn ?? "").toLowerCase().startsWith(q);
      return aS === bS ? 0 : aS ? -1 : 1;
    })
    .slice(0, 8);
}

// Macro của CSDL lưu theo 100g — quy đổi theo khối lượng thực tế.
function scaleFood(food: FoodItem, grams: number) {
  const r = grams / 100;
  return {
    calories: Math.round(food.calories * r),
    protein: Math.round(food.protein * r),
    fat: Math.round(food.fat * r),
    carbs: Math.round(food.carbs * r),
  };
}

export default function FoodLogTracker({
  studentId,
  target,
  readOnly = false,
}: {
  // PT/Admin điền hộ: truyền id học viên. Bỏ trống = chính mình.
  studentId?: string;
  // Mục tiêu calo/macro từ PT để hiển thị đối chiếu (tuỳ chọn).
  target?: { calories: number; protein: number; fat: number; carbs: number } | null;
  // Chỉ xem (PT): ẩn nút thêm/xoá món — học viên tự quản nhật ký của mình.
  readOnly?: boolean;
}) {
  const [date, setDate] = useState<string>(localToday());
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewingLog, setViewingLog] = useState<FoodLog | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const today = localToday();
  const qsStudent = studentId ? `&studentId=${studentId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/foodlog?date=${date}${qsStudent}`);
      const data = await res.json();
      setLogs(res.ok ? data.logs ?? [] : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [date, qsStudent]);

  useEffect(() => {
    // Đồng bộ nhật ký với server khi đổi ngày — setState ở đây là cố ý.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Tổng dinh dưỡng trong ngày.
  const totals = logs.reduce(
    (a, l) => ({
      calories: a.calories + l.calories,
      protein: a.protein + (l.protein ?? 0),
      fat: a.fat + (l.fat ?? 0),
      carbs: a.carbs + (l.carbs ?? 0),
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // cho phép chọn lại cùng 1 ảnh
    if (!file) return;

    try {
      const { base64, mimeType } = await compressImage(file);
      setDraft({
        source: "photo",
        ...EMPTY_DRAFT,
        scanning: true,
        imageBase64: base64,
        mimeType,
        preview: `data:${mimeType};base64,${base64}`,
      });

      const res = await fetch("/api/gemini/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraft((d) => (d ? { ...d, scanning: false, error: data.error || "Quét ảnh thất bại" } : d));
        return;
      }
      const r = data.result as ScanResult;
      setDraft((d) =>
        d
          ? {
              ...d,
              scanning: false,
              confidence: r.confidence,
              name: r.name ?? "",
              calories: String(r.calories ?? ""),
              protein: String(r.protein ?? ""),
              fat: String(r.fat ?? ""),
              carbs: String(r.carbs ?? ""),
            }
          : d
      );
    } catch {
      setDraft((d) => (d ? { ...d, scanning: false, error: "Không xử lý được ảnh" } : d));
    }
  }

  function startManual() {
    setDraft({ source: "manual", ...EMPTY_DRAFT });
  }

  function setField(field: keyof Draft, value: string) {
    setDraft((d) => (d ? { ...d, [field]: value } : d));
  }

  // Chọn 1 món từ thư viện: tự điền tên + quy đổi macro theo gram hiện tại.
  function pickFood(food: FoodItem) {
    setDraft((d) => {
      if (!d) return d;
      const g = numOr0(d.grams) || 100;
      const m = scaleFood(food, g);
      return {
        ...d,
        selectedFood: food,
        query: food.name,
        name: food.name,
        grams: String(g),
        calories: String(m.calories),
        protein: String(m.protein),
        fat: String(m.fat),
        carbs: String(m.carbs),
      };
    });
  }

  // Đổi khối lượng → tính lại macro theo món đã chọn.
  function setGrams(value: string) {
    setDraft((d) => {
      if (!d) return d;
      if (!d.selectedFood) return { ...d, grams: value };
      const m = scaleFood(d.selectedFood, numOr0(value));
      return {
        ...d,
        grams: value,
        calories: String(m.calories),
        protein: String(m.protein),
        fat: String(m.fat),
        carbs: String(m.carbs),
      };
    });
  }

  async function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setDraft({ ...draft, error: "Thiếu tên món" });
      return;
    }
    setDraft({ ...draft, saving: true, error: undefined });

    try {
      // Upload ảnh trước (nếu có) để lấy tham chiếu Drive.
      // Lỗi upload (vd: Drive hết hạn token / chưa cấu hình) KHÔNG được chặn việc
      // ghi nhật ký — vẫn lưu món, chỉ là không kèm ảnh. Mất ảnh còn hơn mất cả bữa.
      let photoUrl: string | undefined;
      let photoFailed = false;
      if (draft.source === "photo" && draft.imageBase64) {
        try {
          const up = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: draft.imageBase64, mimeType: draft.mimeType, studentId }),
          });
          const upData = await up.json();
          if (up.ok) photoUrl = upData.photoUrl;
          else photoFailed = true;
        } catch {
          photoFailed = true;
        }
      }

      const res = await fetch("/api/foodlog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          date,
          mealLabel: draft.mealLabel.trim() || undefined,
          photoUrl,
          name,
          calories: numOr0(draft.calories),
          protein: draft.protein === "" ? undefined : numOr0(draft.protein),
          fat: draft.fat === "" ? undefined : numOr0(draft.fat),
          carbs: draft.carbs === "" ? undefined : numOr0(draft.carbs),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraft((d) => (d ? { ...d, saving: false, error: data.error || "Lưu thất bại" } : d));
        return;
      }
      setLogs((prev) => [data.log as FoodLog, ...prev]);
      setDraft(null);
      if (photoFailed) {
        alert("Đã lưu món vào nhật ký, nhưng không tải được ảnh lên (lỗi kết nối Drive). Món vẫn được ghi nhận, chỉ thiếu ảnh.");
      }
    } catch {
      setDraft((d) => (d ? { ...d, saving: false, error: "Lỗi mạng" } : d));
    }
  }

  async function removeLog(id: string) {
    const prev = logs;
    setLogs((l) => l.filter((x) => x.id !== id)); // optimistic
    const res = await fetch(`/api/foodlog?id=${id}`, { method: "DELETE" });
    if (!res.ok) setLogs(prev); // rollback nếu lỗi
  }

  return (
    <div className="space-y-6">
      {/* Tổng calo ngày + đối chiếu mục tiêu */}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => setDate((d) => addDays(d, -1))}
            className="px-2.5 py-1 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)" }}>
            ←
          </button>
          <span className="text-sm font-bold" style={{ color: "#12100d" }}>
            {date === today ? "Hôm nay" : fmtDM(date)}
          </span>
          <button type="button" onClick={() => setDate((d) => addDays(d, 1))}
            disabled={date >= today}
            className="px-2.5 py-1 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: date >= today ? 0.4 : 1 }}>
            →
          </button>
        </div>

        <div className="text-center">
          <p className="text-3xl font-bold leading-none" style={{ color: "#12100d" }}>
            {totals.calories}
            {target ? <span className="text-lg" style={{ color: "rgba(18,16,13,0.35)" }}> / {target.calories}</span> : null}
            <span className="text-sm font-semibold" style={{ color: "rgba(18,16,13,0.4)" }}> kcal</span>
          </p>
          {target ? (
            <p className="text-xs mt-1" style={{ color: totals.calories > target.calories ? "#eb0915" : "rgba(18,16,13,0.45)" }}>
              {totals.calories > target.calories
                ? `Vượt ${totals.calories - target.calories} kcal`
                : `Còn lại ${target.calories - totals.calories} kcal`}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <MacroCell label="Đạm" value={totals.protein} tgt={target?.protein} />
          <MacroCell label="Béo" value={totals.fat} tgt={target?.fat} />
          <MacroCell label="Tinh bột" value={totals.carbs} tgt={target?.carbs} />
        </div>
      </div>

      {/* PT chỉ xem: nhãn + nút tải lại để thấy cập nhật mới nhất của học viên */}
      {readOnly && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(18,16,13,0.35)" }}>
            Nhật ký của học viên (chỉ xem)
          </span>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold"
            style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: loading ? 0.5 : 1 }}>
            ↻ Tải lại
          </button>
        </div>
      )}

      {/* Nút thêm món */}
      {!draft && !readOnly && (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => fileRef.current?.click()}
            className="py-3 rounded-xl text-sm font-bold text-white" style={{ background: "#eb0915" }}>
            📷 Quét ảnh món ăn
          </button>
          <button type="button" onClick={startManual}
            className="py-3 rounded-xl text-sm font-bold"
            style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.7)" }}>
            ✏️ Thêm thủ công
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
        </div>
      )}

      {/* Bản nháp món đang thêm */}
      {draft && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3" style={{ border: "1px solid rgba(235,9,21,0.3)" }}>
          {draft.preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.preview} alt="Ảnh món ăn" className="w-full rounded-xl object-cover" style={{ maxHeight: "200px" }} />
          )}

          {draft.scanning ? (
            <p className="text-sm text-center py-2" style={{ color: "rgba(18,16,13,0.5)" }}>🤖 AI đang phân tích món ăn…</p>
          ) : (
            <>
              {draft.confidence && (
                <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>Độ tin cậy AI: {draft.confidence} — chỉnh lại nếu cần</p>
              )}

              {/* Tìm món trong thư viện CSDL — chọn để tự điền & quy đổi macro theo gram */}
              {draft.source === "manual" && (
                <div className="space-y-2">
                  <div className="relative">
                    <input className="dp-input w-full" placeholder="Tìm món trong thư viện…" value={draft.query}
                      onChange={(e) => setField("query", e.target.value)} autoFocus />
                    {draft.query.trim() && (!draft.selectedFood || draft.query !== draft.selectedFood.name) && (
                      <div className="absolute left-0 right-0 mt-1 z-10 bg-white rounded-xl overflow-hidden shadow-lg"
                        style={{ border: "1px solid rgba(18,16,13,0.12)" }}>
                        {searchFoods(draft.query).length === 0 ? (
                          <p className="text-xs px-3 py-2.5" style={{ color: "rgba(18,16,13,0.4)" }}>Không tìm thấy món phù hợp</p>
                        ) : (
                          searchFoods(draft.query).map((f) => (
                            <button key={f.name} type="button" onClick={() => pickFood(f)}
                              className="btn-flat w-full text-left px-3 py-2 flex items-center justify-between gap-2"
                              style={{ borderBottom: "1px solid rgba(18,16,13,0.05)" }}>
                              <span className="text-sm font-semibold truncate" style={{ color: "#12100d" }}>{f.name}</span>
                              <span className="text-xs shrink-0" style={{ color: "rgba(18,16,13,0.4)" }}>{f.calories} kcal/100g</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {draft.selectedFood && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs shrink-0" style={{ color: "rgba(18,16,13,0.5)" }}>Khối lượng (g)</span>
                      <input type="number" inputMode="numeric" className="dp-input flex-1 text-center" value={draft.grams}
                        onChange={(e) => setGrams(e.target.value)} />
                    </div>
                  )}
                </div>
              )}

              <input className="dp-input w-full" placeholder="Tên món" value={draft.name}
                onChange={(e) => setField("name", e.target.value)} />
              <input className="dp-input w-full" placeholder="Bữa (sáng/trưa/tối…) — tuỳ chọn" value={draft.mealLabel}
                onChange={(e) => setField("mealLabel", e.target.value)} />
              <div className="grid grid-cols-4 gap-2">
                <NumField label="Kcal" value={draft.calories} onChange={(v) => setField("calories", v)} />
                <NumField label="Đạm" value={draft.protein} onChange={(v) => setField("protein", v)} />
                <NumField label="Béo" value={draft.fat} onChange={(v) => setField("fat", v)} />
                <NumField label="Bột" value={draft.carbs} onChange={(v) => setField("carbs", v)} />
              </div>
              {draft.error && <p className="text-xs" style={{ color: "#eb0915" }}>{draft.error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={saveDraft} disabled={draft.saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#eb0915", opacity: draft.saving ? 0.6 : 1 }}>
                  {draft.saving ? "Đang lưu…" : "Lưu vào nhật ký"}
                </button>
                <button type="button" onClick={() => setDraft(null)} disabled={draft.saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.6)" }}>
                  Huỷ
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Danh sách món trong ngày */}
      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-center py-6" style={{ color: "rgba(18,16,13,0.4)" }}>Đang tải…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "rgba(18,16,13,0.4)" }}>Chưa có món nào trong ngày.</p>
        ) : (
          logs.map((l) => {
            const src = photoSrc(l.photoUrl);
            return (
              <div key={l.id} className="dp-row-card flex items-center gap-1 bg-white rounded-xl pr-2" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
                <button type="button" onClick={() => setViewingLog(l)} title="Xem chi tiết bữa ăn"
                  className="btn-flat flex-1 min-w-0 flex items-center gap-3 text-left p-3">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={l.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center" style={{ background: "rgba(18,16,13,0.05)" }}>🍽️</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "#12100d" }}>
                      {l.mealLabel ? <span style={{ color: "rgba(18,16,13,0.4)" }}>{l.mealLabel} · </span> : null}
                      {l.name}
                    </p>
                    <p className="text-xs" style={{ color: "rgba(18,16,13,0.45)" }}>
                      {l.calories} kcal · P{l.protein ?? 0} F{l.fat ?? 0} C{l.carbs ?? 0}
                    </p>
                  </div>
                </button>
                {!readOnly && (
                  <button type="button" onClick={() => removeLog(l.id)}
                    className="px-2 py-1 text-sm shrink-0" style={{ color: "rgba(18,16,13,0.35)" }} aria-label="Xoá">
                    ✕
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal chi tiết bữa ăn */}
      {viewingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(18,16,13,0.8)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewingLog(null); }}>
          <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
            {photoSrc(viewingLog.photoUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoSrc(viewingLog.photoUrl)!} alt={viewingLog.name} className="w-full object-cover" style={{ maxHeight: "60vh" }} />
            ) : (
              <div className="w-full flex items-center justify-center" style={{ height: "180px", background: "rgba(18,16,13,0.05)", fontSize: "48px" }}>🍽️</div>
            )}
            <div className="p-5">
              {viewingLog.mealLabel && (
                <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-2"
                  style={{ background: "rgba(235,9,21,0.08)", color: "#eb0915" }}>
                  {viewingLog.mealLabel}
                </span>
              )}
              <h3 className="text-xl font-bold mb-1" style={{ color: "#12100d" }}>{viewingLog.name}</h3>
              <p className="text-xs mb-4" style={{ color: "rgba(18,16,13,0.45)" }}>{fmtFullDate(viewingLog.date)}</p>

              <div className="grid grid-cols-4 gap-2">
                <DetailStat label="Calo" value={`${viewingLog.calories}`} unit="kcal" big />
                <DetailStat label="Đạm" value={`${viewingLog.protein ?? 0}`} unit="g" />
                <DetailStat label="Béo" value={`${viewingLog.fat ?? 0}`} unit="g" />
                <DetailStat label="Tinh bột" value={`${viewingLog.carbs ?? 0}`} unit="g" />
              </div>

              <button type="button" onClick={() => setViewingLog(null)}
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

function fmtFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function DetailStat({ label, value, unit, big = false }: { label: string; value: string; unit: string; big?: boolean }) {
  return (
    <div className="rounded-xl p-2.5 text-center" style={{ background: big ? "rgba(235,9,21,0.06)" : "rgba(18,16,13,0.04)" }}>
      <p className="text-xs mb-0.5" style={{ color: "rgba(18,16,13,0.4)" }}>{label}</p>
      <p className="font-bold leading-none" style={{ color: big ? "#eb0915" : "#12100d", fontSize: big ? "1.25rem" : "1rem" }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: "rgba(18,16,13,0.35)" }}>{unit}</p>
    </div>
  );
}

function numOr0(s: string): number {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function MacroCell({ label, value, tgt }: { label: string; value: number; tgt?: number }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: "rgba(18,16,13,0.04)" }}>
      <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: "#12100d" }}>
        {value}{tgt != null ? <span style={{ color: "rgba(18,16,13,0.35)" }}>/{tgt}</span> : null}g
      </p>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs mb-1 text-center" style={{ color: "rgba(18,16,13,0.4)" }}>{label}</p>
      <input type="number" inputMode="numeric" className="dp-input w-full text-center" value={value}
        onChange={(e) => onChange(e.target.value)} style={{ padding: "0.4rem 0.3rem" }} />
    </div>
  );
}
