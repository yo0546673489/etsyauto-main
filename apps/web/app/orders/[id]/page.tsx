'use client';

/**
 * Order Detail Page
 * - All roles (owner/admin/supplier) can fulfill + sync to Etsy
 * - "Record Manual Tracking" toggle for local-only tracking
 * - Shows assigned supplier in header
 * - Shipment badges: "Synced to Etsy" vs "Manual", recorded-by info
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DashboardCard } from '@/components/dashboard/DashboardCard';
import { ArrowLeft, Package, Calendar, User, MapPin, CreditCard, RefreshCcw, Truck, CheckCircle, Globe, FileText, ChevronDown } from 'lucide-react';
import { ordersApi, OrderDetail, teamApi, TeamMember } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import { useShop } from '@/lib/shop-context';
import { useAuth } from '@/lib/auth-context';
import {
  ORDER_STATUS_BADGE_CLASSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  normalizeOrderStatus,
  normalizePaymentStatus,
} from '@/lib/order-status';

const CARRIER_OPTIONS = [
  { value: 'usps', label: 'USPS' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'dhl', label: 'DHL Express' },
  { value: 'canadapost', label: 'Canada Post' },
  { value: 'royalmail', label: 'Royal Mail' },
  { value: 'deutschepost', label: 'Deutsche Post' },
  { value: 'chinapost', label: 'China Post' },
  { value: 'japanpost', label: 'Japan Post' },
  { value: 'australiapost', label: 'Australia Post' },
  { value: 'other', label: 'Other' },
];

function PaymentStatus({ status }: { status: string }) {
  const normalized = normalizePaymentStatus(status);
  const isPaid = normalized === 'paid';
  return (
    <div className={isPaid ? 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50' : 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-50'}>
      <span className={isPaid ? 'w-2 h-2 rounded-full bg-green-600' : 'w-2 h-2 rounded-full bg-yellow-500'} />
      <span className={isPaid ? 'text-sm font-medium text-green-600' : 'text-sm font-medium text-yellow-700'}>
        {normalized.charAt(0).toUpperCase() + normalized.slice(1)}
      </span>
    </div>
  );
}

function OrderStatus({ status }: { status: string }) {
  const normalized = normalizeOrderStatus(status);
  let badgeClass = '';
  switch (normalized) {
    case 'completed': badgeClass = 'bg-green-50 text-green-700'; break;
    case 'in_transit': badgeClass = 'bg-yellow-50 text-yellow-700'; break;
    case 'cancelled': badgeClass = 'bg-red-50 text-red-700'; break;
    case 'refunded': badgeClass = 'bg-gray-200 text-gray-800'; break;
    default: badgeClass = 'bg-gray-100 text-gray-700';
  }
  return (
    <span className={`inline-flex px-3 py-1.5 rounded-full text-sm font-medium ${badgeClass}`}>
      {ORDER_STATUS_LABELS[normalized]}
    </span>
  );
}

function ShipmentSourceBadge({ source, recordedBy, recordedByRole }: { source?: string; recordedBy?: string; recordedByRole?: string }) {
  const isEtsy = source === 'etsy_sync';
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <span className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        isEtsy ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600',
      )}>
        {isEtsy ? <Globe className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
        {isEtsy ? 'Synced to Etsy' : 'Manual'}
      </span>
      {recordedBy && (
        <span className="text-xs text-[var(--text-muted)]">
          by {recordedBy}{recordedByRole ? ` (${recordedByRole})` : ''}
        </span>
      )}
    </div>
  );
}

function OrderDetailContent() {
  const router = useRouter();
  const params = useParams();
  const { showToast } = useToast();
  const { selectedShopId } = useShop();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [fulfilling, setFulfilling] = useState(false);
  const [trackingCode, setTrackingCode] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [shipDate, setShipDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [sendBcc, setSendBcc] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [fulfillResult, setFulfillResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [suppliers, setSuppliers] = useState<TeamMember[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [assigningSupplier, setAssigningSupplier] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [carrierError, setCarrierError] = useState('');
  const trackingInputRef = useRef<HTMLInputElement>(null);

  // Custom dropdown state
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);

  const orderId = typeof params?.id === 'string' ? parseInt(params.id, 10) : null;
  const canFulfill = user?.role === 'supplier' || user?.role === 'owner' || user?.role === 'admin';
  const canAssign = user?.role === 'owner' || user?.role === 'admin';

  useEffect(() => {
    if (orderId) loadOrder();
  }, [orderId]);

  useEffect(() => {
    if (canAssign) {
      teamApi.getMembers()
        .then((members) => setSuppliers(members.filter((m) => m.role === 'supplier')))
        .catch(() => setSuppliers([]));
    }
  }, [user?.role]);

  const loadOrder = async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const data = await ordersApi.getById(orderId);
      setOrder(data);
    } catch (error: any) {
      console.error('Failed to load order:', error);
      showToast(error.detail || 'Failed to load order', 'error');
      router.push('/orders');
    } finally {
      setLoading(false);
    }
  };

  // Pre-fill tracking form from latest shipment when order changes
  useEffect(() => {
    if (!order) return;
    const shipments = (order as any).shipments || [];
    if (shipments.length > 0) {
      const latest = shipments[shipments.length - 1];
      setTrackingCode(latest.tracking_code || '');
      setCarrierName(latest.carrier_name || '');
      setShipDate(
        latest.shipping_date
          ? String(latest.shipping_date).split('T')[0]
          : new Date().toISOString().split('T')[0],
      );
    }
  }, [order?.id]);

  const handleSyncOrder = async () => {
    try {
      setSyncing(true);
      showToast('Syncing order from Etsy...', 'info');
      await ordersApi.sync({ shopId: selectedShopId });
      showToast('Order synced successfully!', 'success');
      await loadOrder();
    } catch (error: any) {
      showToast(error.detail || 'Failed to sync order', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleFulfillOrder = async () => {
    if (!order) return;

    // Reset errors
    setTrackingError('');
    setCarrierError('');

    let hasError = false;

    if (!trackingCode.trim()) {
      setTrackingError('Tracking code is required');
      trackingInputRef.current?.focus();
      hasError = true;
    }
    if (!carrierName) {
      setCarrierError('Please select a carrier');
      hasError = true;
    }

    if (hasError) {
      const missing = [];
      if (!trackingCode.trim()) missing.push('tracking code');
      if (!carrierName) missing.push('carrier');
      showToast(`Please fill in required fields: ${missing.join(', ')}`, 'error');
      return;
    }

    try {
      setFulfilling(true);
      const payload = {
        tracking_code: trackingCode.trim(),
        carrier_name: carrierName.trim() || undefined,
        note: note.trim() || undefined,
        ship_date: shipDate,
      };
      let message = '';
      let result: any = null;
      if (manualOnly) {
        result = await ordersApi.recordTracking(order.id, payload);
        message = 'Tracking recorded (manual only — not synced to Etsy)';
        showToast(message, 'success');
      } else {
        result = await ordersApi.fulfill(order.id, { ...payload, send_bcc: sendBcc });
        if (result && result.status === 'already_synced') {
          message = 'Tracking already recorded on Etsy';
        } else {
          message = 'Tracking submitted and synced to Etsy successfully!';
        }
        showToast(message, 'success');
      }
      setTrackingCode('');
      setCarrierName('');
      setNote('');
      await loadOrder();
      setFulfillResult({ type: 'success', message });
      setTimeout(() => setFulfillResult(null), 5000);
    } catch (error: any) {
      const message = error.detail || 'Failed to submit tracking';
      showToast(message, 'error');
      setFulfillResult({ type: 'error', message });
      setTimeout(() => setFulfillResult(null), 5000);
    } finally {
      setFulfilling(false);
    }
  };

  const handleAssignSupplier = async () => {
    if (!order || !selectedSupplierId) return;
    try {
      setAssigningSupplier(true);
      await ordersApi.assignSupplier(order.id, selectedSupplierId);
      showToast('Supplier assigned to order', 'success');
      await loadOrder();
    } catch (error: any) {
      showToast(error.detail || 'Failed to assign supplier', 'error');
    } finally {
      setAssigningSupplier(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-[var(--text-muted)] text-lg">Order not found</p>
        </div>
      </div>
    );
  }

  const orderDetail = order as any; // access supplier_name etc.

  const syncStatus = order.shipments && order.shipments.length > 0
    ? order.shipments.some((s: any) => s.source === 'etsy_sync')
      ? (
        <span className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700">
          Synced to Etsy
        </span>
        )
      : (
        <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">
          Manual only — not synced
        </span>
        )
    : null;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/orders')}
          className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Orders</span>
        </button>

        {canAssign && (
          <button
            onClick={handleSyncOrder}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--background)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCcw className={cn('w-4 h-4', syncing && 'animate-spin')} />
            <span>{syncing ? 'Syncing...' : 'Sync Order'}</span>
          </button>
        )}
      </div>

      {/* Order Header */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
              Order {order.order_id}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Package className="w-4 h-4" />
                ID: {order.id}
              </span>
              {order.etsy_receipt_id && (
                <span className="flex items-center gap-1">
                  Etsy Receipt: {order.etsy_receipt_id}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(order.created_at)}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-[var(--text-muted)] mb-1">Total Amount</p>
            <p className="text-3xl font-bold text-[var(--text-primary)]">
              {order.total_price === null ? '--' : `${order.currency} ${order.total_price.toFixed(2)}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-6">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Order Status</p>
            <OrderStatus status={order.lifecycle_status || order.status} />
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">Payment Status</p>
            <PaymentStatus status={order.payment_status} />
          </div>

          {/* Assigned Supplier */}
          {orderDetail.supplier_name ? (
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">Assigned Supplier</p>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-violet-50 text-violet-700">
                <Truck className="w-3.5 h-3.5" />
                {orderDetail.supplier_name}
              </span>
            </div>
          ) : order.supplier_user_id ? (
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">Assigned Supplier</p>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
                <User className="w-3.5 h-3.5" />
                Supplier #{order.supplier_user_id}
              </span>
            </div>
          ) : canAssign ? (
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">Supplier</p>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-50 text-gray-500">
                Unassigned
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Tracking & Fulfillment Section */}
      {canFulfill && (
        <DashboardCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Tracking & Fulfillment</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--text-muted)]">
                Status: {order.fulfillment_status || 'unshipped'}
              </span>
              {syncStatus}
            </div>
          </div>

          {/* Display existing shipments with source badges */}
          {order.shipments && order.shipments.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Existing Shipments</h3>
              <div className="space-y-3">
                {order.shipments.map((shipment: any, index: number) => (
                  <div key={index} className="p-3 bg-[var(--background)] border border-[var(--border-color)] rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">Tracking Number</p>
                        <p className="text-sm font-medium text-[var(--text-primary)] font-mono">
                          {shipment.tracking_code}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">Carrier</p>
                        <p className="text-sm text-[var(--text-primary)]">
                          {shipment.carrier_name || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">Ship Date</p>
                        <p className="text-sm text-[var(--text-primary)]">
                          {shipment.shipping_date || shipment.ship_date || 'N/A'}
                        </p>
                      </div>
                    </div>
                    {shipment.tracking_url && (
                      <div className="mt-2">
                        <a
                          href={shipment.tracking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                        >
                          Track Package
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    )}
                    {shipment.is_delivered && (
                      <div className="mt-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Delivered
                        </span>
                      </div>
                    )}
                    <ShipmentSourceBadge
                      source={shipment.source}
                      recordedBy={shipment.recorded_by_name}
                      recordedByRole={shipment.recorded_by_role}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-[var(--border-color)] pt-4">
                <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">Add Additional Tracking</h3>
              </div>
            </div>
          )}

          {/* Assign Supplier — only owner/admin */}
          {canAssign && suppliers.length > 0 && (
            <div className="mb-4 flex flex-col md:flex-row gap-3 items-start md:items-end">
              <div className="flex-1 relative">
                <label className="block text-sm text-[var(--text-muted)] mb-2">Assign Supplier</label>
                <button
                  type="button"
                  onClick={() => setSupplierDropdownOpen(!supplierDropdownOpen)}
                  className={cn(
                    'w-full px-3 py-2 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-left flex items-center justify-between transition-colors',
                    selectedSupplierId ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                  )}
                >
                  <span>
                    {selectedSupplierId
                      ? (() => {
                          const s = suppliers.find(s => s.user_id === selectedSupplierId);
                          return s ? `${s.name} (${s.email})` : 'Select supplier';
                        })()
                      : 'Select supplier'}
                  </span>
                  <ChevronDown className={cn('w-4 h-4 transition-transform', supplierDropdownOpen && 'rotate-180')} />
                </button>
                {supplierDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSupplierDropdownOpen(false)} />
                    <div className="absolute left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                      <div className="py-1">
                        {suppliers.map((supplier) => (
                          <button
                            key={supplier.user_id}
                            type="button"
                            onClick={() => {
                              setSelectedSupplierId(supplier.user_id);
                              setSupplierDropdownOpen(false);
                            }}
                            className={cn(
                              'w-full text-left px-4 py-2.5 text-sm transition-colors',
                              selectedSupplierId === supplier.user_id
                                ? 'bg-[var(--primary-bg)] text-[var(--primary)] font-medium'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)]'
                            )}
                          >
                            {supplier.name} ({supplier.email})
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleAssignSupplier}
                disabled={!selectedSupplierId || assigningSupplier}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {assigningSupplier ? 'Assigning...' : 'Assign Supplier'}
              </button>
            </div>
          )}

          {/* Tracking form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">
                Tracking Code <span className="text-red-500">*</span>
              </label>
              <input
                ref={trackingInputRef}
                value={trackingCode}
                onChange={(e) => { setTrackingCode(e.target.value); if (trackingError) setTrackingError(''); }}
                className={cn(
                  'w-full px-3 py-2 bg-[var(--background)] border rounded-lg text-[var(--text-primary)] transition-colors',
                  trackingError ? 'border-red-500 ring-1 ring-red-500' : 'border-[var(--border-color)]'
                )}
                placeholder="Enter tracking number"
                required
              />
              {trackingError && (
                <p className="mt-1 text-xs text-red-500">{trackingError}</p>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm text-[var(--text-muted)] mb-2">
                Carrier <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setCarrierDropdownOpen(!carrierDropdownOpen)}
                className={cn(
                  'w-full px-3 py-2 bg-[var(--background)] border rounded-lg text-left flex items-center justify-between transition-colors',
                  carrierError ? 'border-red-500 ring-1 ring-red-500' : 'border-[var(--border-color)]',
                  carrierName ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                )}
              >
                <span>{carrierName ? CARRIER_OPTIONS.find(c => c.value === carrierName)?.label || carrierName : 'Select a carrier'}</span>
                <ChevronDown className={cn('w-4 h-4 transition-transform', carrierDropdownOpen && 'rotate-180')} />
              </button>
              {carrierError && (
                <p className="mt-1 text-xs text-red-500">{carrierError}</p>
              )}
              {carrierDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCarrierDropdownOpen(false)} />
                  <div className="absolute left-0 right-0 mt-1 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                    <div className="py-1">
                      {CARRIER_OPTIONS.map((carrier) => (
                        <button
                          key={carrier.value}
                          type="button"
                          onClick={() => {
                            setCarrierName(carrier.value);
                            setCarrierDropdownOpen(false);
                            if (carrierError) setCarrierError('');
                          }}
                          className={cn(
                            'w-full text-left px-4 py-2.5 text-sm transition-colors',
                            carrierName === carrier.value
                              ? 'bg-[var(--primary-bg)] text-[var(--primary)] font-medium'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--background)] hover:text-[var(--text-primary)]'
                          )}
                        >
                          {carrier.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">Shipment Date</label>
              <input
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-2">Note</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)]"
                placeholder="Optional note to buyer"
              />
            </div>
          </div>

          {/* Options row */}
          <div className="mt-4 space-y-3">
            {/* Manual-only toggle */}
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={manualOnly}
                onChange={(e) => setManualOnly(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <span>Record manually (do not sync to Etsy)</span>
            </label>
            {manualOnly && (
              <p className="text-xs text-amber-600 ml-6">
                Tracking will be saved locally only. It will not appear on the Etsy order.
              </p>
            )}

            {/* BCC option — visible when syncing to Etsy */}
            {!manualOnly && (
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendBcc}
                  onChange={(e) => setSendBcc(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border-color)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                <span>Send tracking notification to buyer (BCC to shop owner)</span>
              </label>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            {fulfillResult && (
              <div
                className={cn(
                  'mr-4 flex-1 p-3 rounded-lg text-sm',
                  fulfillResult.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200',
                )}
              >
                {fulfillResult.message}
              </div>
            )}
            <button
              onClick={handleFulfillOrder}
              disabled={fulfilling}
              className={cn(
                'px-5 py-2.5 rounded-lg font-medium transition disabled:opacity-50',
                manualOnly
                  ? 'bg-gray-600 text-white hover:bg-gray-700'
                  : 'bg-[var(--primary)] text-white hover:opacity-90',
              )}
            >
              {fulfilling
                ? 'Submitting...'
                : manualOnly
                  ? 'Save Manual Tracking'
                  : 'Submit & Sync to Etsy'}
            </button>
          </div>
        </DashboardCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Customer & Shipping */}
        <div className="lg:col-span-1 space-y-6">
          <DashboardCard title="Customer Information">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--primary-bg)] text-[var(--primary)] flex items-center justify-center text-sm font-medium">
                  {order.buyer_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[var(--text-primary)]">{order.buyer_name}</p>
                  <p className="text-sm text-[var(--text-muted)]">{order.buyer_email}</p>
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard title="Shipping Address">
            {order.shipping_address ? (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[var(--text-muted)] mt-1 flex-shrink-0" />
                <div className="text-sm text-[var(--text-primary)] space-y-1">
                  {typeof order.shipping_address === 'object' ? (
                    <>
                      {order.shipping_address.name && <p className="font-medium">{order.shipping_address.name}</p>}
                      {order.shipping_address.address1 && <p>{order.shipping_address.address1}</p>}
                      {order.shipping_address.address2 && <p>{order.shipping_address.address2}</p>}
                      {order.shipping_address.city && order.shipping_address.state && (
                        <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}</p>
                      )}
                      {order.shipping_address.country && <p>{order.shipping_address.country}</p>}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{JSON.stringify(order.shipping_address, null, 2)}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[var(--text-muted)] italic text-sm">No shipping address available</p>
            )}
          </DashboardCard>

          <DashboardCard title="Timestamps">
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">Created At</p>
                <p className="text-[var(--text-primary)]">{formatDate(order.created_at)}</p>
              </div>
              {order.updated_at && (
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1">Updated At</p>
                  <p className="text-[var(--text-primary)]">{formatDate(order.updated_at)}</p>
                </div>
              )}
              {order.synced_at && (
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-1">Last Synced</p>
                  <p className="text-[var(--text-primary)]">{formatDate(order.synced_at)}</p>
                </div>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Right Column - Order Items */}
        <div className="lg:col-span-2">
          <DashboardCard title="Order Items">
            {order.items && order.items.length > 0 ? (
              <div className="space-y-4">
                {order.items.map((item: any, index: number) => (
                  <div key={index} className="flex items-start gap-4 p-4 border border-[var(--border-color)] rounded-lg">
                    {item.image && (
                      <div className="w-20 h-20 rounded-lg overflow-hidden border border-[var(--border-color)] flex-shrink-0">
                        <img
                          src={item.image}
                          alt={item.title || `Item ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23f0f0f0" width="80" height="80"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="12" dy="50%25" dx="50%25" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
                          }}
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-medium text-[var(--text-primary)] mb-1">
                        {item.title || item.product_name || `Item ${index + 1}`}
                      </h3>
                      {item.sku && <p className="text-sm text-[var(--text-muted)] mb-2">SKU: {item.sku}</p>}
                      <div className="flex items-center gap-4 text-sm">
                        {item.quantity && <span className="text-[var(--text-muted)]">Qty: {item.quantity}</span>}
                        {item.price && (
                          <span className="font-medium text-[var(--text-primary)]">
                            {order.currency} {(parseFloat(item.price) / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                    {item.price && item.quantity && (
                      <div className="text-right">
                        <p className="text-sm text-[var(--text-muted)] mb-1">Subtotal</p>
                        <p className="font-medium text-[var(--text-primary)]">
                          {order.currency} {(parseFloat(item.price) / 100 * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                <div className="border-t border-[var(--border-color)] pt-4 mt-4">
                  <div className="flex items-center justify-between text-lg font-bold">
                    <span className="text-[var(--text-primary)]">Total</span>
                    <span className="text-[var(--text-primary)]">
                      {order.total_price != null ? `${order.currency} ${order.total_price.toFixed(2)}` : '--'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                <Package className="w-12 h-12 mb-2 opacity-50" />
                <p>No order items available</p>
                <p className="text-sm mt-1">Items data may not have been synced yet</p>
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <DashboardLayout>
      <OrderDetailContent />
    </DashboardLayout>
  );
}
