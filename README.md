# Tradesys Edge Crypto v2 · Entry Menurut Lebar Zona


> **Versi 2.** Sama dengan Tradesys Edge Crypto (v1), dengan satu perbedaan aturan entry SMC berdasarkan **lebar zona**: zona yang lebarnya **lebih dari 2,5%** memakai entry di **tengah zona**; zona yang lebarnya **2,5% atau kurang** memakai entry di **batas atas zona** (sentuhan pertama). Buy limit di level entry itu boleh dipasang begitu setup muncul. Lebar zona = (batas atas − batas bawah) ÷ batas bawah, dan ditampilkan di tabel Analysis, kartu rencana dan Watchlist. Ambang 2,5% bisa diubah di Settings → Parameter. Stop, TP, regime, RS, risiko dan semua tab lainnya sama.
>
> Data v2 (jurnal, posisi, plan, pengaturan, notifikasi) tersimpan terpisah dari v1, walaupun keduanya di-hosting di haedar-collab.github.io. Backup v1 bisa dipulihkan ke v2; plan yang terkunci dari v1 tidak ikut, karena levelnya dihitung dengan entry tengah zona.

> 🇬🇧 **English:** a free, single-file Binance Spot **long-only** signal app: BTC regime + relative strength vs BTC + SMC zones, with a trade plan, positions & risk, journal and review. Signals only — it never places orders. Deploy by uploading `index.html` to GitHub Pages (section 1). Use the **ID | EN** switch in the top-right corner.

Versi web mandiri dari dashboard **Tradesys Edge Crypto** di claude.ai. Mesin analisanya sama persis (regime BTC, relative strength vs BTC, SMC 4H + trigger 1H, technical analysis, zone quality, price action, backtest 2 tahun), tapi berjalan di browser tanpa claude.ai. Dashboard di claude.ai tetap ada dan tidak berubah.

- **Biaya: Rp0.** Satu file `index.html`, tanpa server, database, maupun API key.
- **Data:** Binance Public API (`data-api.binance.vision`, cadangan `api.binance.com`); CoinGecko publik untuk dominasi BTC dan float.
- **Privasi:** jurnal, posisi, trading plan dan pengaturan tersimpan di browser Anda sendiri.
- **Aman:** hanya sinyal dan alert. Tidak ada koneksi ke akun Binance dan tidak pernah memasang order.

---

## 1. Deploy gratis (GitHub Pages)
1. Login ke https://github.com, klik **+ → New repository**.
2. Nama repo: `tradesys-crypto-v2`, pilih **Public**, lalu **Create repository**.
3. **Add file → Upload files**, unggah `index.html` dan `README.md`, lalu **Commit changes**.
4. **Settings → Pages** → Source **Deploy from a branch**, Branch **main**, folder **/ (root)** → **Save**.
5. Tunggu 1–3 menit, lalu buka `https://USERNAME.github.io/tradesys-crypto-v2/`.
6. Update: unggah ulang `index.html` versi baru.

Alternatif: Cloudflare Pages (Upload assets) atau Netlify Drop, sama seperti Precision Zone.

**Pasang di HP:** Chrome Android → menu ⋮ → **Add to Home screen**; Safari iPhone → Share → **Add to Home Screen**.

---

## 2. Tab
| Tab | Isi |
|---|---|
| **Today** | Keputusan hari ini (trade / tidak), action items, regime, exposure, P/L bulan ini |
| **Market** | Regime BTC, relative strength semua pair USDT, early movers, leaders |
| **Analysis** | Trade plan per koin (Enter now · Get ready · Watch · Skip), chart, price action, technical analysis, zone quality, backtest 2 tahun |
| **Signals** | Sinyal aktif dengan entry, SL, TP1/TP2, ukuran posisi |
| **Positions & Risk** | Posisi terbuka, exposure vs batas regime, korelasi, event risk |
| **Journal & Review** | Jurnal R, win rate, edge check, review mingguan/bulanan, export CSV |
| **Entry guide** | Langkah eksekusi dan aturan sistem |
| **Settings** | Cakupan scan (semua crypto / koin pilihan), volume minimum 24 jam, trading plan, parameter, **backup/restore data**, notifikasi browser |

Di HP, navigasi ada di bawah: Today, Market, Analysis, Signals, dan **More** untuk tab lainnya.

---

## 3. Kapan scan berjalan
- Saat halaman dibuka, setiap 15 menit selama halaman terbuka, dan 3 menit setelah setiap candle 4H tutup (03:03 · 07:03 · 11:03 · 15:03 · 19:03 · 23:03 WIB).
- **Alert Telegram** tetap dikirim oleh workflow GitHub Actions (`regime-radar-satu-file.yml`) setiap 4 jam, walaupun halaman ini tertutup.
- Opsional: aktifkan **notifikasi browser** di Settings untuk alert selama halaman terbuka.

## 3a. Data realtime (WebSocket)
Aplikasi membuka dua sambungan WebSocket ke stream data pasar publik Binance. Keduanya hanya membaca data, tanpa akun dan tanpa API key.
- **Harga:** stream `!miniTicker@arr` membawa harga terakhir dan perubahan 24 jam semua pair, kira-kira setiap detik. Stream ini menggerakkan tabel, P&L live, dan alert TP/SL/masuk zona.
- **Candle:** setiap chart yang sedang tampil (1D/4H/1H/15m) berlangganan stream `kline` untuk koin dan timeframe-nya. Candle yang sedang terbentuk (high/low/close/volume) dan garis EMA bergerak tick demi tick. Candle baru langsung muncul saat candle sebelumnya tutup. Langganan otomatis berpindah saat Anda mengganti timeframe atau membuka/menutup chart (maksimal 40 stream).
- **Status** tampil di baris Live: *WebSocket · prices + candles*, *WebSocket · prices*, atau *REST polling*. Bila WebSocket terputus, aplikasi otomatis kembali ke polling REST setiap 15 detik dan mencoba menyambung ulang.
- Saat tab disembunyikan, stream candle ditutup untuk menghemat baterai dan kuota, lalu dibuka lagi saat tab tampil kembali.
- **Sinyal BUY tetap dihitung dari candle 4H yang sudah tutup.** WebSocket membuat tampilan dan alert lebih cepat, tetapi tidak mengubah aturan sinyal.

## 4. Data & backup
- Semua data ada di `localStorage` browser. Ganti browser/HP = data kosong.
- **Settings → Data in this browser → Download backup** untuk menyimpan file JSON; **Restore from backup** untuk memulihkannya di perangkat lain.
- Data web app terpisah dari dashboard claude.ai (jurnal tidak otomatis tersinkron).

## 5. Perbedaan v1 dan v2
| | v1 | v2 |
|---|---|---|
| Entry SMC | Tengah zona | **Lebar zona > 2,5%: tengah zona · ≤ 2,5%: batas atas zona** |
| Cara masuk | Hanya setelah konfirmasi (BUY) | Buy limit di level entry boleh langsung dipasang; konfirmasi di zona tetap jadi BUY |
| Info lebar zona | Tidak ada | Ditampilkan (%) |
| Peluang terisi | Lebih kecil | Lebih besar (cukup menyentuh zona) |
| Alert Telegram GitHub | Ya (workflow v1) | Belum: hanya notifikasi dari halaman web |

Backtest 2 tahun, 12 koin besar, playbook SMC (hanya informasi):
| Varian | Trade | Win rate | Rata-rata | Total |
|---|---|---|---|---|
| v1: tengah zona, konfirmasi saja (bawaan v1) | 138 | 43% | −0,02R | −3,0R |
| v2: aturan lebar zona, buy limit (bawaan v2) | 523 | 45% | −0,04R | −20,9R |
| v2: aturan lebar zona, konfirmasi saja | 141 | 38% | −0,20R | −28,5R |

## 6. Batasan versi web
- Berita per koin belum tersedia (di claude.ai memakai connector CoinGecko).
- Kalender ekonomi AS (event risk) diambil dari feed ForexFactory; bila browser memblokirnya, event risk tampil "tidak tersedia".
- Float/market cap dari CoinGecko publik bisa terkena batas request; hasilnya di-cache 7 hari.

**Disclaimer:** alat bantu analisis, bukan nasihat keuangan.
