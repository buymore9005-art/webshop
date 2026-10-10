export interface ShippingLocation {
    district: string;
    city: string;
    province: string;
    postal_code: string;
    provider_location_id: string;
}

export interface ShippingAddress extends ShippingLocation {
    name: string;
    phone: string;
    address: string;
}

export interface ShippingParcel {
    weight_grams: number;
    length_cm?: number;
    width_cm?: number;
    height_cm?: number;
}

export interface ShippingRate {
    carrier_code: string;
    carrier_name: string;
    service_code: string;
    service_name: string;
    amount: number;
    currency: 'IDR';
    estimated_days: string;
    quote_reference: string;
    expires_at: string;
}

export interface ShipmentLabel {
    provider_shipment_id: string;
    tracking_number: string;
    label_url: string;
    status: 'booked' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'cancelled';
}

export interface ShippingProvider {
    readonly code: string;
    quote(input: { origin: ShippingLocation; destination: ShippingLocation; parcel: ShippingParcel }): Promise<ShippingRate[]>;
    createShipment(input: {
        order_id: string;
        order_number: string;
        origin: ShippingAddress;
        destination: ShippingAddress;
        parcel: ShippingParcel;
        rate: ShippingRate;
    }): Promise<ShipmentLabel>;
}

export function validateParcelWeight(weight: number): number {
    if (!Number.isSafeInteger(weight) || weight < 1 || weight > 100_000_000)
        throw new Error('Berat paket harus bilangan bulat 1–100.000.000 gram.');
    return weight;
}
