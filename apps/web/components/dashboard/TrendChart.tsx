'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useShop } from '@/lib/shop-context';
import { Download, Calendar, ChevronDown, TrendingUp, Eye, MousePointerClick } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────── */
type Metric = 'revenue' | 'views' | 'conversion';
type Period = '1d' | '30d' | '90d';

interface Point {
  date: string;
  label: string;
  value: number;
  prev_value: number;
}

/* ─── Period dropdown options ────────────────────────────── */
const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: '1d',  label: 'יום' },
  { key: '30d', label: '30 יום' },
  { key: '90d', label: 'חודשים' },
];

/* ─── Metric tabs ────────────────────────────────────────── */
const METRIC_TABS: { key: Metric; label: string }[] = [
  { key: 'revenue',    label: 'מכירות' },
  { key: 'views',      label: 'צפיות' },
  { key: 'conversion', label: 'המרות' },
];

/* ─── Format helpers ─────────────────────────────────────── */
function fmt(val: number, metric: Metric): string {
  if (metric === 'revenue') {
    if (val >= 1000) return `₪${(val / 1000).toFixed(1)}K`;
    return `₪${val.toLocaleString('he-IL', { minimumFractionDigits: 0 })}`;
  }
  if (metric === 'conversion') return `${val.toFixed(1)}%`;
  if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
  return `${val}`;
}

/* ─── Custom Tooltip ─────────────────────────────────────── */
function CustomTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null;
  const cur  = payload.find((p: any) => p.dataKey === 'value')?.value ?? 0;
  const avg  = payload.find((p: any) => p.dataKey === 'prev_value')?.value ?? 0;
  const pct  = avg > 0 ? ((cur - avg) / avg) * 100 : 0;
  const up   = pct >= 0;

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 min-w-[180px] text-right">
      <p className="text-xs text-gray-400 mb-3">{label}</p>

      {/* Current value */}
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${up ? 'text-[#006d43]' : 'text-red-500'}`}>
            {up ? '↑' : '↓'}{Math.abs(pct).toFixed(0)}%
          </span>
          <span className="w-2.5 h-2.5 rounded-full bg-[#006d43] flex-shrink-0" />
        </div>
        <span className="text-base font-black text-gray-800">{fmt(cur, metric)}</span>
      </div>

      {/* Average line */}
      {avg > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">(ממוצע)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0" />
          </div>
          <span className="text-sm font-semibold text-gray-500">{fmt(avg, metric)}</span>
        </div>
      )}
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────── */
function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 bg-gray-50/70 rounded-2xl px-5 py-4 flex-1">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={1.8} />
      </div>
      <div className="text-right flex-1">
        <p className="text-xs text-gray-400 mb-0.5">{label}</p>
        <p className="text-xl font-black text-gray-800">{value}</p>
      </div>
    </div>
  );
}

/* ─── Period Dropdown ────────────────────────────────────── */
function PeriodDropdown({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = PERIOD_OPTIONS.find(o => o.key === value)?.label ?? value;

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300 bg-white transition-colors"
      >
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        <span>{label}</span>
        <Calendar className="w-4 h-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false); }}
              className={`w-full text-right px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                value === opt.key ? 'font-bold text-[#006d43]' : 'text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Export helper ──────────────────────────────────────── */
function exportCSV(points: Point[], metric: Metric, period: Period) {
  const header = 'תאריך,ערך,ממוצע';
  const rows = points.map(p => `${p.label},${p.value},${p.prev_value}`);
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `profitly-${metric}-${period}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Main Component ─────────────────────────────────────── */
export function TrendChart() {
  const { selectedShopIds } = useShop();
  const [metric, setMetric]   = useState<Metric>('revenue');
  const [period, setPeriod]   = useState<Period>('30d');
  const [points, setPoints]   = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ metric, period });
      if (selectedShopIds.length > 0) params.set('shop_ids', selectedShopIds.join(','));
      const res = await fetch(`/api/analytics/timeseries?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPoints(data.points || []);
      } else {
        setPoints([]);
      }
    } catch {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [metric, period, selectedShopIds]);

  useEffect(() => { load(); }, [load]);

  /* KPI summary from current data */
  const totalValue = points.reduce((s, p) => s + p.value, 0);
  const avgValue   = points.length > 0 ? totalValue / points.length : 0;

  /* Tick interval so labels don't crowd */
  const tickInterval = period === '1d' ? 2 : period === '30d' ? 4 : 9;

  /* Y-axis formatter */
  const yFmt = (v: number) => {
    if (metric === 'revenue')    return v >= 1000 ? `₪${(v / 1000).toFixed(0)}k` : `₪${v}`;
    if (metric === 'conversion') return `${v}%`;
    return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`;
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      {/* ── Header row ── */}
      <div className="flex items-start justify-between mb-5">
        {/* RIGHT: title */}
        <div className="text-right">
          <h3 className="text-lg font-black text-gray-800">מגמה שבועית</h3>
          <p className="text-xs text-gray-400 mt-0.5">ניתוח ביצועים והשוואות מדדים בזמן אמת</p>
        </div>
        {/* LEFT: export button */}
        <button
          onClick={() => exportCSV(points, metric, period)}
          disabled={points.length === 0}
          className="flex items-center gap-2 bg-[#006d43] hover:bg-[#005836] text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40"
        >
          <span>ייצוא דוח</span>
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* ── Controls row: period + metric tabs ── */}
      <div className="flex items-center justify-between mb-5">
        {/* RIGHT: metric tabs */}
        <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
          {METRIC_TABS.map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                metric === m.key
                  ? 'bg-[#006d43] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {/* LEFT: period dropdown */}
        <PeriodDropdown value={period} onChange={setPeriod} />
      </div>

      {/* ── KPI summary cards ── */}
      <div className="flex gap-3 mb-6">
        <KpiCard
          icon={TrendingUp}
          iconBg="bg-green-50"
          iconColor="text-[#006d43]"
          label={metric === 'revenue' ? 'סה"כ מכירות' : metric === 'views' ? 'סה"כ צפיות' : 'ממוצע המרה'}
          value={fmt(totalValue, metric)}
        />
        <KpiCard
          icon={Eye}
          iconBg="bg-blue-50"
          iconColor="text-blue-400"
          label="ממוצע יומי"
          value={fmt(avgValue, metric)}
        />
        <KpiCard
          icon={MousePointerClick}
          iconBg="bg-red-50"
          iconColor="text-red-400"
          label="נתוני תקופה"
          value={`${points.length} נק'`}
        />
      </div>

      {/* ── Chart ── */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#006d43] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : points.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-300 gap-2">
          <TrendingUp className="w-10 h-10 opacity-30" />
          <p className="text-sm">אין נתונים לתקופה זו</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#006d43" floodOpacity="0.15" />
              </filter>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />

            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'inherit' }}
              axisLine={false}
              tickLine={false}
              interval={tickInterval}
              reversed={true}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af', fontFamily: 'inherit' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={yFmt}
              width={52}
            />

            <Tooltip
              content={<CustomTooltip metric={metric} />}
              cursor={{ stroke: '#006d43', strokeWidth: 1.5, strokeDasharray: '5 5' }}
            />

            {/* Average / previous period — dashed gray */}
            <Line
              type="monotone"
              dataKey="prev_value"
              stroke="#d1d5db"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              name="ממוצע"
            />

            {/* Current period — solid green with glow */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#006d43"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: '#fff', stroke: '#006d43', strokeWidth: 2.5 }}
              filter="url(#shadow)"
              name="ערך"
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* ── Legend ── */}
      {points.length > 0 && (
        <div className="flex items-center justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-[#006d43] rounded" />
            <span className="text-xs text-gray-500">
              {metric === 'revenue' ? 'מכירות' : metric === 'views' ? 'צפיות' : 'המרות'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 border-t-2 border-dashed border-gray-300 rounded" />
            <span className="text-xs text-gray-400">ממוצע / תקופה קודמת</span>
          </div>
        </div>
      )}
    </div>
  );
}
