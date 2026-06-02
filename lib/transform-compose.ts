// Ghép 2 ảnh Trước/Sau thành 1 ảnh transform (chạy phía client trên canvas).
// Bố cục ngang: 2 panel cạnh nhau, mỗi panel có nhãn + số cân; badge chênh lệch ở giữa.

const PANEL_W = 720;
const PANEL_H = 960; // tỉ lệ 3:4 hợp ảnh toàn thân
const BRAND = "#eb0915";

export type Side = { base64: string; mimeType: string; weight?: string };

export async function composeBeforeAfter(before: Side, after: Side): Promise<{ base64: string; mimeType: string }> {
  const [imgB, imgA] = await Promise.all([loadImage(before), loadImage(after)]);

  const canvas = document.createElement("canvas");
  canvas.width = PANEL_W * 2;
  canvas.height = PANEL_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không khởi tạo được canvas");

  ctx.fillStyle = "#12100d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawCover(ctx, imgB, 0, 0, PANEL_W, PANEL_H);
  drawCover(ctx, imgA, PANEL_W, 0, PANEL_W, PANEL_H);

  // Vạch ngăn giữa 2 ảnh
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(PANEL_W - 3, 0, 6, PANEL_H);

  drawLabel(ctx, 0, "TRƯỚC", before.weight);
  drawLabel(ctx, PANEL_W, "SAU", after.weight);

  drawDeltaBadge(ctx, before.weight, after.weight);

  return { base64: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], mimeType: "image/jpeg" };
}

// Vẽ ảnh phủ kín panel (cover, cắt phần thừa) để 2 bên cao bằng nhau.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

// Dải gradient tối ở đáy + nhãn (TRƯỚC/SAU) và số cân.
function drawLabel(ctx: CanvasRenderingContext2D, x: number, label: string, weight?: string) {
  const bandH = 240;
  const grad = ctx.createLinearGradient(0, PANEL_H - bandH, 0, PANEL_H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.78)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, PANEL_H - bandH, PANEL_W, bandH);

  const cx = x + PANEL_W / 2;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 64px Arial, sans-serif";
  const kg = parseWeight(weight);
  ctx.fillText(label, cx, PANEL_H - (kg != null ? 96 : 56));
  if (kg != null) {
    ctx.font = "600 52px Arial, sans-serif";
    ctx.fillText(`${fmtKg(kg)} kg`, cx, PANEL_H - 40);
  }
}

// Badge chênh lệch cân ở chính giữa đáy (vd "−8 KG").
function drawDeltaBadge(ctx: CanvasRenderingContext2D, wb?: string, wa?: string) {
  const b = parseWeight(wb);
  const a = parseWeight(wa);
  if (b == null || a == null) return;
  const diff = a - b;
  if (diff === 0) return;

  const text = `${diff < 0 ? "−" : "+"}${fmtKg(Math.abs(diff))} KG`;
  ctx.font = "800 56px Arial, sans-serif";
  const padX = 44;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 96;
  const cx = PANEL_W; // tâm = đường ngăn giữa
  const y = PANEL_H - 150;

  ctx.fillStyle = diff < 0 ? BRAND : "#12100d";
  roundRect(ctx, cx - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, y + 4);
  ctx.textBaseline = "alphabetic";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function parseWeight(s?: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmtKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function loadImage(side: Side): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Không tải được ảnh"));
    img.src = `data:${side.mimeType};base64,${side.base64}`;
  });
}
