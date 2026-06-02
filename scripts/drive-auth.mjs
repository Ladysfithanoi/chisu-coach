// Lấy GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_FOLDER_ID cho khách (chạy 1 lần).
//
// Chuẩn bị trên Google Cloud Console (tài khoản của khách):
//   1. Tạo project, bật "Google Drive API".
//   2. OAuth consent screen: External, thêm email khách vào Test users.
//   3. Credentials → OAuth client ID → loại "Web application".
//      Thêm Authorized redirect URI:  http://localhost:53682/
//      Lấy Client ID + Client Secret.
//
// Chạy:
//   node scripts/drive-auth.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// Script sẽ in 1 đường link → mở bằng trình duyệt đang đăng nhập tài khoản khách,
// bấm Đồng ý. Sau đó script tự tạo folder "Chisu Photos" và in ra các biến môi
// trường để dán vào .env.local.

import http from "node:http";

const CLIENT_ID = process.argv[2] || process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.argv[3] || process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/`;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Thiếu tham số. Dùng: node scripts/drive-auth.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // ép trả refresh_token kể cả khi đã từng cấp quyền
  });

console.log("\n1) Mở đường link sau bằng trình duyệt đang đăng nhập tài khoản Google của khách:\n");
console.log(authUrl + "\n");
console.log("2) Bấm Đồng ý. Trình duyệt sẽ tự quay về localhost và script chạy tiếp...\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Thiếu code");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<h2>Xong! Quay lại cửa sổ terminal để lấy thông tin.</h2>");
  server.close();

  try {
    const tokens = await exchangeCode(code);
    const folderId = await createFolder(tokens.access_token);

    console.log("\n===== DÁN VÀO .env.local =====\n");
    console.log(`GOOGLE_DRIVE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GOOGLE_DRIVE_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GOOGLE_DRIVE_FOLDER_ID=${folderId}`);
    console.log("\n==============================\n");
    if (!tokens.refresh_token) {
      console.warn(
        "CẢNH BÁO: Không nhận được refresh_token. Vào https://myaccount.google.com/permissions " +
          "gỡ quyền của app rồi chạy lại script.\n"
      );
    }
    process.exit(0);
  } catch (err) {
    console.error("Lỗi:", err);
    process.exit(1);
  }
});

server.listen(PORT);

async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Đổi code thất bại (HTTP ${res.status}): ${await res.text()}`);
  return res.json();
}

async function createFolder(accessToken) {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Chisu Photos", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!res.ok) throw new Error(`Tạo folder thất bại (HTTP ${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.id;
}
