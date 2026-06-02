import { cookies } from "next/headers";
import { verifySession, COOKIE_NAME } from "@/lib/jwt";
import prisma from "@/lib/prisma";

export type JWTPayload = { sub: string; email: string; role: string; sid: string };
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  currentSessionToken: string | null;
};

export type AuthResult =
  | { ok: true; session: JWTPayload; user: AuthUser }
  | { ok: false; kicked: boolean };

export async function getAuth(): Promise<AuthResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return { ok: false, kicked: false };

  let session: JWTPayload;
  try {
    session = await verifySession(token);
  } catch {
    return { ok: false, kicked: false };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, role: true, currentSessionToken: true },
  });

  if (!user) return { ok: false, kicked: false };

  if (user.currentSessionToken !== session.sid) {
    return { ok: false, kicked: true };
  }

  return { ok: true, session, user };
}

export const ROLES = {
  ADMIN: "ADMIN",
  PT: "PT",
  STUDENT: "STUDENT",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

async function getRoleAuth(role: Role): Promise<AuthResult> {
  const result = await getAuth();
  if (!result.ok) return result;
  if (result.session.role !== role) return { ok: false, kicked: false };
  return result;
}

export async function getAdminAuth(): Promise<AuthResult> {
  return getRoleAuth(ROLES.ADMIN);
}

export async function getPTAuth(): Promise<AuthResult> {
  return getRoleAuth(ROLES.PT);
}

export async function getStudentAuth(): Promise<AuthResult> {
  return getRoleAuth(ROLES.STUDENT);
}

// Xác định học viên mục tiêu cho thao tác đọc/ghi dữ liệu:
// - không truyền studentId (hoặc = chính mình) → chính mình
// - ADMIN → bất kỳ học viên nào
// - PT → chỉ học viên do mình quản lý
// Trả về { ok:false } nếu không có quyền.
export async function resolveStudentTarget(
  callerId: string,
  callerRole: string,
  studentId: string | null | undefined
): Promise<{ ok: true; id: string } | { ok: false }> {
  if (!studentId || studentId === callerId) return { ok: true, id: callerId };
  if (callerRole === ROLES.ADMIN) return { ok: true, id: studentId };
  if (callerRole === ROLES.PT) {
    const owned = await prisma.user.findFirst({
      where: { id: studentId, ptId: callerId, role: ROLES.STUDENT },
      select: { id: true },
    });
    return owned ? { ok: true, id: studentId } : { ok: false };
  }
  return { ok: false };
}
