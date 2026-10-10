export type PaymentType = 'Bank' | 'E-Wallet' | 'QRIS';
export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'failed' | 'refunded' | 'partial_refund';
export type FulfillmentStatus = 'unfulfilled' | 'processing' | 'shipped' | 'completed';
export interface Variant {
    name: string;
    image: string;
}
export interface Product {
    id: string;
    title: string;
    price: number;
    description: string;
    category: string;
    image_url: string;
    images: string[];
    variants: Variant[];
    stock: number | null;
    weight_grams: number;
    is_active: boolean;
    version: number;
    created_at: string;
    updated_at: string;
}
export interface Settings {
    id: number;
    store_name: string;
    banner_url: string;
    hero_title: string;
    store_notice: string;
    categories: string[];
    admin_phone: string;
    shipping_fee: number;
    free_shipping_min: number | null;
    updated_at: string;
}
export interface ShippingOrigin {
    id: number;
    name: string;
    phone: string;
    address: string;
    district: string;
    city: string;
    province: string;
    postal_code: string;
    updated_at: string;
}
export interface PaymentMethod {
    id: string;
    name: string;
    account_number: string;
    account_holder: string;
    type: PaymentType;
    qris_url: string;
    is_active: boolean;
    sort_order: number;
}
export interface Article {
    id: string;
    slug: string;
    title: string;
    excerpt: string;
    body: string;
    cover_image_url: string;
    status: 'draft' | 'published';
    published_at: string | null;
    created_at: string;
    updated_at: string;
}
export interface FooterInfo {
    id: string;
    title: string;
    content: string;
    href: string;
    sort_order: number;
    is_active: boolean;
}
export interface Coupon {
    id: string;
    code: string;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    min_subtotal: number;
    starts_at: string;
    ends_at: string | null;
    max_uses: number | null;
    max_uses_per_customer: number | null;
    times_used: number;
    is_active: boolean;
}
export interface CartLine {
    product_id: string;
    variant: string;
    quantity: number;
    title: string;
    price: number;
    image: string;
}
export interface CheckoutItem {
    product_id: string;
    variant: string;
    quantity: number;
}
export interface Customer {
    name: string;
    address: string;
    district: string;
    city: string;
    province: string;
    postal_code: string;
    phone: string;
    note: string;
}
export interface OrderItem {
    product_id: string;
    title: string;
    category: string;
    variant: string;
    image: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    stock_tracked: boolean;
    weight_grams?: number;
}
export interface Receipt {
    id: string;
    order_number: string;
    items: OrderItem[];
    subtotal: number;
    shipping_fee: number;
    coupon_code: string | null;
    discount_amount: number;
    total_price: number;
    status: OrderStatus;
    payment_method: string;
    payment_snapshot: PaymentMethod;
    fulfillment_status: FulfillmentStatus;
    tracking_number: string;
    carrier: string;
    created_at: string;
}
export interface Order extends Receipt {
    shipping_quote_id?: string | null;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    customer_district: string;
    customer_city: string;
    customer_province: string;
    customer_postal_code: string;
    total_weight_grams: number;
    customer_note: string;
    version: number;
    updated_at: string;
}
export interface Summary {
    revenue: number;
    orders: number;
    pending: number;
    products: number;
    statuses: {
        status: OrderStatus;
        count: number;
    }[];
    top_products: {
        title: string;
        quantity: number;
        revenue: number;
    }[];
}
export interface OrderAccess {
    id?: string;
    requestId: string;
    receiptToken: string;
    signature: string;
}
