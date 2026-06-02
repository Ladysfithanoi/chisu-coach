import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "dp-session";
const EXPIRY = "7d";

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ?? "chisu-fallback-secret-change-me"
  );
}

export { COOKIE_NAME };

export async function signSession(payload: {
  sub: string;
  email: string;
  role: string;
  sid: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(secret());
}

export async function verifySession(
  token: string
): Promise<{ sub: string; email: string; role: string; sid: string }> {
  const { payload } = await jwtVerify(token, secret(), {
    algorithms: ["HS256"],
  });
  return payload as { sub: string; email: string; role: string; sid: string };
}
