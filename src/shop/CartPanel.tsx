import type { CartLine } from '../types';
import { money } from '../lib/domain';
import { Modal, Photo } from '../components/UI';
export function CartPanel({ open, cart, onClose, onQuantity, onRemove, onCheckout }: {
  open: boolean;
  cart: CartLine[];
  onClose: () => void;
  onQuantity: (line: CartLine, n: number) => void;
  onRemove: (line: CartLine) => void;
  onCheckout: () => void;
}) {
  return <Modal open={open} title="Keranjang Anda" onClose={onClose}>
    <div className="stack">
      {!cart.length ? <p className="empty">Keranjang masih kosong. Pilih produk dari katalog.</p> : cart.map(line => <article className="cart-line" key={line.product_id + '|' + line.variant}>
        <Photo src={line.image} alt={line.title} />
        <div className="min-w-0">
          <h3>
            {line.title}
          </h3>
          {line.variant && <p className="muted">
            {line.variant}
          </p>}
          <p>
            {money(line.price)}
          </p>
          <div className="quantity">
            <button type="button" className="button secondary" disabled={line.quantity <= 1} onClick={() => onQuantity(line, line.quantity - 1)}>Kurangi</button>
            <output aria-label="Jumlah barang">
              {line.quantity}
            </output>
            <button type="button" className="button secondary" disabled={line.quantity >= 99} onClick={() => onQuantity(line, line.quantity + 1)}>Tambah</button>
          </div>
          <button type="button" className="text-button danger" onClick={() => onRemove(line)}>Hapus</button>
        </div>
        <strong>
          {money(line.quantity * line.price)}
        </strong>
      </article>)}
      {!!cart.length && <div className="cart-bottom">
        <div className="split">
          <span>Subtotal</span>
          <strong>
            {money(cart.reduce((s, x) => s + x.price * x.quantity, 0))}
          </strong>
        </div>
        <small>Ongkos kirim dan total final ditampilkan sebelum pembayaran.</small>
        <button type="button" className="button wide" onClick={onCheckout}>Lanjut ke checkout</button>
      </div>}
    </div>
  </Modal>;
}
