// Client-safe: đổi tham chiếu ảnh trong DB sang URL hiển thị.
// "drive:<id>" → endpoint proxy có kiểm tra quyền. Giá trị khác giữ nguyên.
export function photoSrc(photoUrl: string | null | undefined): string | null {
  if (!photoUrl) return null;
  if (photoUrl.startsWith("drive:")) return `/api/image/${photoUrl.slice(6)}`;
  return photoUrl;
}
