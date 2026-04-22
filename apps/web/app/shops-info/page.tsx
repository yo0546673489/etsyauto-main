'use client';

/**
 * רשימת חנויות — private shop-details management page.
 * CRUD over /api/shop-credentials, with per-field copy buttons.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { shopCredentialsApi, type ShopCredential, type ShopCredentialInput } from '@/lib/api';
import {
  Copy,
  Check,
  Pencil,
  Trash2,
  Plus,
  Store,
  Search,
  X,
  Save,
  Eye,
  EyeOff,
} from 'lucide-react';

// ── Field definitions (order + labels) ────────────────────────────
type FieldKey =
  | 'shop_number'
  | 'name'
  | 'email'
  | 'former_email'
  | 'password'
  | 'etsy_password'
  | 'phone'
  | 'credit_card'
  | 'bank'
  | 'proxy'
  | 'ebay'
  | 'notes';

interface FieldDef {
  key: FieldKey;
  label: string;
  placeholder?: string;
  sensitive?: boolean; // passwords
  wide?: boolean;      // full width in card / notes
  numeric?: boolean;
}

const FIELDS: FieldDef[] = [
  { key: 'shop_number',  label: 'מספר חנות', placeholder: 'מס\' רץ', numeric: true },
  { key: 'name',         label: 'שם בעלים',  placeholder: 'שם מלא' },
  { key: 'email',        label: 'מייל',        placeholder: 'example@gmail.com' },
  { key: 'former_email', label: 'מייל לשעבר',  placeholder: '' },
  { key: 'password',     label: 'סיסמה',       sensitive: true },
  { key: 'etsy_password',label: 'סיסמה באטסי',  sensitive: true },
  { key: 'phone',         label: 'טלפון מחובר', placeholder: 'מספר טלפון' },
  { key: 'credit_card',   label: "מס' אשראי" },
  { key: 'bank',          label: 'בנק' },
  { key: 'proxy',         label: 'פרוקסי / IP' },
  { key: 'ebay',          label: 'איביי' },
  { key: 'notes',         label: 'הערות', wide: true },
];

// ── Small UI helpers ──────────────────────────────────────────────
function CopyButton({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  const [copied, setCopied] = useState(false);
  const canCopy = !!value && typeof value === 'string';

  const onCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(value!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* no-op */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={!canCopy}
      title={canCopy ? 'העתק' : 'ריק'}
      className={
        'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all ' +
        (copied
          ? 'bg-green-50 border-green-300 text-green-700'
          : canCopy
            ? 'bg-white border-gray-200 text-gray-500 hover:border-[#006d43] hover:text-[#006d43]'
            : 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed') +
        ' ' +
        className
      }
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function SensitiveValue({ value }: { value: string | null | undefined }) {
  const [show, setShow] = useState(false);
  if (!value) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-[13px]" style={{ direction: 'ltr' }}>
        {show ? value : '•'.repeat(Math.min(10, value.length))}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShow((s) => !s); }}
        className="text-gray-400 hover:text-[#006d43]"
        title={show ? 'הסתר' : 'הצג'}
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </span>
  );
}

// ── Form modal ────────────────────────────────────────────────────
function CredentialModal({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: ShopCredential | null;
  onClose: () => void;
  onSave: (payload: ShopCredentialInput) => Promise<void>;
}) {
  const [form, setForm] = useState<ShopCredentialInput>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const { id: _ignored, ...rest } = initial;
      setForm(rest);
    } else {
      setForm({});
    }
    setErr(null);
  }, [open, initial]);

  if (!open) return null;

  const set = (k: FieldKey, v: string) => {
    setForm((f) => ({
      ...f,
      [k]: k === 'shop_number' ? (v === '' ? null : Number(v)) : (v === '' ? null : v),
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSave(form);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">
            {initial ? 'עריכת פרטי חנות' : 'הוספת חנות חדשה'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.wide ? 'md:col-span-2' : ''}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                {f.wide ? (
                  <textarea
                    value={(form[f.key] as string | null | undefined) ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                    rows={3}
                    placeholder={f.placeholder}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006d43]/30 focus:border-[#006d43]"
                  />
                ) : (
                  <input
                    type={f.numeric ? 'number' : 'text'}
                    value={(form[f.key] as string | number | null | undefined) ?? ''}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006d43]/30 focus:border-[#006d43]"
                    style={f.key === 'email' || f.key === 'former_email' || f.key === 'proxy' ? { direction: 'ltr' } : undefined}
                  />
                )}
              </div>
            ))}
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
        </form>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-[#006d43] text-white hover:bg-[#005232] text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'שומר…' : 'שמור'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function ShopsInfoPage() {
  const [rows, setRows] = useState<ShopCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShopCredential | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await shopCredentialsApi.list();
      setRows(data);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      FIELDS.some((f) => {
        const v = r[f.key];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [rows, search]);

  const handleSave = async (payload: ShopCredentialInput) => {
    if (editing) {
      await shopCredentialsApi.update(editing.id, payload);
    } else {
      await shopCredentialsApi.create(payload);
    }
    await load();
  };

  const handleDelete = async (row: ShopCredential) => {
    const label = row.shop_number ? `חנות ${row.shop_number}` : row.email || `#${row.id}`;
    if (!confirm(`למחוק את ${label}? פעולה זו לא הפיכה.`)) return;
    await shopCredentialsApi.remove(row.id);
    await load();
  };

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (r: ShopCredential) => { setEditing(r); setModalOpen(true); };

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-[#006d43]/10 flex items-center justify-center">
                <Store className="w-6 h-6 text-[#006d43]" />
              </span>
              רשימת חנויות — פרטים מלאים
            </h1>
            <p className="text-gray-500 text-sm mt-2">
              ניהול פרטי כל החנויות שלך במקום אחד. כל שדה ניתן להעתקה בלחיצה, אפשר לערוך ולהוסיף חנויות חדשות.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש…"
                className="pr-9 pl-3 py-2 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#006d43]/30 focus:border-[#006d43] text-sm w-52"
              />
            </div>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#006d43] text-white font-semibold shadow-md hover:bg-[#005232] transition-all"
            >
              <Plus className="w-4 h-4" />
              חנות חדשה
            </button>
          </div>
        </div>

        {err && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{err}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-80 rounded-2xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <Store className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-4">
              {rows.length === 0 ? 'עדיין אין חנויות ברשימה.' : 'לא נמצאו תוצאות לחיפוש.'}
            </p>
            {rows.length === 0 && (
              <button
                onClick={openAdd}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#006d43] text-white font-semibold hover:bg-[#005232]"
              >
                <Plus className="w-4 h-4" />
                הוסף חנות ראשונה
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((r) => (
              <ShopCard
                key={r.id}
                row={r}
                onEdit={() => openEdit(r)}
                onDelete={() => handleDelete(r)}
              />
            ))}
          </div>
        )}
      </div>

      <CredentialModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </DashboardLayout>
  );
}

function ShopCard({
  row,
  onEdit,
  onDelete,
}: {
  row: ShopCredential;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const title = row.shop_number ? `חנות ${row.shop_number}` : row.email || `חנות ${row.id}`;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-lg transition-all overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 bg-gradient-to-l from-[#006d43] to-[#00a86b] text-white flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 font-bold">
            {row.shop_number ?? '—'}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-base truncate">{title}</div>
            {row.name && <div className="text-white/80 text-xs truncate">{row.name}</div>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/30 flex items-center justify-center transition-all"
            title="עריכה"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-lg bg-white/15 hover:bg-red-500 flex items-center justify-center transition-all"
            title="מחיקה"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="divide-y divide-gray-100">
        {FIELDS.filter((f) => f.key !== 'shop_number' && f.key !== 'name').map((f) => {
          const value = row[f.key] as string | null | undefined;
          const empty = value == null || value === '';
          return (
            <div key={f.key} className="px-5 py-2.5 flex items-center gap-3 group hover:bg-gray-50">
              <span className="text-xs font-medium text-gray-500 w-24 flex-shrink-0">{f.label}</span>
              <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">
                {empty ? (
                  <span className="text-gray-300">—</span>
                ) : f.sensitive ? (
                  <SensitiveValue value={value} />
                ) : (
                  <span
                    className="font-mono text-[13px] truncate inline-block max-w-full"
                    style={
                      f.key === 'email' || f.key === 'former_email' || f.key === 'proxy'
                        ? { direction: 'ltr' }
                        : undefined
                    }
                    title={String(value)}
                  >
                    {String(value)}
                  </span>
                )}
              </span>
              <CopyButton value={value} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
