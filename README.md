# Chisu — Máy Tính Dinh Dưỡng

Ứng dụng Next.js 16 (App Router) tính toán dinh dưỡng chuyên sâu, lên thực đơn, có hệ thống đăng nhập + trang admin và tích hợp Gemini AI.

## Stack
- **Next.js 16** + React 19 + TypeScript
- **Tailwind CSS v4**
- **Prisma v7** + PostgreSQL (Supabase) qua adapter `@prisma/adapter-pg`
- **Auth**: JWT (jose) + bcryptjs, session cookie
- **AI**: Gemini API (xoay vòng nhiều key)

## Bắt đầu

### 1. Cài dependencies
```bash
npm install
```

### 2. Tạo project Supabase mới
Dashboard → Settings → Database → Connection string. Lấy 2 URL và điền vào `.env.local`:
- `DATABASE_URL` — pooler (port 6543), dùng cho runtime
- `DIRECT_URL` — direct connection (port 5432), dùng cho `prisma db push`/migrations

Đồng thời điền `GEMINI_API_KEYS` (lấy tại https://aistudio.google.com/app/apikey) và `JWT_SECRET`
(đã tạo sẵn 1 secret ngẫu nhiên trong `.env.local`).

### 3. Đẩy schema lên DB & tạo tài khoản admin
```bash
npx prisma db push    # tạo bảng theo prisma/schema.prisma
npm run seed          # tạo admin: admin@chisu.com / MatKhauAdmin123
```
> Đổi mật khẩu admin trong `prisma/seed.ts` trước khi seed nếu cần.

### 4. Chạy dev
```bash
npm run dev
```
Mở http://localhost:3000

## Deploy lên Vercel
1. Push code lên repo GitHub mới (xem phần Git bên dưới).
2. Import repo vào Vercel (tài khoản mới).
3. Thêm Environment Variables trên Vercel: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `GEMINI_API_KEYS`.
4. Build command mặc định `npm run build` đã bao gồm `prisma generate`.

## Git
Repo này đã được gỡ khỏi remote cũ. Để liên kết với repo GitHub mới:
```bash
git remote add origin <URL-repo-moi>
git push -u origin main
```

## Lưu ý bảo mật
- `.env*` đã được `.gitignore` — không commit secret.
- Khi deploy thật, đảm bảo `JWT_SECRET` là chuỗi ngẫu nhiên đủ mạnh (đã tạo sẵn).
