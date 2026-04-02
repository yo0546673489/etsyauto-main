'use client';

import { useState, useEffect, useCallback } from 'react';
import { useShop } from '@/lib/shop-context';
import { useToast } from '@/lib/toast-context';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { discountsApi, type DiscountRule, type DiscountTask } from '@/lib/api';
import {
  Tag, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Clock, Loader2, RefreshCw, Zap,
} from 'lucide-react';

function cn(...cls: (string | boolean | undefined | null)[]) {
  return cls.filter(Boolean).join(' ');
}

// ─── Status configs ──────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  active:    { label: 'פעיל',    bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  paused:    { label: 'מושהה',   bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  draft:     { label: 'טיוטה',   bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400' },
  completed: { label: 'הסתיים',  bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
};

const taskStatusIcon: Record<string, string> = {
  pending:     '🕐',
  in_progress: '⚙️',
  completed:   '✅',
  failed:      '❌',
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.draft;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.bg, cfg.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ─── Rule Card ────────────────────────────────────────────────────────────────

function RuleCard({ rule, onToggle, onEdit, onDelete, onTriggerRotation }: {
  rule: DiscountRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTriggerRotation?: () => void;
}) {
  const scopeLabel = rule.scope === 'entire_shop' ? 'כל החנות'
    : rule.scope === 'specific_listings' ? `${rule.listing_ids?.length || 0} מוצרים נבחרים`
    : 'קטגוריה';

  const valueLabel = rule.auto_rotate
    ? `${rule.auto_min_percent ?? 20}–${rule.auto_max_percent ?? 30}% הנחה (אוטומטי)`
    : rule.discount_type === 'percentage'
      ? `${rule.discount_value}% הנחה`
      : `$${rule.discount_value} הנחה`;

  // תרגום שם ל-עברית
  const hebrewName = rule.name
    ?.replace(/shop-wide sale/gi, 'מבצע כלל-חנותי')
    ?.replace(/sale/gi, 'מבצע')
    ?.replace(/discount/gi, 'הנחה')
    || rule.name;

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className="font-semibold text-gray-800 text-base">{hebrewName}</h3>
            <StatusBadge status={rule.status} />
            {rule.auto_rotate ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                <Zap className="w-3 h-3" />
                אוטומטי{rule.last_discount_percent ? ` — ${rule.last_discount_percent}%` : ''}
                {rule.next_rotation_at ? ` (עד ${new Date(rule.next_rotation_at).toLocaleDateString('he-IL')})` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                ידני
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-1">{valueLabel} • {scopeLabel}</p>
          {!rule.auto_rotate && rule.start_date && (
            <p className="text-xs text-gray-400">
              תזמון: {new Date(rule.start_date).toLocaleDateString('he-IL')}
              {rule.end_date ? ` – ${new Date(rule.end_date).toLocaleDateString('he-IL')}` : ''}
            </p>
          )}
          {rule.auto_rotate && rule.auto_interval_days && (
            <p className="text-xs text-gray-400">
              החלפה כל {rule.auto_interval_days} ימים
            </p>
          )}
          {rule.etsy_sale_name && (
            <p className="text-xs text-gray-400 mt-0.5">שם ב-Etsy: {rule.etsy_sale_name.replace(/shop-wide sale/gi, 'מבצע כלל-חנותי').replace(/sale/gi, 'מבצע')}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rule.auto_rotate && onTriggerRotation && (
            <button
              onClick={onTriggerRotation}
              className="p-2 text-purple-400 hover:text-purple-600 transition-colors rounded-lg hover:bg-purple-50"
              title="הפעל סבב הנחה עכשיו"
            >
              <Zap className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onToggle}
            className={cn('transition-colors', rule.is_active ? 'text-[#006d43]' : 'text-gray-300')}
            title={rule.is_active ? 'כבה' : 'הפעל'}
          >
            {rule.is_active
              ? <ToggleRight className="w-8 h-8" />
              : <ToggleLeft className="w-8 h-8" />
            }
          </button>
          <button onClick={onEdit} className="p-2 text-gray-400 hover:text-[#006d43] transition-colors rounded-lg hover:bg-gray-50">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal form ───────────────────────────────────────────────────────────────

function DiscountModal({ initial, onClose, onSave }: {
  initial?: DiscountRule;
  onClose: () => void;
  onSave: (data: Partial<DiscountRule>, activate: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initial?.name || '');
  // auto/manual toggle
  const [autoRotate, setAutoRotate] = useState(initial?.auto_rotate || false);
  const [autoMinPercent, setAutoMinPercent] = useState(initial?.auto_min_percent?.toString() || '20');
  const [autoMaxPercent, setAutoMaxPercent] = useState(initial?.auto_max_percent?.toString() || '30');
  const [autoIntervalDays, setAutoIntervalDays] = useState(initial?.auto_interval_days?.toString() || '2');
  // manual fields
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed_amount'>(initial?.discount_type || 'percentage');
  const [discountValue, setDiscountValue] = useState(initial?.discount_value?.toString() || '');
  const [scope, setScope] = useState<'entire_shop' | 'specific_listings'>(
    (initial?.scope as any) || 'entire_shop'
  );
  const [startDate, setStartDate] = useState(initial?.start_date ? initial.start_date.slice(0,10) : '');
  const [endDate, setEndDate] = useState(initial?.end_date ? initial.end_date.slice(0,10) : '');
  const [targetCountry, setTargetCountry] = useState(initial?.target_country || 'everywhere');
  const [termsText, setTermsText] = useState(initial?.terms_text || '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'שם הכלל נדרש';
    if (autoRotate) {
      const min = Number(autoMinPercent), max = Number(autoMaxPercent), interval = Number(autoIntervalDays);
      if (!autoMinPercent || isNaN(min) || min < 5) e.autoMin = 'מינימום 5%';
      if (!autoMaxPercent || isNaN(max) || max > 75) e.autoMax = 'מקסימום 75%';
      if (min >= max) e.autoMax = 'מקסימום חייב להיות גדול ממינימום';
      if (!autoIntervalDays || isNaN(interval) || interval < 1) e.autoInterval = 'לפחות יום אחד';
      if (interval > 30) e.autoInterval = 'מקסימום 30 ימים';
    } else {
      if (!discountValue || isNaN(Number(discountValue)) || Number(discountValue) <= 0) e.discountValue = 'ערך הנחה חייב להיות מספר חיובי';
      if (discountType === 'percentage' && Number(discountValue) > 75) e.discountValue = 'מקסימום 75% ב-Etsy';
      if (!startDate) e.startDate = 'תאריך התחלה נדרש';
      if (!endDate) e.endDate = 'תאריך סיום נדרש';
      if (startDate && endDate) {
        const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
        if (diff > 30) e.endDate = 'מקסימום 30 יום (מגבלת Etsy)';
        if (diff < 0) e.endDate = 'תאריך סיום חייב להיות אחרי ההתחלה';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = (activate: boolean): Partial<DiscountRule> => ({
    name: name.trim(),
    discount_type: discountType,
    discount_value: autoRotate ? Number(autoMinPercent) : Number(discountValue),
    scope,
    is_scheduled: !autoRotate,
    start_date: !autoRotate ? startDate : undefined,
    end_date: !autoRotate ? endDate : undefined,
    target_country: targetCountry,
    terms_text: termsText || undefined,
    status: activate ? 'active' : 'draft',
    is_active: activate,
    // auto-rotation fields
    auto_rotate: autoRotate,
    auto_min_percent: autoRotate ? Number(autoMinPercent) : undefined,
    auto_max_percent: autoRotate ? Number(autoMaxPercent) : undefined,
    auto_interval_days: autoRotate ? Number(autoIntervalDays) : undefined,
  });

  const handleSubmit = async (activate: boolean) => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(buildPayload(activate), activate);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-800">{initial ? 'עריכת הנחה' : 'הנחה חדשה'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-6">
          {/* ─── Toggle אוטומטי / ידני ─── */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">מצב ניהול הנחה</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAutoRotate(false)}
                className={cn(
                  'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border-2 transition-colors',
                  !autoRotate
                    ? 'border-[#006d43] bg-[#006d43] text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                ידני
              </button>
              <button
                type="button"
                onClick={() => setAutoRotate(true)}
                className={cn(
                  'flex-1 py-2.5 px-4 rounded-lg text-sm font-medium border-2 transition-colors flex items-center justify-center gap-2',
                  autoRotate
                    ? 'border-purple-600 bg-purple-600 text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}
              >
                <Zap className="w-4 h-4" />
                אוטומטי
              </button>
            </div>
          </div>

          {/* שם הכלל */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם הכלל (פנימי)</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className={cn('w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006d43]', errors.name ? 'border-red-300' : 'border-gray-200')}
              placeholder="לדוגמה: הנחת קיץ 2026" />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          {/* ─── מצב אוטומטי ─── */}
          {autoRotate && (
            <div className="space-y-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="text-sm font-medium text-purple-700 flex items-center gap-2">
                <Zap className="w-4 h-4" /> הגדרות מצב אוטומטי
              </p>
              <div className="flex gap-4 flex-wrap items-end">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">הנחה מינימום (%)</label>
                  <input type="number" min="5" max="74" value={autoMinPercent}
                    onChange={e => setAutoMinPercent(e.target.value)}
                    className={cn('w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400', errors.autoMin ? 'border-red-300' : 'border-gray-200')} />
                  {errors.autoMin && <p className="text-xs text-red-500 mt-1">{errors.autoMin}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">הנחה מקסימום (%)</label>
                  <input type="number" min="6" max="75" value={autoMaxPercent}
                    onChange={e => setAutoMaxPercent(e.target.value)}
                    className={cn('w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400', errors.autoMax ? 'border-red-300' : 'border-gray-200')} />
                  {errors.autoMax && <p className="text-xs text-red-500 mt-1">{errors.autoMax}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">החלפה כל (ימים)</label>
                  <input type="number" min="1" max="30" value={autoIntervalDays}
                    onChange={e => setAutoIntervalDays(e.target.value)}
                    className={cn('w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400', errors.autoInterval ? 'border-red-300' : 'border-gray-200')} />
                  {errors.autoInterval && <p className="text-xs text-red-500 mt-1">{errors.autoInterval}</p>}
                </div>
              </div>
              <p className="text-xs text-purple-600">
                שם המבצע ב-Etsy נוצר אוטומטית • תאריכים מחושבים אוטומטית
              </p>
            </div>
          )}

          {/* ─── מצב ידני ─── */}
          {!autoRotate && (
            <>
              {/* סוג הנחה */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">סוג הנחה</label>
                <div className="flex gap-4">
                  {(['percentage', 'fixed_amount'] as const).map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={discountType === t} onChange={() => setDiscountType(t)} className="accent-[#006d43]" />
                      <span className="text-sm">{t === 'percentage' ? 'אחוזים (%)' : 'סכום קבוע ($)'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* ערך הנחה */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ערך ההנחה {discountType === 'percentage' ? '(%)' : '($)'}
                </label>
                <input type="number" min="0" max={discountType === 'percentage' ? 75 : undefined}
                  value={discountValue} onChange={e => setDiscountValue(e.target.value)}
                  className={cn('w-32 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006d43]', errors.discountValue ? 'border-red-300' : 'border-gray-200')} />
                {errors.discountValue && <p className="text-xs text-red-500 mt-1">{errors.discountValue}</p>}
                {discountType === 'percentage' && discountValue && (
                  <p className="text-xs text-[#006d43] mt-2 font-medium">
                    מחיר מקורי: $100 → אחרי הנחה: ${(100 - Number(discountValue)).toFixed(0)}
                  </p>
                )}
              </div>

              {/* תאריכים — חובה תמיד */}
              <div className="flex gap-4 flex-wrap">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">תאריך התחלה <span className="text-red-500">*</span></label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className={cn('px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006d43]', errors.startDate ? 'border-red-300' : 'border-gray-200')} />
                  {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">תאריך סיום <span className="text-red-500">*</span></label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className={cn('px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006d43]', errors.endDate ? 'border-red-300' : 'border-gray-200')} />
                  {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
                </div>
              </div>
              <p className="text-xs text-amber-600 font-medium">⚠️ Etsy מגביל מכירה ל-30 יום מקסימום</p>
            </>
          )}

          {/* איפה ההנחה תקפה */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">איפה ההנחה תקפה</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={targetCountry === 'everywhere'} onChange={() => setTargetCountry('everywhere')} className="accent-[#006d43]" />
                <span className="text-sm">בכל מקום (Everywhere)</span>
              </label>
            </div>
          </div>

          {/* היקף */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">היקף ההנחה</label>
            <div className="flex gap-4">
              {(['entire_shop', 'specific_listings'] as const).map(s => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={scope === s} onChange={() => setScope(s)} className="accent-[#006d43]" />
                  <span className="text-sm">{s === 'entire_shop' ? 'כל החנות' : 'מוצרים ספציפיים'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* תנאים */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              תנאים והגבלות (אופציונלי)
            </label>
            <textarea value={termsText} onChange={e => setTermsText(e.target.value)} rows={2} maxLength={500}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#006d43] resize-none"
              placeholder="תנאי השימוש שיוצגו ב-Etsy..." />
            <p className="text-xs text-gray-400 text-left">{termsText.length}/500</p>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            ביטול
          </button>
          <div className="flex gap-3">
            <button onClick={() => handleSubmit(false)} disabled={saving}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin inline ml-1" /> : null}
              שמור כטיוטה
            </button>
            <button onClick={() => handleSubmit(true)} disabled={saving}
              className="px-4 py-2 text-sm bg-[#006d43] text-white rounded-lg hover:bg-[#005535] transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin inline ml-1" /> : null}
              שמור והפעל
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',       label: 'כל הכללים' },
  { key: 'active',    label: 'פעילים' },
  { key: 'draft',     label: 'טיוטות' },
  { key: 'paused',    label: 'מושהים' },
  { key: 'history',   label: 'היסטוריית ביצועים' },
];

function shopSortKey(name: string) {
  const m = name.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export default function DiscountsPage() {
  const { shops, selectedShop, selectedShops } = useShop();
  const { showToast } = useToast();

  const [tab, setTab] = useState('all');
  // map: shopId → rules
  const [rulesByShop, setRulesByShop] = useState<Record<number, DiscountRule[]>>({});
  const [tasks, setTasks] = useState<DiscountTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<DiscountRule | undefined>();

  const shopId = selectedShop?.id;

  // חנויות נבחרות, ממוינות לפי מספר
  const visibleShops = [...(selectedShops.length > 0 ? selectedShops : shops)]
    .sort((a, b) => shopSortKey(a.display_name) - shopSortKey(b.display_name));

  const loadData = useCallback(async () => {
    if (!shops.length) { setLoading(false); return; }
    setLoading(true);
    try {
      // טען הנחות לכל החנויות במקביל
      const results = await Promise.all(
        shops.map(s => discountsApi.getRules(s.id).then(r => ({ shopId: s.id, rules: r })).catch(() => ({ shopId: s.id, rules: [] as DiscountRule[] })))
      );
      const map: Record<number, DiscountRule[]> = {};
      for (const { shopId: sid, rules } of results) map[sid] = rules;
      setRulesByShop(map);

      // טען tasks רק לחנות הנבחרת (היסטוריה)
      if (shopId) {
        const tasksData = await discountsApi.getTasks(shopId).catch(() => [] as DiscountTask[]);
        setTasks(tasksData);
      }
    } catch {
      showToast('שגיאה בטעינת ההנחות', 'error');
    } finally {
      setLoading(false);
    }
  }, [shops, shopId]);

  useEffect(() => { loadData(); }, [loadData]);

  // כל הכללים מכל החנויות
  const allRules = Object.values(rulesByShop).flat();
  const filteredRules = tab === 'all' || tab === 'history'
    ? allRules
    : allRules.filter(r => r.status === tab);

  const handleSave = async (data: Partial<DiscountRule>, _activate: boolean) => {
    if (!shopId) return;
    try {
      if (editingRule) {
        const ruleShopId = editingRule.shop_id ?? shopId;
        const updated = await discountsApi.updateRule(ruleShopId, editingRule.id, data);
        setRulesByShop(prev => ({ ...prev, [ruleShopId]: (prev[ruleShopId] || []).map(r => r.id === updated.id ? updated : r) }));
        showToast('הנחה עודכנה בהצלחה', 'success');
      } else {
        const created = await discountsApi.createRule(shopId, data);
        setRulesByShop(prev => ({ ...prev, [shopId]: [created, ...(prev[shopId] || [])] }));
        showToast('הנחה נוצרה בהצלחה', 'success');
      }
      setShowModal(false);
      setEditingRule(undefined);
    } catch {
      showToast('שגיאה בשמירת ההנחה', 'error');
      throw new Error('save failed');
    }
  };

  const handleToggle = async (rule: DiscountRule) => {
    const ruleShopId = rule.shop_id ?? shopId;
    if (!ruleShopId) return;
    try {
      const updated = await discountsApi.toggleRule(ruleShopId, rule.id);
      setRulesByShop(prev => ({ ...prev, [ruleShopId]: (prev[ruleShopId] || []).map(r => r.id === updated.id ? updated : r) }));
    } catch {
      showToast('שגיאה בשינוי הסטטוס', 'error');
    }
  };

  const handleDelete = async (rule: DiscountRule) => {
    const ruleShopId = rule.shop_id ?? shopId;
    if (!ruleShopId || !confirm(`למחוק את "${rule.name}"?`)) return;
    try {
      await discountsApi.deleteRule(ruleShopId, rule.id);
      setRulesByShop(prev => ({ ...prev, [ruleShopId]: (prev[ruleShopId] || []).filter(r => r.id !== rule.id) }));
      showToast('הנחה נמחקה', 'success');
    } catch {
      showToast('שגיאה במחיקה', 'error');
    }
  };

  const handleTriggerRotation = async (rule: DiscountRule) => {
    try {
      const result = await discountsApi.triggerRotation(rule.id);
      const ruleShopId = rule.shop_id ?? shopId;
      if (ruleShopId) {
        setRulesByShop(prev => ({
          ...prev,
          [ruleShopId]: (prev[ruleShopId] || []).map(r => r.id === rule.id
            ? { ...r, last_discount_percent: result.new_percent, next_rotation_at: result.next_rotation_at }
            : r
          ),
        }));
      }
      showToast(`סבב הנחה הופעל — ${result.new_percent}% (${result.sale_name})`, 'success');
    } catch {
      showToast('שגיאה בהפעלת הסבב', 'error');
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1200px] mx-auto space-y-6" dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Tag className="w-6 h-6 text-[#006d43]" />
              ניהול הנחות
            </h1>
            <p className="text-gray-500 text-sm mt-1">נהל הנחות על מוצרים ועל החנות שלך</p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadData} className="p-2 text-gray-400 hover:text-[#006d43] transition-colors rounded-lg hover:bg-gray-50">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={() => { setEditingRule(undefined); setShowModal(true); }}
              disabled={!shopId}
              className="flex items-center gap-2 px-4 py-2 bg-[#006d43] text-white rounded-lg font-medium hover:bg-[#005535] transition-colors disabled:opacity-50 text-sm"
            >
              <Plus className="w-4 h-4" />
              הנחה חדשה
            </button>
          </div>
        </div>

        {!shopId && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm">
            בחר חנות כדי לנהל הנחות
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                tab === t.key
                  ? 'bg-[#006d43] text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
            >
              {t.label}
              {t.key !== 'history' && t.key !== 'all' && (
                <span className="mr-1.5 text-xs opacity-70">
                  ({allRules.filter(r => r.status === t.key).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 text-[#006d43] animate-spin" />
          </div>
        ) : tab === 'history' ? (
          /* Tasks table */
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">היסטוריית ביצועים</h3>
            </div>
            {tasks.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-3 text-gray-200" />
                <p>אין משימות בתור</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">תאריך ביצוע</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">פעולה</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">היקף</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">סטטוס</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">פרטים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(task => (
                      <tr key={task.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">
                          {new Date(task.scheduled_for).toLocaleDateString('he-IL')}{' '}
                          {new Date(task.scheduled_for).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {task.action === 'apply_discount'
                            ? `החל ${task.discount_value || ''}%`
                            : 'הסר הנחה'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {task.scope === 'entire_shop' ? 'כל החנות' : `${task.listing_ids?.length || 0} מוצרים`}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-base">{taskStatusIcon[task.status]}</span>{' '}
                          <span className="text-gray-600">
                            {task.status === 'pending' ? 'ממתין'
                              : task.status === 'in_progress' ? 'בתהליך'
                              : task.status === 'completed' ? 'בוצע'
                              : 'נכשל'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-red-500 text-xs">
                          {task.error_message || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          /* Rules list — grouped by shop */
          <div className="space-y-6">
            {visibleShops.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-100">
                <Tag className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">בחר חנות כדי לראות הנחות</p>
              </div>
            ) : visibleShops.map(shop => {
              const shopRules = (rulesByShop[shop.id] || []).filter(r =>
                tab === 'all' ? true : r.status === tab
              );
              return (
                <div key={shop.id}>
                  {/* Shop header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="font-semibold text-gray-700 text-base">{shop.display_name}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {shopRules.filter(r => r.status === 'active').length} פעיל
                    </span>
                  </div>
                  {shopRules.length === 0 ? (
                    <div className="bg-white rounded-xl p-5 text-center shadow-sm border border-gray-100 text-gray-400 text-sm">
                      אין כללי הנחה לחנות זו
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {shopRules.map(rule => (
                        <RuleCard
                          key={rule.id}
                          rule={rule}
                          onToggle={() => handleToggle(rule)}
                          onEdit={() => { setEditingRule(rule); setShowModal(true); }}
                          onDelete={() => handleDelete(rule)}
                          onTriggerRotation={rule.auto_rotate ? () => handleTriggerRotation(rule) : undefined}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <DiscountModal
          initial={editingRule}
          onClose={() => { setShowModal(false); setEditingRule(undefined); }}
          onSave={handleSave}
        />
      )}
    </DashboardLayout>
  );
}
