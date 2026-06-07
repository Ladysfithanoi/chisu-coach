"use client";

import { useCallback, useState } from "react";
import AppHeader from "../_components/AppHeader";
import DietForm from "../_components/DietForm";
import WeightTracker from "../_components/WeightTracker";
import FoodLogTracker from "../_components/FoodLogTracker";
import FoodAlbum from "../_components/FoodAlbum";
import TransformGallery from "../_components/TransformGallery";
import type { WeightPoint } from "@/lib/weight";

export interface StudentRow {
  id: string;
  name: string;
  email: string;
  medicalConditions: string | null;
  createdAt: string;
  mealPlans: { id: string; label: string | null; calories: number; updatedAt: string }[];
}

export default function PTDashboard({
  ptName,
  initialStudents,
}: {
  ptName: string;
  initialStudents: StudentRow[];
}) {
  const [students, setStudents] = useState<StudentRow[]>(initialStudents);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [detailTab, setDetailTab] = useState<"plan" | "foodlog" | "album" | "weight" | "transform">("plan");
  const [studentWeights, setStudentWeights] = useState<WeightPoint[] | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);

  // Add-student form
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [medical, setMedical] = useState("");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  // Edit-student modal
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eMedical, setEMedical] = useState("");
  const [ePassword, setEPassword] = useState("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tìm kiếm + phân trang
  const PAGE_SIZE = 5;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const loadStudents = useCallback(async () => {
    const res = await fetch("/api/pt/students");
    const data = (await res.json()) as { students?: StudentRow[] };
    setStudents(data.students ?? []);
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (adding) return;
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/pt/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, medicalConditions: medical }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) { setAddError(data.error ?? "Tạo thất bại"); return; }
      setName(""); setEmail(""); setPassword(""); setMedical(""); setShowAdd(false);
      await loadStudents();
    } catch {
      setAddError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setAdding(false);
    }
  }

  function openEdit(s: StudentRow) {
    setEditing(s); setEName(s.name); setEEmail(s.email); setEMedical(s.medicalConditions ?? ""); setEPassword(""); setEditError("");
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || editSaving) return;
    setEditSaving(true); setEditError("");
    try {
      const res = await fetch(`/api/pt/students/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: eName, email: eEmail, password: ePassword, medicalConditions: eMedical }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) { setEditError(data.error ?? "Lưu thất bại"); return; }
      setEditing(null);
      await loadStudents();
    } catch {
      setEditError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(s: StudentRow) {
    if (deletingId) return;
    if (!window.confirm(`Xóa học viên "${s.name}"? Thực đơn đã gán cũng sẽ bị xóa và không thể hoàn tác.`)) return;
    setDeletingId(s.id);
    try {
      const res = await fetch(`/api/pt/students/${s.id}`, { method: "DELETE" });
      if (res.ok) await loadStudents();
    } finally {
      setDeletingId(null);
    }
  }

  async function openStudent(s: StudentRow) {
    setSelected(s);
    setDetailTab("plan");
    setStudentWeights(null);
    setWeightError(null);
    try {
      const res = await fetch(`/api/weight?studentId=${s.id}`);
      if (res.status === 401) {
        // Phiên đã bị đăng nhập ở nơi khác — quay về login
        window.location.assign("/login?kicked=1");
        return;
      }
      if (!res.ok) {
        setWeightError("Không tải được dữ liệu cân nặng. Vui lòng thử lại.");
        setStudentWeights([]);
        return;
      }
      const data = (await res.json()) as { entries?: WeightPoint[] };
      setStudentWeights(data.entries ?? []);
    } catch {
      setWeightError("Lỗi kết nối khi tải cân nặng.");
      setStudentWeights([]);
    }
  }

  // ── Màn hồ sơ 1 học viên: Thực đơn + Cân nặng ──
  if (selected) {
    return (
      <div className="min-h-screen bg-white py-6 md:py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-4 text-sm font-semibold"
            style={{ color: "#eb0915" }}
          >
            ← Quay lại danh sách học viên
          </button>
          <div className="mb-4">
            <h1 className="text-2xl font-bold" style={{ color: "#12100d" }}>
              Hồ sơ <span style={{ color: "#eb0915" }}>{selected.name}</span>
            </h1>
            <p className="text-sm" style={{ color: "rgba(18,16,13,0.5)" }}>{selected.email}</p>
            {selected.medicalConditions?.trim() && (
              <div
                className="mt-3 rounded-xl px-3 py-2 text-sm"
                style={{ background: "rgba(235,9,21,0.06)", border: "1px solid rgba(235,9,21,0.18)", color: "#12100d" }}
              >
                <span className="font-semibold" style={{ color: "#eb0915" }}>Bệnh lý: </span>
                <span style={{ whiteSpace: "pre-wrap" }}>{selected.medicalConditions}</span>
              </div>
            )}
          </div>

          {/* Tabs hồ sơ */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <TabButton active={detailTab === "plan"} onClick={() => setDetailTab("plan")}>Thực đơn</TabButton>
            <TabButton active={detailTab === "foodlog"} onClick={() => setDetailTab("foodlog")}>Nhật ký</TabButton>
            <TabButton active={detailTab === "album"} onClick={() => setDetailTab("album")}>Album ăn uống</TabButton>
            <TabButton active={detailTab === "weight"} onClick={() => setDetailTab("weight")}>Cân nặng</TabButton>
            <TabButton active={detailTab === "transform"} onClick={() => setDetailTab("transform")}>Transform</TabButton>
          </div>

          {/* Giữ cả 2 tab mounted để không mất trạng thái khi chuyển qua lại */}
          <div style={{ display: detailTab === "plan" ? "block" : "none" }}>
            {/* key theo học viên: mỗi học viên có editor thực đơn sạch, không dính bữa của người trước */}
            <DietForm
              key={selected.id}
              userName={ptName}
              mode="pt-assign"
              assignStudent={{ id: selected.id, name: selected.name }}
              showChrome={false}
              onSaved={loadStudents}
            />
          </div>
          <div style={{ display: detailTab === "weight" ? "block" : "none" }}>
            {weightError ? (
              <p className="dp-error-msg">{weightError}</p>
            ) : studentWeights === null ? (
              <p className="text-sm" style={{ color: "rgba(18,16,13,0.5)" }}>Đang tải dữ liệu cân nặng...</p>
            ) : (
              <WeightTracker key={selected.id} initialEntries={studentWeights} studentId={selected.id} />
            )}
          </div>
          {/* Nhật ký & Transform tự nạp dữ liệu theo studentId — mount khi mở tab */}
          {detailTab === "foodlog" && <FoodLogTracker key={selected.id} studentId={selected.id} readOnly />}
          {detailTab === "album" && <FoodAlbum key={selected.id} studentId={selected.id} />}
          {detailTab === "transform" && <TransformGallery key={selected.id} studentId={selected.id} />}
        </div>
      </div>
    );
  }

  // ── Màn danh sách học viên ──
  const q = search.trim().toLowerCase();
  const filtered = q
    ? students.filter((s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
    : students;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-white py-6 md:py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <AppHeader title={`PT ${ptName}`} subtitle="Quản lý học viên & thực đơn" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>
            Học viên ({students.length})
          </h2>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-sm font-bold"
            style={{ background: "#eb0915", color: "#fff" }}
          >
            {showAdd ? "Đóng" : "+ Thêm học viên"}
          </button>
        </div>

        {showAdd && (
          <form
            onSubmit={handleAdd}
            className="bg-white rounded-2xl p-5 mb-5 space-y-3"
            style={{ border: "1px solid rgba(18,16,13,0.1)" }}
          >
            <input className="dp-input" placeholder="Họ và tên" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="dp-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="dp-input" type="password" placeholder="Mật khẩu (≥ 6 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <textarea
              className="dp-input"
              rows={3}
              placeholder="Bệnh lý / tiền sử bệnh (nếu có) — vd: tiểu đường, cao huyết áp, dị ứng hải sản..."
              value={medical}
              onChange={(e) => setMedical(e.target.value)}
            />
            {addError && <p className="dp-error-msg">{addError}</p>}
            <button
              type="submit" disabled={adding}
              className="w-full py-2.5 rounded-xl font-bold text-sm"
              style={{ background: "#12100d", color: "#fff", opacity: adding ? 0.6 : 1 }}
            >
              {adding ? "Đang tạo..." : "Tạo học viên"}
            </button>
          </form>
        )}

        {/* Ô tìm kiếm */}
        {students.length > 0 && (
          <input
            className="dp-input mb-4"
            placeholder="Tìm theo tên hoặc email học viên..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        )}

        {students.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(18,16,13,0.5)" }}>Chưa có học viên nào. Bấm “Thêm học viên” để bắt đầu.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(18,16,13,0.5)" }}>Không tìm thấy học viên khớp “{search}”.</p>
        ) : (
          <div className="space-y-2">
            {pageItems.map((s) => (
              <div
                key={s.id}
                className="dp-row-card bg-white rounded-xl p-4 flex items-center justify-between gap-3"
                style={{ border: "1px solid rgba(18,16,13,0.1)" }}
              >
                <button
                  type="button"
                  onClick={() => openStudent(s)}
                  className="btn-flat flex-1 min-w-0 text-left flex items-center justify-between gap-3"
                  title="Mở hồ sơ (thực đơn + cân nặng)"
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate" style={{ color: "#12100d" }}>{s.name}</p>
                    <p className="text-xs truncate" style={{ color: "rgba(18,16,13,0.45)" }}>{s.email}</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: s.mealPlans.length ? "rgba(22,163,74,0.1)" : "rgba(18,16,13,0.06)", color: s.mealPlans.length ? "#16a34a" : "rgba(18,16,13,0.5)" }}>
                    {s.mealPlans.length ? `${s.mealPlans[0].calories} kcal` : "Chưa có thực đơn"}
                  </span>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    title="Sửa học viên"
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ color: "rgba(18,16,13,0.6)", border: "1px solid rgba(18,16,13,0.12)" }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                    title="Xóa học viên"
                    className="w-8 h-8 flex items-center justify-center rounded-lg"
                    style={{ color: "#eb0915", border: "1px solid rgba(235,9,21,0.2)", opacity: deletingId === s.id ? 0.5 : 1 }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      <line x1="10" y1="11" x2="10" y2="17"/>
                      <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Phân trang (5 học viên/trang) */}
        {filtered.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: safePage <= 1 ? 0.4 : 1 }}
            >
              ← Trước
            </button>
            <span className="text-sm font-medium" style={{ color: "rgba(18,16,13,0.6)" }}>
              Trang {safePage}/{totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", opacity: safePage >= totalPages ? 0.4 : 1 }}
            >
              Sau →
            </button>
          </div>
        )}
      </div>

      {/* ── Modal sửa học viên ── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(18,16,13,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ background: "white", border: "1px solid rgba(18,16,13,0.08)" }}>
            <h3 className="text-lg font-bold mb-4" style={{ color: "#12100d" }}>Sửa học viên</h3>
            <form onSubmit={handleEditSave} className="space-y-3">
              <input className="dp-input" placeholder="Họ và tên" value={eName} onChange={(e) => { setEName(e.target.value); setEditError(""); }} required />
              <input className="dp-input" type="email" placeholder="Email" value={eEmail} onChange={(e) => { setEEmail(e.target.value); setEditError(""); }} required />
              <textarea
                className="dp-input"
                rows={3}
                placeholder="Bệnh lý / tiền sử bệnh (nếu có)"
                value={eMedical}
                onChange={(e) => { setEMedical(e.target.value); setEditError(""); }}
              />
              <input className="dp-input" type="password" placeholder="Mật khẩu mới (để trống nếu không đổi)" value={ePassword} onChange={(e) => { setEPassword(e.target.value); setEditError(""); }} />
              {editError && <p className="dp-error-msg">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditing(null)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.7)" }}>
                  Huỷ
                </button>
                <button type="submit" disabled={editSaving}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: "#eb0915", color: "#fff", opacity: editSaving ? 0.6 : 1 }}>
                  {editSaving ? "Đang lưu..." : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
