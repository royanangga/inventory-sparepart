# Inventory Sparepart

Next.js 14 + Postgres. Stok per gudang (Sunter, KIIC Maintenance, KIIC Stamping, SC1, SC2), input mutasi oleh user gudang, import price master oleh Accounting.

## Deploy ke Vercel (semua dari browser)
1. Upload isi folder ini ke repository GitHub baru (Add file > Upload files).
2. Vercel > Add New > Project > import repository tersebut.
3. Vercel > Storage > buat Postgres (Neon) dan sambungkan ke project (otomatis mengisi `DATABASE_URL`).
4. Settings > Environment Variables: tambah `AUTH_SECRET` (acak panjang) dan `SETUP_TOKEN` (acak). Deploy / Redeploy.
5. Buka `https://<domain-anda>/api/setup?token=<SETUP_TOKEN>` sekali: tabel dibuat, data Sep/Okt 2026 dimasukkan, password user ditampilkan.
6. Hapus `SETUP_TOKEN` di Vercel lalu Redeploy. Login `accounting` > Price Master > pilih periode > upload file.
(Alternatif lokal: `npm install && npm run setup` dengan `.env.local`.)

## Alur input bulanan
- Menu **Input Mutasi** menampilkan semua item gudang dengan stok akhir bulan lalu. User mengetik jumlah **Masuk** dan **Keluar** per item; saldo dihitung otomatis. Klik **Simpan**, lalu **kunci bulan** bila sudah benar.
- Setiap item menyimpan satu total Masuk dan satu total Keluar per bulan (tanggal akhir bulan).
- Setelah terkunci, tabel yang sama dipakai untuk mengajukan koreksi dengan alasan; Accounting menyetujui atau menolak di menu **Approval**, yang disetujui langsung diterapkan.
- Accounting dapat **membuka kunci** bulan per gudang di menu Approval (alasan wajib, tercatat di riwayat). Permintaan yang masih menunggu untuk bulan itu otomatis ditolak; gudang lalu bisa mengubah tabel langsung dan mengunci lagi.
- Oktober 2026 (data import awal) otomatis terkunci. Tabel baru dibuat otomatis saat aplikasi pertama kali dibuka setelah update.

## Rekonsiliasi bulanan (Accounting)
- Menu **Rekonsiliasi**: bandingkan IN/OUT aplikasi (qty × harga × kurs) dengan nilai yang sudah tercatat di akun Persediaan GL **per plant (Sunter, KIIC, SC1, SC2)**; tidak dipisah per gudang/divisi (KIIC Maintenance + KIIC Stamping digabung jadi KIIC). Status kunci plant = Terkunci bila semua gudang di plant itu terkunci.
- **IN**: isi nilai IN yang sudah tercatat di Persediaan GL per plant; Reclass IN = IN sistem − IN di GL (+ = Dr Persediaan / Cr Beban).
- **OUT**: nilai di GL tidak diketahui, jadi tidak diinput. Seluruh OUT sistem dibebankan ke **Beban** (Dr Beban / Cr Persediaan).
- **Jurnal**: satu jurnal penyesuaian per plant sebesar nominal bersih = Reclass IN − OUT sistem (+ = Dr Persediaan / Cr Beban; − = Dr Beban / Cr Persediaan).
- Isi IN di GL per plant, simpan, lalu lihat draft jurnal; unduh Excel (jurnal + detail IN/OUT per barang) dan catat No. jurnal serta status diposting.

## Aturan penting
- Satu baris Excel = satu baris barang (kode yang sama bisa muncul beberapa kali di gudang yang sama, mis. sisi R/L).
- Stok awal = kolom STOCK SEP. IN/OUT Oktober masuk sebagai mutasi tertanggal 31 Okt 2026; mutasi berikutnya diinput gudang.
- Harga: **price master per periode (bulan)**. Saat upload, pilih periode; harga itu dipakai untuk jurnal adjustment/rekonsiliasi dan laporan/stok periode tersebut (tidak ada fallback ke periode lain). Upload ulang periode yang sama = mengganti seluruh harga periode itu. Data price master lama otomatis menjadi periode 2026-10. Kurs ke IDR masih satu untuk semua periode.
- Pemilihan harga per `Item_Code`: baris dengan **Start_Date terbaru** (≤ akhir periode; harga ≤ 0 diabaikan). Bila beberapa supplier punya Start_Date sama dengan harga beda, dipilih `Last_Update` terbaru dan ditandai.

## Detail barang & harga manual (halaman Stok)
- Klik **nama barang** untuk melihat stok per bulan (maks. 12 bulan sampai periode terpilih); klik **Edit** untuk mengubah informasi barang (kode hanya Accounting). Perubahan info tercatat di riwayat.
- **Accounting**: klik angka **Harga** untuk melihat semua opsi harga di price master periode itu (per supplier / Start_Date, maks. 10 terbaru per Item_Code) dan memilih harga lain, alasan wajib. Pilihan berlaku untuk **semua barang berkode sama di semua gudang** pada periode tersebut dan dipakai di nilai persediaan, laporan, dan rekonsiliasi. Pilih **Otomatis** untuk kembali ke Start_Date terbaru.
- Harga manual **tidak hilang** saat price master periode diupload ulang. Opsi harga hanya tersimpan untuk upload yang dilakukan setelah fitur ini aktif, jadi **upload ulang price master periode yang sudah ada** agar opsinya muncul.
- Rekonsiliasi plant yang sudah diposting akan menampilkan peringatan saat harga diubah.
