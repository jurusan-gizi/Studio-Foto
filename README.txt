STUDIO PAS FOTO — PWA offline
=============================
Cara pasang di GitHub Pages:
1. Buat repository baru (mis. "pasfoto"), unggah SEMUA isi folder ini
   (index.html, app.js, style.css, sw.js, manifest.webmanifest, folder icons/ dan engine/).
   Catatan: folder engine/data berisi model AI ±65 MB (17 file @ maks 4 MB) — unggah lewat
   GitHub Desktop atau "git push" bila unggah lewat browser terasa berat.
2. Settings → Pages → Source: branch main, folder / (root) → Save.
3. Buka https://<akun>.github.io/pasfoto/ satu kali dengan internet.
   Tunggu tombol kanan atas berubah "✓ Siap offline".
4. Di HP (Chrome): menu ⋮ → "Instal aplikasi / Tambahkan ke layar utama".
   Setelah itu aplikasi bisa dipakai tanpa internet.

Catatan:
- Foto diproses di perangkat; tidak ada yang dikirim ke server.
- Mesin hapus latar: @imgly/background-removal (lisensi AGPL-3.0) + ONNX Runtime Web.
- Bila memperbarui aplikasi, naikkan versi 'pasfoto-shell-v1' di sw.js.
