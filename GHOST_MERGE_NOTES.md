# Integrasi update ghost GitHub

## Status Git

- Remote: `https://github.com/daffazub/shadow_of_abandoned.git`.
- Basis lokal sebelum integrasi: `e78b0cc`.
- Commit teman yang diambil: `703bbe4` — `Jam terbang`.
- Integrasi Git dilakukan dengan fast-forward ke commit tersebut, kemudian perubahan lokal dipulihkan dan konflik diselesaikan. Tidak dibuat commit baru atau push.
- Perubahan integrasi dan pekerjaan lokal tetap berada di working tree untuk diperiksa sebelum commit.

## Pengamanan

Sebelum integrasi, 24 file lokal yang berubah/belum terlacak disalin beserta manifest SHA-256 ke:

`.git/agent-backups/pre-ghost-merge-2026-11-13.zip`

Snapshot Git juga dipertahankan sebagai stash dengan pesan:

`Safety backup before ghost integration 2026-11-13`

Jangan menjalankan `stash pop/apply` lagi di atas hasil integrasi ini: snapshot tersebut sudah diterapkan, dan disimpan hanya untuk pemulihan. Backup ada di metadata lokal `.git`, bukan di GitHub. Jangan menghapusnya sampai hasil gameplay/commit baru sudah dianggap aman.

## Konflik dan keputusan integrasi

### Kontrol pemain

Konflik teks berada pada `PlayerController.handleMovement()`: lokal memakai `controlsLocked`, update GitHub memakai `frozen`. Keduanya dipertahankan dan dihubungkan ke penguncian gerak, mouse, input, serta penggunaan baterai. Interaksi juga menolak pemain yang terkunci/tertangkap. Mekanisme gerak raycast yang sudah bekerja tidak diganti.

### Satu pemilik logika ghost

`MonsterManager` menjadi satu-satunya pemilik model, pengejaran, animasi, audio pengejaran, timer kemunculan, dan penangkapan. `EnvironmentManager.startEntityPursuit()` serta `stopEntityPursuit()` tetap tersedia sebagai entry point kompatibilitas, tetapi hanya meneruskan ke manager tersebut. Implementasi/model ghost kedua di EnvironmentManager sudah dilepas.

Logika penghindaran halangan, pemilihan titik muncul, dan pemulihan saat tersangkut dari update teman dipertahankan dan disesuaikan:

- Gerbang restricted hanya menyiapkan aset. Pengejaran dimulai ketika Restricted Wing benar-benar dimuat, lalu diinisialisasi ulang untuk laboratorium.
- Dalam zona aman atau saat senter bekerja (menyala, baterai ada, intensitas cukup), ghost tidak terlihat dan tidak dapat menangkap pemain.
- Dalam gelap, ghost terlihat dan mengejar. Penangkapan memerlukan paparan gelap minimal 8 detik, jarak dekat, lantai yang sesuai, dan jalur tanpa dinding ke pemain.
- Timer, gerak, paparan gelap, serta animasi pengejaran dijeda saat kontrol terkunci, dokumen dibaca, transisi, atau tab tersembunyi.
- Penangkapan mengirim `ending_requested` dengan ending C. Tidak ada overlay/reload tertangkap terpisah yang menabrak ending A/B/C.
- Akhir permainan menghentikan pengejaran dan tombol debug tidak dapat menghidupkannya kembali.
- Load model yang selesai terlambat tidak dapat menghidupkan kembali ghost setelah despawn/dispose. Jika model gagal dimuat, fallback tetap mengikuti aturan yang sama.

### Kepemilikan mesh dan aset

SceneManager kini mencatat mesh hasil pemuatan lingkungan secara eksplisit, bukan seluruh mesh baru yang kebetulan muncul selama operasi async. Ini mencegah model ghost/preload lain ikut terhapus saat lingkungan lama dibersihkan.

Model runtime memakai `public/assets/models/monster/smiley_monster.glb`. File lokal lama `public/assets/models/entity/ghost_entity.glb` identik secara hash; dibiarkan tersimpan agar pekerjaan/aset lokal tidak dihapus diam-diam, tetapi tidak lagi dimuat oleh game. Kredit/lisensi dari README teman dipertahankan dan kredit Bento ditambahkan ke menu.

## Cakupan visual dan storyboard

Sesuai keputusan terbaru, prototipe serta penyederhanaan cerita/visual tetap dipertahankan. Storyboard tidak diubah otomatis. Area memakai koridor GLB yang sama, bukan set lokasi baru yang identik dengan ilustrasi storyboard. Intro dan ending masih memakai penyajian prototipe. Integrasi ini tidak mengklaim seluruh adegan storyboard telah diwujudkan persis.

## Validasi dan uji manual

Jalankan:

```sh
npm test
npm run build
git --no-pager diff --check
```

Tes mencakup manager runtime tunggal, jeda dokumen, aturan cahaya, ending, konflik frozen/controlsLocked, lifecycle async, kepemilikan preload, serta spawn/navigasi dasar pada geometri koridor GLB asli. Material/tekstur GLB tidak dirender oleh tes headless.

Uji manual browser tetap diperlukan untuk tampilan monster, orientasi animasi, pencahayaan, suara, dan kualitas navigasi. AI menggunakan raycast steering, bukan navmesh penuh. Aset monster terkompresi meshopt; pemuatan decoder bawaan Babylon dapat memerlukan jaringan. Jika gagal, fallback digunakan.

Panduan rute dan checklist gameplay ada di `GAMEPLAY_TESTING.md`.
