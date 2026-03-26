'use client';

/**
 * TrendChart — Interactive sales/orders area chart for the owner dashboard.
 * Uses Recharts. Matches the Hebrew mockup design exactly.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useShop } from '@/lib/shop-context';

type Metric = 'revenue' | 'orders';
type Period = '1d' | '7d' | '30d' | '90d';

interface Point {
  date: string;
  label: string;
  value: number;
  prev_value: number;
}

const METRIC_TABS: { key: Metric; label: string }[] = [
  { key: 'revenue', label: 'מכירות' },
  { key: 'orders',  label: 'צפיות' },
];

const PERIOD_TABS: { key: Period; label: string }[] = [
  { key: '1d',  label: 'יום' },
  { key: '30d', label: '30 יום' },
  { key: '90d', label: 'חודשים' },
];

// Custom tooltip matching the mockup
function CustomTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null;
  const cur  = payload[0]?.value ?? 0;
  const prev = payload[1]?.value ?? 0;
  const diff = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
  const sign = diff >= 0 ? '+' : '';

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-4 min-w-[160px]">
      <p className="text-xs text-gray-400 mb-2 text-right">{label}</p>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl font-black text-gray-800">
          {metric === 'revenue'
            ? `₪${cur.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            : cur}
        </span>
        <span className="w-2.5 h-2.5 rounded-full bg-[#006d43] flex-shrink-0" />
      </div>
      {prev > 0 && (
        <p className={`text-xs font-semibold ${diff >= 0 ? 'text-[#006d43]' : 'text-red-500'}`}>
          {sign}{diff.toFixed(0)}% מהשבוע שעבר
        </p>
      )}
    </div>
  );
}

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
      if (selectedShopIds.length > 0) {
        params.set('shop_ids', selectedShopIds.join(','));
      }
      const res = await fetch(`/api/analytics/timeseries?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPoints(data.points || []);
      }
    } catch {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [metric, period, selectedShopIds]);

  useEffect(() => { load(); }, [load]);

  // Show only every Nth label to avoid crowding
  const tickInterval = period === '1d' ? 2 : period === '7d' ? 0 : period === '30d' ? 4 : 9;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      {/* Header — RTL: first=RIGHT */}
      <div className="flex items-start justify-between mb-4">
        {/* RIGHT: title + subtitle */}
        <div className="text-right">
          <h3 className="text-lg font-black text-gray-800">מגמה שבועית</h3>
          <p className="text-xs text-gray-400 mt-0.5">ניתוח ביצועי החנות בזמן אמת</p>
        </div>
        {/* LEFT: empty or controls placeholder */}
      </div>

      {/* Controls row — metric tabs + period buttons */}
      {/* RTL: first=RIGHT = period buttons, last=LEFT = metric tabs */}
      <div className="flex items-center justify-between mb-6">
        {/* RIGHT: period buttons */}
        <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
          {PERIOD_TABS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                period === p.key
                  ? 'bg-[#006d43] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* LEFT: metric tabs */}
        <div className="flex items-center gap-1">
          {METRIC_TABS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-4 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
                metric === m.key
                  ? 'bg-white border-[#006d43] text-[#006d43] shadow-sm'
                  : 'bg-transparent border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="flex items-center justify-center h-56">
          <div className="w-8 h-8 border-2 border-[#006d43] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center h-56 text-gray-300 text-sm">
          אין נתונים לתקופה זו
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={points} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#006d43" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#006d43" stopOpacity={0.01} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#f0f0f0"
            />

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
              tickFormatter={(v) =>
                metric === 'revenue'
                  ? v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
                  : `${v}`
              }
              width={40}
            />

            <Tooltip
              content={<CustomTooltip metric={metric} />}
              cursor={{ stroke: '#006d43', strokeWidth: 1, strokeDasharray: '4 4' }}
            />

            {/* Previous period — dashed grey line */}
            <Area
              type="monotone"
              dataKey="prev_value"
              stroke="#d1d5db"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="none"
              dot={false}
              activeDot={false}
            />

            {/* Current period — solid green area */}
            <Area
              type="monotone"
              dataKey="value"
              stroke="#006d43"
              strokeWidth={2.5}
              fill="url(#colorValue)"
              dot={false}
              activeDot={{
                r: 5,
                fill: '#ffffff',
                stroke: '#006d43',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
