"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { compressImage } from "@/lib/compress";
import { composeBeforeAfter } from "@/lib/transform-compose";
import { photoSrc } from "@/lib/photo";

export type TransformPhoto = {
  id: string;
  photoUrl: string;
  takenAt: string | null;
  label: string | null;
};

function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

type Draft = {
  imageBase64: string;
  mimeType: string;
  preview: string;
  takenAt: string;
  label: string;
  saving: boolean;
  error?: string;
};

type SideImg = { base64: string; mimeType: string; preview: string };
type Compose = {
  before?: SideImg;
  after?: SideImg;
  beforeWeight: string;
  afterWeight: string;
  label: string;
  takenAt: string;
  result?: { base64: string; preview: string };
  building: boolean;
  saving: boolean;
  error?: string;
};

export default function TransformGallery({ studentId }: { studentId?: string }) {
  const [photos, setPhotos] = useState<TransformPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [compose, setCompose] = useState<Compose | null>(null);
  const [viewing, setViewing] = useState<TransformPhoto | null>(null);
  const [confirming, setConfirming] = useState<TransformPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  const qsStudent = studentId ? `?studentId=${studentId}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transform${qsStudent}`);
      const data = await res.json();
      setPhotos(res.ok ? data.photos ?? [] : []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [qsStudent]);

  useEffect(() => {
    // Đồng bộ với server khi mở — setState ở đây là cố ý.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    try {
      const { base64, mimeType } = await compressImage(file);
      setDraft({
        imageBase64: base64,
        mimeType,
        preview: `data:${mimeType};base64,${base64}`,
        takenAt: localToday(),
        label: "",
        saving: false,
      });
    } catch {
      // bỏ qua nếu không xử lý được ảnh
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setDraft({ ...draft, saving: true, error: undefined });
    try {
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: draft.imageBase64, mimeType: draft.mimeType, studentId }),
      });
      const upData = await up.json();
      if (!up.ok) {
        setDraft((d) => (d ? { ...d, saving: false, error: upData.error || "Upload ảnh thất bại" } : d));
        return;
      }

      const res = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          photoUrl: upData.photoUrl,
          takenAt: draft.takenAt || undefined,
          label: draft.label.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraft((d) => (d ? { ...d, saving: false, error: data.error || "Lưu thất bại" } : d));
        return;
      }
      setPhotos((prev) => [data.photo as TransformPhoto, ...prev]);
      setDraft(null);
    } catch {
      setDraft((d) => (d ? { ...d, saving: false, error: "Lỗi mạng" } : d));
    }
  }

  async function confirmRemove() {
    if (!confirming) return;
    const id = confirming.id;
    const prev = photos;
    setDeleting(true);
    setPhotos((p) => p.filter((x) => x.id !== id)); // optimistic
    const res = await fetch(`/api/transform?id=${id}`, { method: "DELETE" });
    if (!res.ok) setPhotos(prev); // rollback nếu lỗi
    setDeleting(false);
    setConfirming(null);
    setViewing(null);
  }

  // ── Ghép ảnh Trước/Sau ──
  function startCompose() {
    setCompose({ beforeWeight: "", afterWeight: "", label: "", takenAt: localToday(), building: false, saving: false });
  }

  async function pickSide(which: "before" | "after", e: React.ChangeEvent<HTMLInputElement>) {
    const ref = which === "before" ? beforeRef : afterRef;
    const file = e.target.files?.[0];
    if (ref.current) ref.current.value = "";
    if (!file) return;
    try {
      const { base64, mimeType } = await compressImage(file);
      // Đổi ảnh thì bỏ kết quả ghép cũ.
      setCompose((c) => (c ? { ...c, [which]: { base64, mimeType, preview: `data:${mimeType};base64,${base64}` }, result: undefined } : c));
    } catch {
      setCompose((c) => (c ? { ...c, error: "Không xử lý được ảnh" } : c));
    }
  }

  async function buildComposite() {
    if (!compose?.before || !compose?.after) return;
    setCompose({ ...compose, building: true, error: undefined });
    try {
      const out = await composeBeforeAfter(
        { ...compose.before, weight: compose.beforeWeight },
        { ...compose.after, weight: compose.afterWeight }
      );
      setCompose((c) => (c ? { ...c, building: false, result: { base64: out.base64, preview: `data:${out.mimeType};base64,${out.base64}` } } : c));
    } catch {
      setCompose((c) => (c ? { ...c, building: false, error: "Ghép ảnh thất bại" } : c));
    }
  }

  async function saveComposite() {
    if (!compose?.result) return;
    setCompose({ ...compose, saving: true, error: undefined });
    try {
      const up = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: compose.result.base64, mimeType: "image/jpeg", studentId }),
      });
      const upData = await up.json();
      if (!up.ok) {
        setCompose((c) => (c ? { ...c, saving: false, error: upData.error || "Upload ảnh thất bại" } : c));
        return;
      }
      const res = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          photoUrl: upData.photoUrl,
          takenAt: compose.takenAt || undefined,
          label: compose.label.trim() || "Trước / Sau",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCompose((c) => (c ? { ...c, saving: false, error: data.error || "Lưu thất bại" } : c));
        return;
      }
      setPhotos((prev) => [data.photo as TransformPhoto, ...prev]);
      setCompose(null);
    } catch {
      setCompose((c) => (c ? { ...c, saving: false, error: "Lỗi mạng" } : c));
    }
  }

  return (
    <div className="space-y-4">
      {!draft && !compose && (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={startCompose}
            className="py-3 rounded-xl text-sm font-bold text-white" style={{ background: "#eb0915" }}>
            ✨ Ghép Trước/Sau
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="py-3 rounded-xl text-sm font-bold"
            style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.7)" }}>
            📷 Up ảnh có sẵn
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPickPhoto} />

      {/* Bản nháp ảnh đang thêm */}
      {draft && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3" style={{ border: "1px solid rgba(235,9,21,0.3)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draft.preview} alt="Ảnh tiến trình" className="w-full rounded-xl object-cover" style={{ maxHeight: "320px" }} />
          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: "rgba(18,16,13,0.4)" }}>Ngày chụp</p>
              <input type="date" className="dp-input w-full" value={draft.takenAt}
                onChange={(e) => setDraft((d) => (d ? { ...d, takenAt: e.target.value } : d))} />
            </div>
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: "rgba(18,16,13,0.4)" }}>Nhãn (tuỳ chọn)</p>
              <input className="dp-input w-full" placeholder="VD: Trước / Sau 4 tuần" value={draft.label}
                onChange={(e) => setDraft((d) => (d ? { ...d, label: e.target.value } : d))} />
            </div>
          </div>
          {draft.error && <p className="text-xs" style={{ color: "#eb0915" }}>{draft.error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={saveDraft} disabled={draft.saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#eb0915", opacity: draft.saving ? 0.6 : 1 }}>
              {draft.saving ? "Đang lưu…" : "Lưu ảnh"}
            </button>
            <button type="button" onClick={() => setDraft(null)} disabled={draft.saving}
              className="px-4 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.6)" }}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {/* Ghép ảnh Trước/Sau */}
      {compose && (
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3" style={{ border: "1px solid rgba(235,9,21,0.3)" }}>
          <p className="text-sm font-bold" style={{ color: "#12100d" }}>Ghép ảnh Trước / Sau</p>

          <div className="grid grid-cols-2 gap-3">
            <SidePicker label="TRƯỚC" img={compose.before} weight={compose.beforeWeight}
              onPick={() => beforeRef.current?.click()}
              onWeight={(v) => setCompose((c) => (c ? { ...c, beforeWeight: v, result: undefined } : c))} />
            <SidePicker label="SAU" img={compose.after} weight={compose.afterWeight}
              onPick={() => afterRef.current?.click()}
              onWeight={(v) => setCompose((c) => (c ? { ...c, afterWeight: v, result: undefined } : c))} />
          </div>
          <input ref={beforeRef} type="file" accept="image/*" hidden onChange={(e) => pickSide("before", e)} />
          <input ref={afterRef} type="file" accept="image/*" hidden onChange={(e) => pickSide("after", e)} />

          {/* Ảnh ghép xem trước */}
          {compose.result && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={compose.result.preview} alt="Ảnh ghép" className="w-full rounded-xl" />
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: "rgba(18,16,13,0.4)" }}>Ngày</p>
              <input type="date" className="dp-input w-full" value={compose.takenAt}
                onChange={(e) => setCompose((c) => (c ? { ...c, takenAt: e.target.value } : c))} />
            </div>
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: "rgba(18,16,13,0.4)" }}>Nhãn (tuỳ chọn)</p>
              <input className="dp-input w-full" placeholder="VD: Sau 8 tuần" value={compose.label}
                onChange={(e) => setCompose((c) => (c ? { ...c, label: e.target.value } : c))} />
            </div>
          </div>

          {compose.error && <p className="text-xs" style={{ color: "#eb0915" }}>{compose.error}</p>}

          <div className="flex gap-2">
            {!compose.result ? (
              <button type="button" onClick={buildComposite} disabled={!compose.before || !compose.after || compose.building}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: "#eb0915", opacity: !compose.before || !compose.after || compose.building ? 0.5 : 1 }}>
                {compose.building ? "Đang ghép…" : "Tạo ảnh ghép"}
              </button>
            ) : (
              <>
                <button type="button" onClick={saveComposite} disabled={compose.saving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "#eb0915", opacity: compose.saving ? 0.6 : 1 }}>
                  {compose.saving ? "Đang lưu…" : "Lưu vào thư viện"}
                </button>
                <button type="button" onClick={buildComposite} disabled={compose.saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.6)" }}>
                  Ghép lại
                </button>
              </>
            )}
            <button type="button" onClick={() => setCompose(null)} disabled={compose.saving || compose.building}
              className="px-4 py-2.5 rounded-xl text-sm font-bold"
              style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.6)" }}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {/* Lưới ảnh */}
      {loading ? (
        <p className="text-sm text-center py-6" style={{ color: "rgba(18,16,13,0.4)" }}>Đang tải…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: "rgba(18,16,13,0.4)" }}>Chưa có ảnh tiến trình nào.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {photos.map((p) => {
            const src = photoSrc(p.photoUrl);
            return (
              <button key={p.id} type="button" onClick={() => setViewing(p)}
                className="btn-flat text-left rounded-xl overflow-hidden" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={p.label ?? "Ảnh tiến trình"} className="w-full object-cover" style={{ aspectRatio: "3/4" }} />
                )}
                <div className="p-2">
                  {p.label && <p className="text-xs font-bold truncate" style={{ color: "#12100d" }}>{p.label}</p>}
                  <p className="text-xs" style={{ color: "rgba(18,16,13,0.45)" }}>{fmtDate(p.takenAt) || "—"}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Xem ảnh lớn */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(18,16,13,0.8)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}>
          <div className="w-full max-w-md">
            {photoSrc(viewing.photoUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoSrc(viewing.photoUrl)!} alt={viewing.label ?? "Ảnh tiến trình"} className="w-full rounded-2xl" />
            )}
            <div className="flex items-center justify-between mt-3">
              <div>
                {viewing.label && <p className="text-sm font-bold text-white">{viewing.label}</p>}
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{fmtDate(viewing.takenAt) || "—"}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(viewing)}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: "rgba(235,9,21,0.9)", color: "#fff" }}>
                  Xoá
                </button>
                <button type="button" onClick={() => setViewing(null)}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold" style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dialog xác nhận xoá */}
      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" style={{ background: "rgba(18,16,13,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setConfirming(null); }}>
          <div className="w-full max-w-xs rounded-2xl p-6 shadow-2xl text-center" style={{ background: "white", border: "1px solid rgba(18,16,13,0.08)" }}>
            <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center" style={{ background: "rgba(235,9,21,0.1)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#eb0915" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="text-base font-bold mb-1" style={{ color: "#12100d" }}>Xoá ảnh này?</h3>
            <p className="text-sm mb-5" style={{ color: "rgba(18,16,13,0.5)" }}>
              Ảnh sẽ bị xoá khỏi thư viện và Google Drive, không thể hoàn tác.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(null)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.7)" }}>
                Huỷ
              </button>
              <button type="button" onClick={confirmRemove} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: "#eb0915", opacity: deleting ? 0.6 : 1 }}>
                {deleting ? "Đang xoá…" : "Xoá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SidePicker({
  label,
  img,
  weight,
  onPick,
  onWeight,
}: {
  label: string;
  img?: { preview: string };
  weight: string;
  onPick: () => void;
  onWeight: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <button type="button" onClick={onPick}
        className="btn-flat w-full rounded-xl overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: "3/4", border: "1px dashed rgba(18,16,13,0.25)", background: "rgba(18,16,13,0.03)" }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-semibold" style={{ color: "rgba(18,16,13,0.45)" }}>+ Ảnh {label}</span>
        )}
      </button>
      <input type="number" inputMode="decimal" step="0.1" placeholder={`Cân ${label.toLowerCase()} (kg)`}
        className="dp-input w-full text-center" value={weight} onChange={(e) => onWeight(e.target.value)} />
    </div>
  );
}
