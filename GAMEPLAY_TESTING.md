# Panduan uji gameplay web

## Menjalankan game

Dari root proyek:

```sh
npm run dev
```

Buka alamat Local yang dicetak Vite (biasanya http://localhost:3000; port dapat bergeser jika sedang dipakai). Klik **Play**. Intro berlangsung sekitar 22 detik; **Space** dapat melewatinya setelah 3 detik. Jika mouse belum terkunci, klik canvas game. Tekan **Esc** untuk melepas mouse.

Kontrol: **WASD** bergerak, **mouse** melihat, **F** senter, **E** interaksi, **X** menutup dokumen. Dekati dan arahkan pandangan ke objek sampai petunjuk interaksi muncul. Tombol **P** mencetak koordinat pemain di console browser; **G** mencetak diagnostik gerbang.

## Alur koridor dan area baru

1. Ambil Ward Key di meja sekitar x=-1, z=-6.2. Buka gerbang pertama dengan E di sekitar x=1.2, z=-5.225.
2. Jelajahi koridor dan baca dokumen. Ambil Restricted Key sekitar x=8.4, z=3.15.
3. Buka Restricted Gate sekitar x=7.6, z=-5.225. Lewati gerbang ke arah timur: transisi dipicu saat x>8.1 dan z dekat -5.225. Membuka gerbang saja belum memindahkan area.
4. Di **Restricted Wing**, ikuti koridor ke depan. Cahaya aman dan senter yang menyala melindungi pemain. Ambil baterai bila diperlukan.
5. Di gerbang bertanda LABORATORY AHEAD (z=12.6), buka pintu laboratorium dengan E lalu berjalan melewatinya. HUD harus berubah menjadi **Experiment Laboratory**. Kunci dan jumlah dokumen harus tetap tersimpan.

## Ketiga ending

Ulangi permainan untuk menguji setiap ending secara terpisah.

- **A — Escape:** di laboratorium, buka gerbang bertanda EXIT (z=12.6) dengan E, lalu berjalan melewatinya. Layar Ending A dan tombol Play Again harus muncul sekali.
- **B — Destroy machine:** gunakan sakelar merah dekat mesin (x=0.85, z=8.5) dengan E. Kontrol dikunci selama sekuens sekitar 5 detik, lalu Ending B muncul. Generator POWER terpisah dan dapat dinyalakan untuk menambah cahaya aman, tetapi bukan syarat sakelar penghancur.
- **C — Darkness:** di Restricted Wing atau laboratorium, matikan senter dengan F dan berdiri di luar zona cahaya aman. Entitas mendekat; ending terjadi setelah paparan gelap minimal 8 detik **dan** entitas cukup dekat. Waktunya dapat lebih lama jika entitas jauh. Membaca dokumen menghentikan sementara ancaman.

## Checklist browser

- Menu, Controls, Credits, intro penuh, dan skip intro bekerja.
- WASD tetap bekerja sesudah intro, membaca dokumen, dan perpindahan area.
- Tidak menembus dinding/pintu tertutup; pintu terbuka dapat dilewati.
- Gerbang tidak terbalik/melayang/melewati plafon dan berada pada bukaan koridor asli.
- Restricted Wing dan laboratorium memakai model/tekstur koridor yang sama dengan area awal, bukan ruangan kotak prosedural.
- Dokumen tetap di atas meja dan baterai tidak muncul di plafon.
- Lampu di seluruh Restricted Wing benar-benar menerangi lantai, termasuk zona paling belakang.
- Senter mengikuti kamera; baterai menurun dan pickup menambahnya.
- Hanya satu ghost aktif: tersembunyi saat pemain berada di zona aman/senter bekerja, terlihat dan mengejar dalam gelap; tidak menghalangi interaksi.
- Pengejaran dimulai setelah masuk Restricted Wing, bukan hilang setelah baru membuka gerbang.
- Ghost, waktu paparan gelap, serta timer kemunculan berhenti selama dokumen/transisi/tab tersembunyi. Tidak ada layar tertangkap kedua setelah ending.
- Setelah berpindah ke laboratorium, model ghost masih dapat digunakan, tidak terhapus bersama koridor lama.
- Dokumen dapat ditutup dengan tombol, backdrop, atau X; gerak dan ancaman pulih sesudahnya.
- Transisi menutup layar dengan teks area dan tidak memicu dua pemuatan.
- Ending A/B/C tampil terbaca, cursor/tombol replay bekerja, dan efek cerita tidak hidup lagi sesudah ending.
- Periksa console browser untuk error runtime dan Network untuk aset gagal dimuat.

## Validasi otomatis

Dengan dependency proyek terpasang dan Node 24:

```sh
npm test
npm run build
git --no-pager diff --check
```

Detail cakupan dan batasan harness: `tests/README.md`. Catatan penggabungan update GitHub: `GHOST_MERGE_NOTES.md`.

## Batasan saat ini

Semua area utama, termasuk Restricted Wing dan laboratorium, memakai `public/assets/models/corridor_baru.glb`. Area cerita menggunakan putaran/pergeseran model tanpa peregangan; ukuran ruang, tekstur, dan detail arsitektur asli dipertahankan. Pencahayaan, penanda, pintu, dan item membedakan fungsi area. Laboratorium masih berupa area eksperimen di dalam bangunan koridor yang sama, bukan model laboratorium khusus. Ruang prosedural sederhana hanya menjadi cadangan jika GLB gagal dimuat. Pengejaran kini dimiliki satu `MonsterManager`, memakai raycast untuk menghindari dinding dan memvalidasi lantai/titik muncul (belum navmesh/pathfinding penuh); perlindungan senter berdasarkan status cahaya, bukan arah kerucut terhadap entitas. Gerakan menggunakan raycast horizontal yang sudah dipakai proyek, bukan collision capsule penuh; tabrakan koridor/aset seperti lift masih perlu validasi visual. Ending disajikan sebagai overlay, bukan sinematik lengkap.

Tes NullEngine menguji logika, geometri sintetis, serta geometri file GLB asli (jalur, tinggi lantai, akses item, dan penempatan gerbang), tetapi tidak memvalidasi rendering browser atau tampilan teksturnya. Build sukses tidak membuktikan gameplay visual sudah benar. Migrasi Unity/C# tetap milestone setelah versi web selesai diuji.
