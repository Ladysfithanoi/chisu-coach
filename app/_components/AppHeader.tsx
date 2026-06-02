"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const [showChangePwd, setShowChangePwd] = useState(false);
  const [cpCurrent, setCpCurrent] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpError, setCpError] = useState("");
  const [cpSaving, setCpSaving] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (cpSaving) return;
    setCpSaving(true);
    setCpError("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew, confirmPassword: cpConfirm }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setCpError(data.error ?? "Đã có lỗi xảy ra");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setCpError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setCpSaving(false);
    }
  }

  return (
    <>
      {showChangePwd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(18,16,13,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowChangePwd(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ background: "white", border: "1px solid rgba(18,16,13,0.08)" }}
          >
            <h3 className="text-lg font-bold mb-4" style={{ color: "#12100d" }}>Đổi mật khẩu</h3>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <input
                type="password" placeholder="Mật khẩu hiện tại" value={cpCurrent}
                onChange={(e) => setCpCurrent(e.target.value)} className="dp-input" required
              />
              <input
                type="password" placeholder="Mật khẩu mới (≥ 6 ký tự)" value={cpNew}
                onChange={(e) => setCpNew(e.target.value)} className="dp-input" required
              />
              <input
                type="password" placeholder="Xác nhận mật khẩu mới" value={cpConfirm}
                onChange={(e) => setCpConfirm(e.target.value)} className="dp-input" required
              />
              {cpError && <p className="dp-error-msg">{cpError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button" onClick={() => setShowChangePwd(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm"
                  style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.7)" }}
                >
                  Huỷ
                </button>
                <button
                  type="submit" disabled={cpSaving}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: "#eb0915", color: "#fff", opacity: cpSaving ? 0.6 : 1 }}
                >
                  {cpSaving ? "Đang lưu..." : "Đổi mật khẩu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header
        className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6"
        style={{ borderBottom: "1px solid rgba(18,16,13,0.08)" }}
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight" style={{ color: "#12100d" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm" style={{ color: "rgba(18,16,13,0.5)" }}>{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button" onClick={() => { setCpCurrent(""); setCpNew(""); setCpConfirm(""); setCpError(""); setShowChangePwd(true); }}
            className="px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{ background: "rgba(18,16,13,0.05)", color: "rgba(18,16,13,0.7)", border: "1px solid rgba(18,16,13,0.1)" }}
          >
            Đổi mật khẩu
          </button>
          <button
            type="button" onClick={handleLogout} disabled={loggingOut}
            className="px-3 py-1.5 text-sm font-medium rounded-lg"
            style={{ background: "rgba(235,9,21,0.06)", color: "#eb0915", border: "1px solid rgba(235,9,21,0.2)", opacity: loggingOut ? 0.6 : 1 }}
          >
            {loggingOut ? "Đang xuất..." : "Đăng xuất"}
          </button>
        </div>
      </header>
    </>
  );
}
