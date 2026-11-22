import React, { useId } from 'react';
import { TrendingUp } from 'lucide-react';
import { sparklinePoints, type LabTrend } from './labTrend';

const W = 160;
const H = 48;

function fmt(n: number): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

const Sparkline: React.FC<{ trend: LabTrend }> = ({ trend }) => {
  const pts = sparklinePoints(trend.points.map((p) => p.value), W, H);
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false" className="shrink-0">
      <polyline
        fill="none"
        stroke="#0B3D91"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
      />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 3.5 : 2} fill={i === pts.length - 1 ? '#0B3D91' : '#64748b'} />
      ))}
      {last && <circle cx={last[0]} cy={last[1]} r={6} fill="#0B3D91" fillOpacity={0.15} />}
    </svg>
  );
};

const TrendRow: React.FC<{ trend: LabTrend }> = ({ trend }) => {
  const tableId = useId();
  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];
  const delta = last.value - first.value;
  const direction = delta > 0 ? 'naik' : delta < 0 ? 'turun' : 'tetap';
  const unit = trend.unit ? ` ${trend.unit}` : '';
  const summary = `${trend.name}: ${trend.points.length} hasil, terakhir ${fmt(last.value)}${unit}, ${direction} dibanding hasil pertama (${fmt(first.value)}${unit}).`;
  return (
    <li className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{trend.name}</p>
          <p className="text-sm text-slate-700">
            Terakhir <span className="font-mono font-bold">{fmt(last.value)}</span>
            {unit} · {direction}
          </p>
          <p className="sr-only">{summary}</p>
        </div>
        <Sparkline trend={trend} />
      </div>
      <details>
        <summary className="text-sm font-bold text-[#0B3D91] cursor-pointer min-h-[44px] flex items-center">
          Lihat tabel nilai
        </summary>
        <table id={tableId} className="w-full text-sm mt-1">
          <caption className="sr-only">Nilai {trend.name} per tanggal</caption>
          <thead>
            <tr className="text-left text-slate-600">
              <th scope="col" className="py-1 font-semibold">Tanggal</th>
              <th scope="col" className="py-1 font-semibold text-right">Nilai{unit && ` (${trend.unit})`}</th>
            </tr>
          </thead>
          <tbody>
            {trend.points.map((p) => (
              <tr key={p.resultId} className="border-t border-slate-200">
                <td className="py-1.5 font-mono">{p.dateLabel || '—'}</td>
                <td className="py-1.5 font-mono text-right">{fmt(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </li>
  );
};

/** Tren nilai lab numerik (≥ 2 hasil per parameter). Tidak dirender bila tidak ada tren. */
export const LabTrendCard: React.FC<{ trends: LabTrend[] }> = ({ trends }) => {
  if (trends.length === 0) return null;
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" aria-labelledby="lab-trend-heading">
      <h3 id="lab-trend-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
        Tren Hasil Lab
      </h3>
      <p className="text-sm text-slate-600">
        Disusun otomatis dari nilai yang tertulis pada hasil Anda. Diskusikan arti perubahan dengan dokter.
      </p>
      <ul className="space-y-2">
        {trends.map((t) => (
          <TrendRow key={t.key} trend={t} />
        ))}
      </ul>
    </section>
  );
};
