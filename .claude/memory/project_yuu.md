---
name: project-yuu
description: YUU pop-up restaurant order management system — React/Vite/TypeScript app at /Users/aviadbenhorine/Desktop/YUU project
metadata:
  type: project
---

Full-stack React + Vite app built for YUU pop-up restaurant. Fully working, no backend.

**Why:** Manages the full order lifecycle from waitress iPad → Bit payment confirmation → thermal printer kitchen ticket.

**How to apply:** When working on this project, check all 7 routes are covered, keep the enforced payment-before-kitchen flow intact, and use individual Zustand selectors (not object selectors) to avoid infinite render loops.

## Key tech decisions
- Zustand v5 — must use individual `useStore(s => s.field)` selectors, NOT `useStore(s => ({ a: s.a, b: s.b }))` (causes infinite loops)
- IndexedDB via `idb` for payment proof images; `localStorage` for orders/menu/settings
- Web Bluetooth for ESC/POS thermal printer (Chrome/Edge only)
- RTL first: `<html dir="rtl">`, Heebo font, Hebrew primary labels

## Routes & access
- `/login` — public, PIN-based role selection
- `/waitress` — Waitress + Admin, dnd-kit drag & drop
- `/payment/:orderId` — Waitress + Admin, Bit QR + photo capture
- `/kitchen` — Kitchen + Admin, polls every 5s
- `/history` — Admin only
- `/analytics` — Admin only (default after admin login)
- `/settings` — Admin only

## Default PINs
- Admin: 0000 → /analytics
- Waitress: 1111 → /waitress
- Kitchen: 2222 → /kitchen

## Mock data
12 pre-loaded orders in `src/lib/mockOrders.ts`, 15 menu items in `src/lib/menuData.ts`.
