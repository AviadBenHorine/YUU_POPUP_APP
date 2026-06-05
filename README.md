# YUU — Pop-Up Restaurant Order Management System

> popup. food. vibe.

A mobile-first, iPad-optimised web app for managing orders at YUU pop-up restaurant. Built with React + Vite + TypeScript. No backend required — all data lives in `localStorage` / IndexedDB.

---

## 🚀 Running Locally

```bash
npm install
npm run dev
```

Open **http://localhost:5173** in Chrome or Edge.

---

## 🔑 Default PINs

| Role     | Default PIN | Default Route |
|----------|-------------|---------------|
| Admin    | `0000`      | `/analytics`  |
| Waitress | `1111`      | `/waitress`   |
| Kitchen  | `2222`      | `/kitchen`    |

PINs can be changed in **Settings → PIN Management** (Admin only).

---

## 📱 Browser Requirements

| Feature            | Requirement                             |
|--------------------|-----------------------------------------|
| Bluetooth printing | **Chrome or Edge** (Web Bluetooth API)  |
| Camera capture     | Any modern browser (iOS Safari works)   |
| Full app           | Any Chromium browser recommended        |

> Firefox and Safari do **not** support Web Bluetooth. A warning banner is shown on unsupported browsers. The app is fully functional without a printer.

---

## 🖨️ Bluetooth Printer Setup

1. Power on your ESC/POS thermal printer (EPSON TM, Xprinter, GOOJPRT, or compatible).
2. Ensure Bluetooth is enabled on the iPad/computer running Chrome.
3. Navigate to **Settings** (Admin login required).
4. Tap **"חבר מדפסת / Connect Printer"**.
5. Chrome will show a Bluetooth device picker — select your printer.
6. Tap **"הדפסת בדיקה / Test Print"** to verify.

The printer connection persists for the browser session. If it disconnects, repeat from step 4.

**Compatible:** Any ESC/POS printer exposing GATT service UUID `000018f0-0000-1000-8000-00805f9b34fb` or a standard SPP Serial Profile.

---

## 🌐 PWA Deployment

```bash
npm run build
# Deploy /dist to Netlify, Vercel, GitHub Pages, nginx, etc.
```

For PWA install on iPad: Safari → Share → Add to Home Screen → launch full-screen.

> Web Bluetooth requires Chrome/Edge even after PWA install.

---

## 🗂️ App Routes

```
/login             → Role selection + PIN entry (public)
/waitress          → Order-taking with drag & drop (Waitress + Admin)
/payment/:orderId  → Bit QR + photo confirmation (Waitress + Admin)
/kitchen           → Live kitchen tickets, auto-refresh (Kitchen + Admin)
/history           → All orders, filters, CSV export (Admin only)
/analytics         → KPI dashboard + charts (Admin only)
/settings          → Printer, Bit number, PINs, menu (Admin only)
```

---

## 💳 Payment Flow

1. Build order on `/waitress` (drag & drop, select Sit Down or Take Away).
2. Tap **"לתשלום"** → Bit QR code shown for exact total.
3. Customer scans and pays; waitress photographs confirmation screen.
4. Tap **"אשר ושלח למטבח"** — marks paid + sends to kitchen + prints ticket atomically.

An order **cannot** reach the kitchen without a captured payment proof image.

---

## 🔒 Security Notes

- PINs stored as plain-text in `localStorage` — appropriate for a single-device restaurant tool with no sensitive personal data.
- Payment images never leave the device (IndexedDB only).
- No network calls at runtime after initial load.
- Bluetooth initiated only by explicit user gesture (browser-enforced).
