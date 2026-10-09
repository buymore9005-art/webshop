"""CSS layout fixtures only; not an authenticated React/Supabase browser test."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs' / 'qa'
CSS = (ROOT / 'index.css').read_text()
field = lambda text,control='<input value="Data pengujian" />': f'<div class="field"><label>{text}</label>{control}</div>'
header = '<header class="store-header"><div class="container header-inner"><button class="brand">ZYHA ID</button><nav><button class="text-button">Katalog</button><button class="text-button">Pesanan terakhir</button><button class="button">Keranjang (99)</button></nav></div></header>'
card = '<article class="product-card"><button class="product-photo"><div class="photo photo-empty">Foto pengujian layout</div></button><div class="product-copy"><p class="eyebrow">Shoulder Bag</p><button class="product-name">Tas bahu dengan nama produk yang cukup panjang</button><strong>Rp 1.000.000</strong><button class="button">Pilih varian</button></div></article>'
shop = header + '<main><section class="container hero-section"><div class="hero"><div class="hero-copy"><p class="eyebrow">Fixture layout, bukan katalog nyata</p><h1>GET READY BAGS.</h1><p>Pengujian lebar tampilan menggunakan CSS aplikasi.</p><a class="button" href="#catalog">Belanja koleksi</a></div></div></section><section class="container section"><h2>Katalog produk</h2><div class="catalog-filters">'+field('Cari produk')+field('Kategori','<select><option>Semua kategori</option></select>')+field('Urutan','<select><option>Harga terendah</option></select>')+'</div><div class="product-grid">'+card*6+'</div></section></main>'
filters = '<div class="panel form-grid">'+field('Cari nomor pesanan')+field('Status','<select><option>Menunggu pembayaran</option></select>')+field('Dari tanggal','<input type="date" value="2026-10-10"/>')+field('Sampai tanggal','<input type="date" value="2026-10-10"/>')+'</div>'
row = '<tr><td data-label="Pesanan"><strong class="order-reference">ZYHA-1234567890ABCDEF1234567890ABCDEF</strong><small>10 Oktober 2026 pukul 12.30</small></td><td data-label="Pembeli">Nama pembeli untuk pengujian<small>6281234567890</small></td><td data-label="Total">Rp 1.000.000<small>Bank pengujian</small></td><td data-label="Status"><span class="status pending">Menunggu pembayaran</span><small>Belum diproses</small></td><td data-label="Aksi"><button class="button secondary">Lihat detail</button></td></tr>'
nav='<nav class="admin-nav">'+''.join(f'<button>{x}</button>' for x in ['Dashboard','Produk & katalog','Metode pembayaran','Pesanan','Analitik','WhatsApp','Pengaturan'])+'</nav>'
admin = '<div class="admin-layout"><aside class="admin-sidebar"><a class="brand">ZYHA ID</a>'+nav+'</aside><div class="admin-content"><header class="admin-mobile-header"><a class="brand">ZYHA ID</a><button class="button secondary">Menu</button></header><main class="admin-main stack"><h1>Pesanan</h1>'+filters+'<div class="table-wrap"><table class="data-table"><thead><tr><th>Pesanan</th><th>Pembeli</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead><tbody>'+row*3+'</tbody></table></div><div class="pagination"><button class="button secondary">Sebelumnya</button><span>Halaman 1 / 20</span><button class="button secondary">Berikutnya</button></div></main></div></div>'
summary = '<aside class="panel checkout-summary stack"><h2>Ringkasan pesanan</h2><div class="split"><span>Nama tas panjang untuk menguji pembungkusan teks<small>KHAKI · 2 barang</small></span><strong>Rp 200.000</strong></div><div class="split total"><span>Estimasi total</span><strong>Rp 220.000</strong></div><button class="button wide">Buat pesanan</button></aside>'
checkout = header+'<main class="container section"><h1>Checkout</h1><form class="checkout-grid"><div class="panel stack"><h2>Detail pengiriman</h2>'+field('Nama lengkap')+field('Nomor WhatsApp','<input type="tel" value="6281234567890"/>')+field('Alamat lengkap','<textarea rows="4">Alamat pengujian tata letak tanpa data pelanggan asli.</textarea>')+'<label class="payment-option"><input type="radio" name="payment"/><span><strong>Bank dengan nama panjang</strong><small>Transfer bank manual, konfirmasi Admin</small></span></label></div>'+summary+'</form></main>'
variant='<div class="variant-editor">'+field('Nama varian')+'<div class="photo photo-empty">Foto</div>'+field('Foto varian','<input type="file" accept="image/*"/>')+'<button class="text-button">Hapus varian</button></div>'
editor='<dialog class="modal" id="editor"><header><h2>Tambah produk</h2><button class="button secondary" onclick="document.getElementById(\'editor\').close()">Tutup</button></header><div class="modal-content stack"><div class="form-grid">'+field('Nama produk')+field('Harga (Rupiah)','<input type="number" value="100000"/>')+field('Galeri produk','<input type="file" multiple/>')+'</div>'+variant+'<button class="button">Simpan produk</button></div></dialog>'
cart='<dialog class="modal" id="cart"><header><h2>Keranjang Anda</h2><button class="button secondary">Tutup</button></header><div class="modal-content stack"><article class="cart-line"><div class="photo photo-empty">Foto</div><div style="min-width:0"><h3>Nama tas panjang untuk pengujian</h3><p>KHAKI</p><div class="quantity"><button class="button secondary">Kurangi</button><output>99</output><button class="button secondary">Tambah</button></div><button class="text-button danger">Hapus</button></div><strong>Rp 999.999.999</strong></article><button class="button wide">Lanjut ke checkout</button></div></dialog>'
result=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page()
    for name,markup in [('catalog',shop),('admin-orders',admin),('checkout',checkout),('product-dialog',editor),('cart-dialog',cart)]:
        for width in [320,360,390,768,1440]:
            page.set_viewport_size({'width':width,'height':900})
            page.set_content('<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>ZYHA CSS layout fixture</title><style>'+CSS+'</style></head><body>'+markup+'</body></html>')
            if name.endswith('-dialog'): page.eval_on_selector('dialog','x=>x.showModal()')
            page.wait_for_timeout(60)
            metrics=page.evaluate('''() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth, smallInput:[...document.querySelectorAll('input:not([type=radio]),select,textarea')].filter(x=>x.getClientRects().length && parseFloat(getComputedStyle(x).fontSize)<16).length, overflow:[...document.querySelectorAll('input,select,textarea,button,.panel,.product-card,.modal')].filter(x=>x.getClientRects().length && (x.getBoundingClientRect().right>innerWidth+1||x.getBoundingClientRect().left< -1)).map(x=>({tag:x.tagName,class:x.className,text:x.textContent.slice(0,50)}))})''')
            ok=metrics['scrollWidth']<=width and not metrics['overflow'] and (width>640 or metrics['smallInput']==0)
            result.append({'fixture':name,'viewport':width,'pass':ok,**metrics})
            if width in [360,1440] and name in ['catalog','admin-orders']:
                page.screenshot(path=str(OUT/f'layout-{name}-{width}.png'),full_page=True)
    browser.close()
report={'scope':'Actual index.css with static QA-only representative markup. No React build, Tailwind generation, live data, Auth or payment tested.','cases':result,'passed':sum(r['pass'] for r in result),'failed':sum(not r['pass'] for r in result)}
(OUT/'mobile-layout.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
raise SystemExit(1 if report['failed'] else 0)
