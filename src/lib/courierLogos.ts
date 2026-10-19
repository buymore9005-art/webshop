import jnt from '../assets/couriers/jnt.png?inline';
import jne from '../assets/couriers/jne.webp?inline';
import sicepat from '../assets/couriers/sicepat.webp?inline';
import anteraja from '../assets/couriers/anteraja.webp?inline';
import pos from '../assets/couriers/pos.webp?inline';
import tiki from '../assets/couriers/tiki.webp?inline';
import biteship from '../assets/couriers/biteship.png?inline';

// Only bundled raster assets; never consume provider-supplied image URLs or SVG.
const logos: Record<string, string> = { jnt, jne, sicepat, anteraja, pos, tiki, biteship };
export function courierLogo(code: string): string | undefined {
    const value = Object.hasOwn(logos, code) ? logos[code] : undefined;
    return value && /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : undefined;
}