# DArchive LAZIR DIZAM

## Menjalankan aplikasi di komputer sendiri

1. Pastikan Node.js 22.13 atau lebih baru sudah terpasang.
2. Buka folder proyek di VS Code, pilih **Terminal > New Terminal**, lalu jalankan sekali:

   ```powershell
   npm install
   ```

3. Jalankan aplikasi:

   ```powershell
   npm run dev
   ```

4. Buka alamat yang ditampilkan Vite, biasanya <http://localhost:5173>.

Perintah tersebut menjalankan situs dan backend lokal sekaligus. Tidak perlu membuat akun Supabase, memasang PostgreSQL, menjalankan perintah database, atau mengisi URL/key Supabase. Akun dan koleksi tersimpan di `server/data/movie-vault.sqlite` pada komputer ini. File database dibuat otomatis dan tidak dimasukkan ke Git.

Dashboard menampilkan statistik koleksi yang mengikuti perubahan secara langsung. Klik kartu statistik untuk memfilter daftar; cari film berdasarkan judul/tahun/catatan, urutkan koleksi, tambahkan catatan pribadi, dan urungkan penghapusan dalam beberapa detik.

## Keamanan lokal

- Backend hanya mendengarkan koneksi dari komputer sendiri (`127.0.0.1`).
- Password disimpan sebagai hash scrypt dengan salt acak, bukan teks biasa.
- Sesi memakai cookie `HttpOnly` dan `SameSite=Strict`; token sesi disimpan dalam bentuk hash.
- Upaya login dibatasi sementara setelah beberapa percobaan gagal, dan permintaan perubahan ditolak jika origin bukan aplikasi lokal.
- Gunakan password minimal 10 karakter. Jangan bagikan file `server/data/movie-vault.sqlite` karena berisi akun dan koleksi lokal.

Keamanan ini ditujukan untuk penggunaan localhost, bukan untuk mengekspos backend ke internet atau menjalankan aplikasi sebagai layanan publik.

## API film

TMDB dipakai untuk katalog dan detail film; OMDb menambah hasil pencarian bila key tersedia. Isi `VITE_TMDB_KEY` dan `VITE_OMDB_KEY` di `.env.local` untuk mengaktifkannya. API key berawalan `VITE_` dikirim ke browser, jadi jangan masukkan password atau kunci privat di sana.
