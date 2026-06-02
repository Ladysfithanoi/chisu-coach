// Biểu đồ đường cân nặng — SVG thuần, không phụ thuộc thư viện.

export interface ChartPoint {
  date: string; // YYYY-MM-DD (đã sắp xếp tăng dần)
  weightKg: number;
}

function fmtDay(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

export default function WeightChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center text-sm"
        style={{ border: "1px dashed rgba(18,16,13,0.15)", color: "rgba(18,16,13,0.4)" }}
      >
        Chưa có dữ liệu cân nặng để vẽ biểu đồ.
      </div>
    );
  }

  const W = 640, H = 260;
  const padL = 44, padR = 16, padT = 16, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const weights = points.map((p) => p.weightKg);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW;
  const pad = Math.max(0.4, range * 0.12);
  const lo = minW - pad;
  const hi = maxW + pad;

  const n = points.length;
  const x = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const y = (w: number) => padT + (1 - (w - lo) / (hi - lo)) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.weightKg).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(n - 1).toFixed(1)} ${padT + plotH} L ${x(0).toFixed(1)} ${padT + plotH} Z`;

  // 3 mốc trục Y
  const yTicks = [hi, (hi + lo) / 2, lo];
  // Nhãn trục X: tối đa ~6 mốc đều nhau
  const step = Math.max(1, Math.ceil(n / 6));
  const xLabelIdx = new Set<number>();
  for (let i = 0; i < n; i += step) xLabelIdx.add(i);
  xLabelIdx.add(n - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Biểu đồ cân nặng">
      {/* Lưới ngang + nhãn Y */}
      {yTicks.map((t, idx) => (
        <g key={idx}>
          <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} stroke="rgba(18,16,13,0.08)" strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="rgba(18,16,13,0.45)">
            {t.toFixed(1)}
          </text>
        </g>
      ))}

      {/* Vùng tô nhẹ dưới đường */}
      <path d={areaPath} fill="rgba(235,9,21,0.06)" />
      {/* Đường cân nặng */}
      <path d={linePath} fill="none" stroke="#eb0915" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Điểm + nhãn X */}
      {points.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.weightKg)} r={3} fill="#eb0915" />
          {xLabelIdx.has(i) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="rgba(18,16,13,0.45)">
              {fmtDay(p.date)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
