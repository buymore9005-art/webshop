import type { Order } from '../types';

export const adminOrderActions = {
  paid: 'Verifikasi pembayaran',
  cancelled: 'Batalkan pesanan',
  processing: 'Mulai proses pesanan',
  shipped: 'Kirim & simpan resi',
  completed: 'Selesaikan pesanan',
};
export type AdminOrderAction = keyof typeof adminOrderActions;
type OrderState = Pick<Order, 'status' | 'fulfillment_status' | 'shipping_quote_id'>;

// Presentation only: the RPC remains authoritative for permissions and transitions.
export function availableOrderActions(order: OrderState): AdminOrderAction[] {
  if (order.status === 'pending') return ['paid', 'cancelled'];
  if (!['paid', 'partial_refund'].includes(order.status)) return [];
  if (order.fulfillment_status === 'unfulfilled') return ['processing'];
  if (order.fulfillment_status === 'processing' && !order.shipping_quote_id) return ['shipped'];
  if (order.fulfillment_status === 'shipped') return ['completed'];
  return [];
}

export function canBookOrderShipment(order: OrderState): boolean {
  return ['paid', 'partial_refund'].includes(order.status)
    && order.fulfillment_status === 'processing' && !!order.shipping_quote_id;
}