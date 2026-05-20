"use client";

import { useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface Props {
  initialUsers: User[];
}

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
      style={{ background: "rgba(235,9,21,0.05)", border: "1px solid rgba(235,9,21,0.2)", color: "#eb0915" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {msg}
    </div>
  );
}

function SuccessBox({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
      style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)", color: "#16a34a" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      {msg}
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

interface EditModalProps {
  user: User;
  onClose: () => void;
  onSaved: (updated: User) => void;
}

function EditModal({ user, onClose, onSaved }: EditModalProps) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/update-user/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; user?: User };

      if (!res.ok) {
        setError(data.error ?? "Đã có lỗi xảy ra");
        return;
      }

      if (data.user) onSaved(data.user);
      onClose();
    } catch {
      setError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(18,16,13,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: "white", border: "1px solid rgba(18,16,13,0.08)" }}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold" style={{ color: "#12100d" }}>
            Sửa tài khoản
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "rgba(18,16,13,0.4)", background: "rgba(18,16,13,0.05)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="dp-label">Họ và tên</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              required
              className="dp-input"
            />
          </div>
          <div>
            <label className="dp-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              required
              className="dp-input"
            />
          </div>
          <div>
            <label className="dp-label">
              Mật khẩu mới
              <span className="ml-1.5 text-xs font-normal" style={{ color: "rgba(18,16,13,0.4)" }}>
                (bỏ trống để giữ nguyên)
              </span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••••"
              className="dp-input"
            />
          </div>

          {error && <ErrorBox msg={error} />}

          <div
            className="rounded-xl px-4 py-2.5 text-xs flex items-start gap-2"
            style={{ background: "rgba(235,9,21,0.04)", border: "1px solid rgba(235,9,21,0.12)", color: "rgba(18,16,13,0.55)" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#eb0915" strokeWidth="2" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Sau khi lưu, người dùng sẽ bị đăng xuất và phải đăng nhập lại bằng thông tin mới.
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ border: "1px solid rgba(18,16,13,0.12)", color: "rgba(18,16,13,0.6)", background: "transparent" }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
              style={{
                background: saving ? "rgba(235,9,21,0.55)" : "#eb0915",
                color: "white",
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                  </svg>
                  Đang lưu...
                </span>
              ) : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminUsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);

  // Create form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editSuccess, setEditSuccess] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFormError("");
    setFormSuccess("");

    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; user?: User };

      if (!res.ok) {
        setFormError(data.error ?? "Đã có lỗi xảy ra");
        return;
      }

      if (data.user) setUsers((prev) => [...prev, data.user!]);
      setName(""); setEmail(""); setPassword("");
      setFormSuccess(`Đã cấp tài khoản cho ${data.user?.name ?? email} thành công!`);
    } catch {
      setFormError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(userId: string, userName: string) {
    if (!confirm(`Xóa tài khoản "${userName}"? Hành động này không thể hoàn tác.`)) return;
    setDeletingId(userId);

    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok) { alert(data.error ?? "Không thể xóa tài khoản"); return; }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      alert("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setDeletingId(null);
    }
  }

  function handleUserSaved(updated: User) {
    setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
    setEditSuccess(`Đã cập nhật tài khoản "${updated.name}" thành công!`);
    setTimeout(() => setEditSuccess(""), 4000);
  }

  return (
    <>
      {/* Edit Modal */}
      {editingUser && (
        <EditModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={handleUserSaved}
        />
      )}

      <div className="min-h-screen px-4 py-10" style={{ background: "#f7f7f6" }}>
        <div className="max-w-3xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#eb0915" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight" style={{ color: "#12100d" }}>
                Quản lý tài khoản
              </h1>
              <p className="text-sm" style={{ color: "rgba(18,16,13,0.45)" }}>
                Cấp và thu hồi quyền truy cập hệ thống
              </p>
            </div>
            <a
              href="/"
              className="ml-auto text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              style={{ color: "rgba(18,16,13,0.55)", border: "1px solid rgba(18,16,13,0.12)", background: "white" }}
            >
              ← Xem giao diện thực đơn
            </a>
          </div>

          {/* Global edit success */}
          {editSuccess && <SuccessBox msg={editSuccess} />}

          {/* Create User Form */}
          <div
            className="rounded-2xl p-6 shadow-sm"
            style={{ background: "white", border: "1px solid rgba(18,16,13,0.08)" }}
          >
            <h2 className="text-base font-bold mb-5" style={{ color: "#12100d" }}>
              Cấp tài khoản mới
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="dp-label">Họ và tên</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setFormError(""); setFormSuccess(""); }}
                    placeholder="Nguyễn Thị A"
                    required
                    className="dp-input"
                  />
                </div>
                <div>
                  <label className="dp-label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setFormError(""); setFormSuccess(""); }}
                    placeholder="user@dietplan.com"
                    required
                    className="dp-input"
                  />
                </div>
              </div>
              <div>
                <label className="dp-label">Mật khẩu</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFormError(""); setFormSuccess(""); }}
                  placeholder="Tối thiểu 6 ký tự"
                  required
                  minLength={6}
                  className="dp-input"
                />
              </div>

              {formError && <ErrorBox msg={formError} />}
              {formSuccess && <SuccessBox msg={formSuccess} />}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm tracking-wide transition-all active:scale-[0.98]"
                  style={{
                    background: creating ? "rgba(235,9,21,0.55)" : "#eb0915",
                    color: "white",
                    cursor: creating ? "not-allowed" : "pointer",
                  }}
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                      </svg>
                      Đang tạo...
                    </span>
                  ) : "Cấp tài khoản"}
                </button>
              </div>
            </form>
          </div>

          {/* Users Table */}
          <div
            className="rounded-2xl shadow-sm overflow-hidden"
            style={{ background: "white", border: "1px solid rgba(18,16,13,0.08)" }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: "rgba(18,16,13,0.08)" }}>
              <h2 className="text-base font-bold" style={{ color: "#12100d" }}>
                Danh sách tài khoản
                <span
                  className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(18,16,13,0.06)", color: "rgba(18,16,13,0.5)" }}
                >
                  {users.length}
                </span>
              </h2>
            </div>

            {users.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm" style={{ color: "rgba(18,16,13,0.35)" }}>
                Chưa có tài khoản nào
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "rgba(18,16,13,0.03)", borderBottom: "1px solid rgba(18,16,13,0.06)" }}>
                      <th className="text-left px-6 py-3 font-semibold" style={{ color: "rgba(18,16,13,0.5)" }}>Họ tên</th>
                      <th className="text-left px-6 py-3 font-semibold" style={{ color: "rgba(18,16,13,0.5)" }}>Email</th>
                      <th className="text-left px-6 py-3 font-semibold" style={{ color: "rgba(18,16,13,0.5)" }}>Vai trò</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, idx) => (
                      <tr
                        key={user.id}
                        style={{ borderBottom: idx < users.length - 1 ? "1px solid rgba(18,16,13,0.05)" : "none" }}
                      >
                        <td className="px-6 py-3.5 font-medium" style={{ color: "#12100d" }}>
                          {user.name}
                        </td>
                        <td className="px-6 py-3.5" style={{ color: "rgba(18,16,13,0.65)" }}>
                          {user.email}
                        </td>
                        <td className="px-6 py-3.5">
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded-full"
                            style={
                              user.role === "ADMIN"
                                ? { background: "rgba(235,9,21,0.08)", color: "#eb0915" }
                                : { background: "rgba(18,16,13,0.06)", color: "rgba(18,16,13,0.55)" }
                            }
                          >
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => { setEditingUser(user); setEditSuccess(""); }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                              style={{
                                color: "rgba(18,16,13,0.6)",
                                border: "1px solid rgba(18,16,13,0.15)",
                                background: "rgba(18,16,13,0.03)",
                              }}
                            >
                              Sửa
                            </button>
                            <button
                              onClick={() => handleDelete(user.id, user.name)}
                              disabled={deletingId === user.id}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                              style={{
                                color: deletingId === user.id ? "rgba(18,16,13,0.3)" : "#eb0915",
                                border: `1px solid ${deletingId === user.id ? "rgba(18,16,13,0.1)" : "rgba(235,9,21,0.25)"}`,
                                background: deletingId === user.id ? "transparent" : "rgba(235,9,21,0.04)",
                                cursor: deletingId === user.id ? "not-allowed" : "pointer",
                              }}
                            >
                              {deletingId === user.id ? "Đang xóa..." : "Xóa"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
