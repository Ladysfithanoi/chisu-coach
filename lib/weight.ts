// Helper thuần cho theo dõi cân nặng — dùng chung cho giao diện học viên & PT.
// Ngày luôn ở dạng "YYYY-MM-DD" (theo UTC) để tránh lệch múi giờ.

export interface WeightPoint {
  date: string; // YYYY-MM-DD
  weightKg: number;
  note?: string | null;
}

export interface WeekAverage {
  weekStart: string; // YYYY-MM-DD (Thứ Hai)
  avg: number;
  count: number;
}

// Chuẩn hoá Date/chuỗi → "YYYY-MM-DD"
export function toDateStr(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// Thứ Hai (đầu tuần ISO) của tuần chứa ngày cho trước → "YYYY-MM-DD"
export function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00.000Z");
  const day = d.getUTCDay(); // 0 = CN, 1 = T2, ...
  const diff = (day + 6) % 7; // số ngày lùi về Thứ Hai
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

// Cộng n ngày vào "YYYY-MM-DD"
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 7 ngày (T2→CN) của tuần bắt đầu từ weekStart
export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// Trung bình mỗi tuần, sắp xếp tăng dần theo thời gian
export function weeklyAverages(points: WeightPoint[]): WeekAverage[] {
  const buckets = new Map<string, number[]>();
  for (const p of points) {
    const ws = weekStartOf(p.date);
    if (!buckets.has(ws)) buckets.set(ws, []);
    buckets.get(ws)!.push(p.weightKg);
  }
  return [...buckets.entries()]
    .map(([weekStart, vals]) => ({
      weekStart,
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      count: vals.length,
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
}

// So sánh 2 tuần gần nhất có dữ liệu: chênh lệch = tuần mới − tuần cũ
export function weekOverWeek(points: WeightPoint[]): {
  current: WeekAverage | null;
  previous: WeekAverage | null;
  delta: number | null;
} {
  const weeks = weeklyAverages(points);
  const current = weeks.length >= 1 ? weeks[weeks.length - 1] : null;
  const previous = weeks.length >= 2 ? weeks[weeks.length - 2] : null;
  const delta = current && previous ? Math.round((current.avg - previous.avg) * 10) / 10 : null;
  return { current, previous, delta };
}
