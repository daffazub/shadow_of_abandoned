# Perbaikan Corridor GLB dan Collision

## Perubahan

1. `public/assets/models/corridor_baru.glb`
   - Memperbaiki material `TextureMaterial_9` pada mesh `BackSide_0` yang sebelumnya memiliki alpha factor `0.0`.
   - Mengubah material sisi belakang menjadi `OPAQUE` dan `doubleSided`.
   - Mengubah channel alpha tekstur kayu menjadi opaque sambil mempertahankan seluruh nilai RGB, ukuran, UV, geometri, dan tekstur visual.

2. `src/systems/SceneManager.js`
   - Menambahkan pengaman material untuk mesh `BackSide_0` ketika GLB lama masih dipakai.
   - Menghapus empat collision test box yang tidak terlihat tetapi masih aktif dan dapat menghalangi pemain.

3. `src/systems/PlayerController.js`
   - Mengganti satu raycast dari titik tengah kamera dengan `camera.moveWithCollisions()` yang memakai ellipsoid kamera.
   - Membatasi delta gerak per frame untuk mengurangi risiko menembus geometri ketika FPS turun.

## Validasi yang dilakukan

- GLB berhasil diparse kembali sebagai glTF 2.0.
- Jumlah mesh dan material tetap 10.
- Material `BackSide_0` sekarang alpha 1, mode OPAQUE, dan double-sided.
- Tekstur kayu tetap berukuran 128x512; nilai RGB dipertahankan dan alpha menjadi opaque.
- `node --check` lolos untuk `SceneManager.js` dan `PlayerController.js`.

## Catatan

Build Vite dan pengujian visual/collision di browser belum dijalankan karena `node_modules` belum tersedia pada lingkungan pemeriksaan. Jalankan `npm install` lalu `npm run dev` untuk pengujian game secara langsung.
