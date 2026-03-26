'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type DateRangeKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'this_month'
  | 'this_year'
  | 'last_year'
  | 'all_time';

export interface DateRange {
  key: DateRangeKey;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

const PRESETS: { key: DateRangeKey; label: string }[] = [
  { key: 'today',      label: 'היום' },
  { key: 'yesterday',  label: 'אתמול' },
  { key: 'last7',      label: '7 ימים אחרונים' },
  { key: 'last30',     label: '30 ימים אחרונים' },
  { key: 'this_month', label: 'החודש הנוכחי' },
  { key: 'this_year',  label: 'השנה הנוכחית' },
  { key: 'last_year',  label: 'שנה שעברה' },
  { key: 'all_time',   label: 'כל הזמנים' },
];

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeRange(key: DateRangeKey): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start: Date;
  let end: Date = new Date(today);

  switch (key) {
    case 'today':
      start = new Date(today);
      break;
    case 'yesterday':
      start = new Date(today);
      start.setDate(start.getDate() - 1);
      end = new Date(start);
      break;
    case 'last7':
      start = new Date(today);
      start.setDate(start.getDate() - 6);
      break;
    case 'last30':
      start = new Date(today);
      start.setDate(start.getDate() - 29);
      break;
    case 'this_month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'this_year':
      start = new Date(today.getFullYear(), 0, 1);
      break;
    case 'last_year':
      start = new Date(today.getFullYear() - 1, 0, 1);
      end = new Date(today.getFullYear() - 1, 11, 31);
      break;
    case 'all_time':
      start = new Date(2010, 0, 1); // far past
      break;
    default:
      start = new Date(today);
      start.setDate(start.getDate() - 29);
  }

  return { key, startDate: toISO(start), endDate: toISO(end) };
}

function getLabelForKey(key: DateRangeKey): string {
  return PRESETS.find(p => p.key === key)?.label ?? key;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export default function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(key: DateRangeKey) {
    onChange(computeRange(key));
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 flex items-center gap-3 hover:border-gray-300 transition-colors min-w-[160px]"
      >
        <div className="text-right flex-1">
          <p className="text-xs text-gray-400 mb-0.5">טווח זמן</p>
          <p className="text-sm font-bold text-gray-700">{getLabelForKey(value.key)}</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden z-50">
          {PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => select(preset.key)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-right hover:bg-gray-50 transition-colors"
            >
              <span className={value.key === preset.key ? 'font-bold text-[#006d43]' : 'text-gray-700'}>
                {preset.label}
              </span>
              {value.key === preset.key && (
                <Check className="w-4 h-4 text-[#006d43] flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
