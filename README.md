# Inventory Sparepart

Next.js 14 + Postgres. Stok per gudang (Sunter, KIIC Maintenance, KIIC Stamping, SC1, SC2), input mutasi oleh user gudang, import price master oleh Accounting.

## Deploy ke Vercel (semua dari browser)
1. Upload isi folder ini ke repository GitHub baru (Add file > Upload files).
2. Vercel > Add New > Project > import repository tersebut.
3. Vercel > Storage > buat Postgres (Neon) dan sambungkan ke project (otomatis mengisi `DATABASE_URL`).
4. Settings > Environment Variables: tambah `AUTH_SECRET` (acak panjang) dan `SETUP_TOKEN` (acak). Deploy / Redeploy.
5. Buka `https://<domain-anda>/api/setup?token=<SETUP_TOKEN>` sekali: tabel dibuat, data Sep/Okt 2026 dimasukkan, password user ditampilkan.
6. Hapus `SETUP_TOKEN` di Vercel lalu Redeploy. Login `accounting` > Price Master > upload file.
(Alternatif lokal: `npm install && npm run setup` dengan `.env.local`.)

## Alur input bulanan
- Menu **Input Mutasi** menampilkan semua item gudang dengan stok akhir bulan lalu. User mengetik jumlah **Masuk** dan **Keluar** per item; saldo dihitung otomatis. Klik **Simpan**, lalu **kunci bulan** bila sudah benar.
- Setiap item menyimpan satu total Masuk dan satu total Keluar per bulan (tanggal akhir bulan).
- Setelah terkunci, tabel yang sama dipakai untuk mengajukan koreksi dengan alasan; Accounting menyetujui atau menolak di menu **Approval**, yang disetujui langsung diterapkan.
- Accounting dapat **membuka kunci** bulan per gudang di menu Approval (alasan wajib, tercatat di riwayat). Permintaan yang masih menunggu untuk bulan itu otomatis ditolak; gudang lalu bisa mengubah tabel langsung dan mengunci lagi.
- Oktober 2026 (data import awal) otomatis terkunci. Tabel baru dibuat otomatis saat aplikasi pertama kali dibuka setelah update.

## Rekonsiliasi bulanan (Accounting)
- Menu **Rekonsiliasi**: bandingkan IN/OUT aplikasi (qty × harga × kurs) dengan nilai yang sudah tercatat di akun Persediaan GL per gudang.
- IN seharusnya masuk **Persediaan** (Adj IN = IN aplikasi − IN di GL Persediaan; + = Dr Persediaan / Cr Beban). OUT seharusnya masuk **Beban** (Adj OUT = OUT aplikasi − OUT di GL Persediaan; + = Dr Beban / Cr Persediaan).
- Isi nilai GL per gudang, simpan, lalu lihat draft jurnal; unduh Excel (jurnal + detail IN/OUT per barang) dan catat No. jurnal serta status diposting.

## Aturan penting
- Satu baris Excel = satu baris barang (kode yang sama bisa muncul beberapa kali di gudang yang sama, mis. sisi R/L).
- Stok awal = kolom STOCK SEP. IN/OUT Oktober masuk sebagai mutasi tertanggal 31 Okt 2026; mutasi berikutnya diinput gudang.
- Harga: per `Item_Code`, baris dengan **Start_Date terbaru** (≤ hari ini; harga ≤ 0 diabaikan). Bila beberapa supplier punya Start_Date sama dengan harga beda, dipilih `Last_Update` terbaru dan ditandai.
