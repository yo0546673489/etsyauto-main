export type PaymentStatus = 'paid' | 'unpaid';
export type OrderStatus = 'processing' | 'in_transit' | 'completed' | 'cancelled' | 'refunded';

export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, { dot: string; text: string; bg?: string; border?: string }> = {
  paid: { dot: 'bg-green-600', text: 'text-green-600', bg: 'bg-green-50', border: 'border-green-300' },
  unpaid: { dot: 'bg-yellow-500', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300' },
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  processing: 'Processing',
  in_transit: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  completed: 'bg-green-50 text-green-700',
  in_transit: 'bg-yellow-50 text-yellow-700',
  processing: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-50 text-red-700',
  refunded: 'bg-gray-200 text-gray-800',
};

export const ORDER_STATUS_CARD_COLORS: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  completed: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  in_transit: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  processing: { bg: 'bg-gray-200', text: 'text-gray-700', border: 'border-gray-300' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  refunded: { bg: 'bg-gray-300', text: 'text-gray-800', border: 'border-gray-400' },
};

export const normalizePaymentStatus = (status?: string): PaymentStatus => {
  return status === 'paid' ? 'paid' : 'unpaid';
};

export const normalizeOrderStatus = (status?: string): OrderStatus => {
  switch (status) {
    case 'completed':
    case 'in_transit':
    case 'cancelled':
    case 'refunded':
    case 'processing':
      return status;
    default:
      return 'processing';
  }
};
