import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/jwt";

// Edge-compatible guard: JWT verification only (no DB — Prisma/pg doesn't run on edge).
// The DB session-match check (kicked detection) is enforced inside each API route and
// server component via lib/auth.ts.

const API_PREFIXES = [
  "/api/gemini",
  "/api/admin",
  "/api/pt",
  "/api/student",
  "/api/weight",
  "/api/foodlog",
  "/api/transform",
  "/api/upload",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Bypass: never intercept static assets — fixes missing CSS/JS on Safari/iPad
  if (
    pathname.startsWith("/_next/") ||
    pathname.includes("/static/") ||
    /\.(js|css|png|jpg|jpeg|svg|ico|woff|woff2|ttf)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const isApi = API_PREFIXES.some((p) => pathname.startsWith(p));

  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await verifySession(token);
    return NextResponse.next();
  } catch {
    if (isApi) {
      return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ" }, { status: 401 });
    }
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  }
}

export const config = {
  matcher: [
    // Protect main app pages
    "/",
    "/admin/:path*",
    "/pt/:path*",
    "/student/:path*",
    // Protect AI and role APIs
    "/api/gemini/:path*",
    "/api/admin/:path*",
    "/api/pt/:path*",
    "/api/student/:path*",
    "/api/weight/:path*",
    "/api/foodlog/:path*",
    "/api/transform/:path*",
    "/api/upload",
  ],
};
