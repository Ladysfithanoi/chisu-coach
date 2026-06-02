// Google Drive client dùng chung — upload/tải/xoá ảnh qua REST API bằng fetch
// (không thêm dependency `googleapis`, theo cùng phong cách với lib/gemini.ts).
//
// Cơ chế: OAuth của CHÍNH tài khoản khách. App giữ refresh_token, đổi lấy
// access_token ngắn hạn khi cần. Mọi ảnh thuộc sở hữu khách, nằm trong 1 folder
// riêng (GOOGLE_DRIVE_FOLDER_ID) trong Drive của họ → tính vào 15GB của họ.

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

function assertConfigured(): void {
  const missing = [
    !CLIENT_ID && "GOOGLE_DRIVE_CLIENT_ID",
    !CLIENT_SECRET && "GOOGLE_DRIVE_CLIENT_SECRET",
    !REFRESH_TOKEN && "GOOGLE_DRIVE_REFRESH_TOKEN",
    !FOLDER_ID && "GOOGLE_DRIVE_FOLDER_ID",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Chưa cấu hình Google Drive trong .env.local: ${missing.join(", ")}`);
  }
}

// Cache access_token theo TTL để không phải refresh mỗi request.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  assertConfigured();
  // Còn hạn (chừa 60s biên an toàn) thì dùng lại.
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.value;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      refresh_token: REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Lấy access_token Drive thất bại (HTTP ${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google không trả về access_token");

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

// Upload 1 ảnh vào folder của khách. Trả về fileId của Drive.
export async function uploadToDrive(bytes: Uint8Array, mimeType: string, name: string): Promise<string> {
  const token = await getAccessToken();

  const boundary = `chisu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, parents: [FOLDER_ID] });

  // multipart/related: phần JSON metadata + phần media nhị phân.
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Uint8Array([
    ...new TextEncoder().encode(head),
    ...bytes,
    ...new TextEncoder().encode(tail),
  ]);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Upload Drive thất bại (HTTP ${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("Drive không trả về fileId");
  return data.id;
}

// Tải bytes 1 ảnh từ Drive (dùng cho endpoint proxy serve ảnh).
export async function downloadFromDrive(fileId: string): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Tải ảnh từ Drive thất bại (HTTP ${res.status})`);
  }
  return {
    bytes: await res.arrayBuffer(),
    mimeType: res.headers.get("Content-Type") || "application/octet-stream",
  };
}

// Xoá ảnh trên Drive (gọi khi xoá log/transform để không rác chiếm dung lượng).
// Nuốt lỗi: xoá rác là best-effort, không nên làm hỏng thao tác xoá bản ghi DB.
export async function deleteFromDrive(fileId: string): Promise<void> {
  try {
    const token = await getAccessToken();
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[drive delete]", fileId, err);
  }
}

// photoUrl trong DB lưu dạng "drive:<fileId>". 2 helper dưới để mã hoá/giải mã.
const DRIVE_PREFIX = "drive:";
export function toPhotoRef(fileId: string): string {
  return DRIVE_PREFIX + fileId;
}
export function parseDriveFileId(photoUrl: string | null | undefined): string | null {
  if (!photoUrl || !photoUrl.startsWith(DRIVE_PREFIX)) return null;
  const id = photoUrl.slice(DRIVE_PREFIX.length).trim();
  return id || null;
}
