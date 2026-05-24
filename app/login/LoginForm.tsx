"use client";

import { useState, useRef, FormEvent } from "react";

interface LoginResponse {
  ok?: boolean;
  role?: string;
  error?: string;
}

export default function LoginForm({ kicked }: { kicked: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    kicked ? "Tài khoản của bạn đang được đăng nhập ở một thiết bị khác!" : ""
  );
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Shown as a clickable fallback if window.location.replace() is silently
  // swallowed by WKWebView (Facebook / TikTok in-app browser on iOS 17).
  const [successDest, setSuccessDest] = useState<string | null>(null);
  // Ref-based guard prevents double-submission on rapid double-tap —
  // React state updates are async and can miss back-to-back taps on iOS.
  const submittingRef = useRef(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");
    setSuccessDest(null);

    let navigating = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);

    try {
      // iOS Keychain autofill can populate the input DOM value without
      // triggering React's onChange, leaving state empty. Read directly
      // from the DOM as a fallback so the correct credentials are sent.
      const domEmail = (document.getElementById("email") as HTMLInputElement | null)?.value ?? "";
      const domPassword = (document.getElementById("password") as HTMLInputElement | null)?.value ?? "";
      const finalEmail = (email || domEmail).trim();
      const finalPassword = password || domPassword;

      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: finalEmail, password: finalPassword }),
        signal: controller.signal,
      });

      const data = (await res.json()) as LoginResponse;

      if (!res.ok) {
        setError(data.error ?? "Đăng nhập thất bại. Vui lòng thử lại.");
        return;
      }

      navigating = true;
      const dest = data.role === "ADMIN" ? "/admin/users" : "/";

      // setTimeout(0) flushes the current JS call stack before navigating.
      // Calling location.replace() directly inside an async callback can be
      // silently swallowed by WKWebView on iOS 17 (Facebook/TikTok in-app).
      setTimeout(() => { window.location.replace(dest); }, 0);

      // If still on this page after 2s the navigation was blocked silently.
      // Surface a clickable link so the user is never left stranded.
      setTimeout(() => {
        setSuccessDest(dest);
        setLoading(false);
      }, 2000);

    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Kết nối quá chậm. Vui lòng kiểm tra mạng và thử lại.");
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Lỗi kết nối: ${msg}. Vui lòng thử lại.`);
      }
    } finally {
      clearTimeout(timeoutId);
      submittingRef.current = false;
      if (!navigating) setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "#ffffff" }}
    >
      <div className="w-full max-w-sm">

        {/* Logo + Title */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "#eb0915" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C9 2 6 4.5 6 8c0 2.5 1.5 4.5 3 5.5V20a1 1 0 0 0 2 0v-1h2v1a1 1 0 0 0 2 0v-6.5c1.5-1 3-3 3-5.5 0-3.5-3-6-6-6z"
                fill="white"
                opacity="0.9"
              />
              <path d="M10 13.5v3M14 13.5v3" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#12100d" }}>
            Diet Plan
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(18,16,13,0.45)" }}>
            Đăng nhập để sử dụng máy tính dinh dưỡng
          </p>
        </div>

        {/* Form Card */}
        <div
          className="rounded-2xl p-6 shadow-sm"
          style={{ border: "1px solid rgba(18,16,13,0.1)", background: "#ffffff" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>

            {/* Email */}
            <div>
              <label htmlFor="email" className="dp-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error && !kicked) setError("");
                }}
                placeholder="admin@dietplan.com"
                required
                className={`dp-input ${error ? "dp-input-error" : ""}`}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="dp-label">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error && !kicked) setError("");
                  }}
                  placeholder="••••••••"
                  required
                  className={`dp-input pr-11 ${error ? "dp-input-error" : ""}`}
                  style={{ paddingRight: "2.75rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "rgba(18,16,13,0.35)" }}
                  tabIndex={-1}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Success fallback — shown only when navigation is silently blocked */}
            {successDest && (
              <div
                className="rounded-xl px-4 py-3 text-sm font-medium text-center"
                style={{
                  background: "rgba(22,163,74,0.08)",
                  border: "1px solid rgba(22,163,74,0.3)",
                  color: "#15803d",
                }}
              >
                Đăng nhập thành công!{" "}
                <a
                  href={successDest}
                  style={{ color: "#15803d", fontWeight: 700, textDecoration: "underline" }}
                >
                  Nhấn đây để vào trang →
                </a>
              </div>
            )}

            {/* Error / Kicked Message */}
            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2"
                style={{
                  background: kicked ? "rgba(235,9,21,0.08)" : "rgba(235,9,21,0.05)",
                  border: `1px solid rgba(235,9,21,${kicked ? "0.35" : "0.2"})`,
                  color: "#eb0915",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-base tracking-wide transition-all active:scale-[0.98] mt-2"
              style={{
                background: loading ? "rgba(235,9,21,0.55)" : "#eb0915",
                color: "#ffffff",
                cursor: loading ? "not-allowed" : "pointer",
                // Eliminates WebKit's 300ms tap-delay on iOS Safari so the
                // button responds instantly on first touch without double-tap.
                touchAction: "manipulation",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin"
                    width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                  </svg>
                  Đang đăng nhập...
                </span>
              ) : (
                "Đăng nhập"
              )}
            </button>

          </form>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs mt-5" style={{ color: "rgba(18,16,13,0.3)" }}>
          Diet Plan © {new Date().getFullYear()} · Phần mềm quản lý dinh dưỡng
        </p>

      </div>
    </div>
  );
}
