import { create } from 'zustand'
import type { MenuItem, Order, AppSettings, Role, OrderItem, OrderType } from '../types'
import { DEFAULT_MENU } from '../lib/menuData'
import { MOCK_ORDERS } from '../lib/mockOrders'

const LS_ORDERS = 'yuu_orders'
const LS_MENU = 'yuu_menu'
const LS_SETTINGS = 'yuu_settings'
const SS_ROLE = 'yuu_role'

const DEFAULT_SETTINGS: AppSettings = {
  bitQR1: '/qr1.jpeg',
  bitQR2: '',
  bitQR3: '',
  activeQRSlot: 1,
  stockQuantities: {},
  pins: { admin: '0000', waitress: '1111', kitchen: '2222', bar: '3333' },
  dessertTo: 'kitchen',
  requirePaymentPhoto: true,
}

function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(LS_ORDERS)
    if (raw) return JSON.parse(raw)
  } catch {}
  const orders = MOCK_ORDERS
  localStorage.setItem(LS_ORDERS, JSON.stringify(orders))
  return orders
}

function loadMenu(): MenuItem[] {
  try {
    const raw = localStorage.getItem(LS_MENU)
    if (raw) return JSON.parse(raw)
  } catch {}
  localStorage.setItem(LS_MENU, JSON.stringify(DEFAULT_MENU))
  return DEFAULT_MENU
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (parsed.bitQRImage && !parsed.bitQR1) {
        parsed.bitQR1 = parsed.bitQRImage
        delete parsed.bitQRImage
      }
      // Deep-merge nested pins so new roles (bar) always get their default PIN
      const mergedPins = { ...DEFAULT_SETTINGS.pins, ...(parsed.pins as Record<string, string> ?? {}) }
      return { ...DEFAULT_SETTINGS, ...parsed, pins: mergedPins } as AppSettings
    }
  } catch {}
  return DEFAULT_SETTINGS
}

function saveOrders(orders: Order[]) { localStorage.setItem(LS_ORDERS, JSON.stringify(orders)) }
function saveMenu(menu: MenuItem[])   { localStorage.setItem(LS_MENU,   JSON.stringify(menu))   }
function saveSettings(s: AppSettings) { localStorage.setItem(LS_SETTINGS, JSON.stringify(s))   }

let orderCounter = 0

function nextOrderId(orders: Order[]): string {
  if (orderCounter === 0) {
    const nums = orders.map(o => parseInt(o.id.replace('YUU-', ''), 10)).filter(n => !isNaN(n))
    orderCounter = nums.length > 0 ? Math.max(...nums) : 0
  }
  orderCounter++
  return `YUU-${String(orderCounter).padStart(4, '0')}`
}

interface AppState {
  currentRole: Role | null
  login: (role: Role) => void
  logout: () => void

  menuItems: MenuItem[]
  setMenuItems: (items: MenuItem[]) => void
  toggleItemAvailability: (id: string) => void

  orders: Order[]
  createOrder: (type: OrderType, items: OrderItem[], customerName?: string) => Order
  updateOrder: (id: string, patch: Partial<Order>) => void
  refreshOrders: () => void
  resetOrders: () => void

  draftItems: OrderItem[]
  draftType: OrderType | null
  setDraftItems: (items: OrderItem[]) => void
  setDraftType: (type: OrderType | null) => void
  clearDraft: () => void

  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  setPin: (role: Role, pin: string) => void
  updateStockQuantity: (menuItemId: string, qty: number | null) => void
  decrementStockForItems: (items: OrderItem[]) => void

  toast: { message: string; type: 'success' | 'error' } | null
  showToast: (message: string, type?: 'success' | 'error') => void
  clearToast: () => void
}

export const useStore = create<AppState>((set, get) => {
  const storedRole = sessionStorage.getItem(SS_ROLE) as Role | null
  return {
    currentRole: storedRole,
    login(role)  { sessionStorage.setItem(SS_ROLE, role); set({ currentRole: role }) },
    logout()     { sessionStorage.removeItem(SS_ROLE);    set({ currentRole: null }) },

    menuItems: loadMenu(),
    setMenuItems(items) { saveMenu(items); set({ menuItems: items }) },
    toggleItemAvailability(id) {
      const items = get().menuItems.map(m => m.id === id ? { ...m, available: !m.available } : m)
      saveMenu(items); set({ menuItems: items })
    },

    orders: loadOrders(),
    createOrder(type, items, customerName) {
      const orders = loadOrders()
      const totalPrice = items.reduce((sum, oi) => {
        const mi = get().menuItems.find(m => m.id === oi.menuItemId)
        return sum + (mi?.price ?? 0) * oi.quantity
      }, 0)
      const order: Order = {
        id: nextOrderId(orders),
        orderType: type,
        items,
        totalPrice,
        status: 'awaiting_payment',
        createdAt: new Date().toISOString(),
        paymentMethod: 'bit',
        customerName: customerName?.trim() || undefined,
      }
      const updated = [...orders, order]
      saveOrders(updated); set({ orders: updated })
      return order
    },
    updateOrder(id, patch) {
      const orders = loadOrders().map(o => o.id === id ? { ...o, ...patch } : o)
      saveOrders(orders); set({ orders })
    },
    refreshOrders() { set({ orders: loadOrders() }) },
    resetOrders()   { orderCounter = 0; saveOrders([]); set({ orders: [] }) },

    draftItems: [],
    draftType: null,
    setDraftItems(items) { set({ draftItems: items }) },
    setDraftType(type)   { set({ draftType: type }) },
    clearDraft()         { set({ draftItems: [], draftType: null }) },

    settings: loadSettings(),
    updateSettings(patch) {
      const settings = { ...get().settings, ...patch }
      saveSettings(settings); set({ settings })
    },
    setPin(role, pin) {
      const settings = { ...get().settings, pins: { ...get().settings.pins, [role]: pin } }
      saveSettings(settings); set({ settings })
    },
    updateStockQuantity(menuItemId, qty) {
      const { settings, menuItems } = get()
      const newQty = { ...settings.stockQuantities }
      if (qty === null || qty <= 0) {
        delete newQty[menuItemId]
      } else {
        newQty[menuItemId] = qty
        // Re-enable item if it was auto-disabled when stock hit zero
        const item = menuItems.find(m => m.id === menuItemId)
        if (item && !item.available) {
          const newMenu = menuItems.map(m => m.id === menuItemId ? { ...m, available: true } : m)
          saveMenu(newMenu)
          set({ menuItems: newMenu })
        }
      }
      const ns = { ...settings, stockQuantities: newQty }
      saveSettings(ns); set({ settings: ns })
    },
    decrementStockForItems(items) {
      const { settings, menuItems } = get()
      let newQty = { ...settings.stockQuantities }
      let newMenu = [...menuItems]
      let changed = false
      for (const oi of items) {
        const rem = newQty[oi.menuItemId]
        if (rem !== undefined) {
          const after = rem - oi.quantity
          if (after <= 0) {
            newMenu = newMenu.map(m => m.id === oi.menuItemId ? { ...m, available: false } : m)
            delete newQty[oi.menuItemId]
          } else {
            newQty[oi.menuItemId] = after
          }
          changed = true
        }
      }
      if (changed) {
        const ns = { ...settings, stockQuantities: newQty }
        saveSettings(ns); saveMenu(newMenu)
        set({ settings: ns, menuItems: newMenu })
      }
    },

    toast: null,
    showToast(message, type = 'success') {
      set({ toast: { message, type } })
      setTimeout(() => set({ toast: null }), 3500)
    },
    clearToast() { set({ toast: null }) },
  }
})
