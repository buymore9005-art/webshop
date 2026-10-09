# Riwayat pengujian pengembangan

Ringkasan ini bukan pengganti hasil akhir `tests.log`.

- Assertion baseline menemukan absennya Auth gate, SQL, dan build gate.
- Tes domain/checkout ditulis sebelum implementasi.
- Review respons Midtrans menemukan currency tidak selalu hadir; tes gagal sebelum
  validasi diubah agar hanya menolak currency berbeda yang secara eksplisit dikirim.
- Regresi bootstrap variable dan pagination URL: 69 lulus / 2 gagal sebelum perbaikan,
  kemudian 71 lulus. Ini assertion source, bukan eksekusi PL/pgSQL.
- Layout awal: 17/20 lulus; file-input mobile memakai font di bawah16px. Setelah
  perbaikan,20/20 lulus. Detail awal tersimpan pada mobile-layout-red.json. Lima fixture keranjang kemudian ditambahkan dan hasil akhir25/25lulus.
- Formatter source sempat membuat tiga regex tes terlalu bergantung whitespace.
  Assertion diperbaiki untuk menerima whitespace, tanpa melemahkan pemeriksaan
  signature/webhook, ukuranfile, atau duplicateAuth guard.
- Snap payload: 71 lulus /5 gagal sebelum helper diuji dan diimplementasikan; hasil
  akhir76/76 lulus termasuk duplicatevarianID, alamatprovider, nominal,3DS, ukuranbody.
- Build penuh tetap gagal karena dependency. Tidak ada pengabaian error tersebut.
