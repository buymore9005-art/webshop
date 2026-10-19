import type { Order } from '../types';
import { phrase } from '../i18n/runtime';

export const adminOrderActions = {
  get paid() { return phrase('Konfirmasi pembayaran'); },
  get cancelled() { return phrase('Batalkan pesanan'); },
  get processing() { return phrase('Proses pesanan'); },
  get shipped() { return phrase('Kirim & simpan resi'); },
  get completed() { return phrase('Selesaikan pesanan'); },
};
export type AdminOrderAction = keyof typeof adminOrderActions;
export function requiresOrderReason(action: AdminOrderAction): boolean {
  return action !== 'paid' && action !== 'processing';
}
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