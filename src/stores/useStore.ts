import { create } from 'zustand'
import type { MenuItem, Order, AppSettings, Role, OrderItem, OrderType } from '../types'
import { DEFAULT_MENU } from '../lib/menuData'
import { MOCK_ORDERS } from '../lib/mockOrders'

const LS_ORDERS = 'yuu_orders'
const LS_MENU = 'yuu_menu'
const LS_SETTINGS = 'yuu_settings'
const SS_ROLE = 'yuu_role'

const DEFAULT_SETTINGS: AppSettings = {
  bitQRImage: '',
  pins: { admin: '0000', waitress: '1111', kitchen: '2222' },
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
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_SETTINGS
}

function saveOrders(orders: Order[]) {
  localStorage.setItem(LS_ORDERS, JSON.stringify(orders))
}
function saveMenu(menu: MenuItem[]) {
  localStorage.setItem(LS_MENU, JSON.stringify(menu))
}
function saveSettings(settings: AppSettings) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings))
}

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
  // Auth
  currentRole: Role | null
  login: (role: Role) => void
  logout: () => void

  // Menu
  menuItems: MenuItem[]
  setMenuItems: (items: MenuItem[]) => void
  toggleItemAvailability: (id: string) => void

  // Orders
  orders: Order[]
  createOrder: (type: OrderType, items: OrderItem[]) => Order
  updateOrder: (id: string, patch: Partial<Order>) => void
  refreshOrders: () => void
  resetOrders: () => void

  // Active waitress order (in-progress, not yet saved)
  draftItems: OrderItem[]
  draftType: OrderType | null
  setDraftItems: (items: OrderItem[]) => void
  setDraftType: (type: OrderType | null) => void
  clearDraft: () => void

  // Settings
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  setPin: (role: Role, pin: string) => void

  // Toast
  toast: { message: string; type: 'success' | 'error' } | null
  showToast: (message: string, type?: 'success' | 'error') => void
  clearToast: () => void
}

export const useStore = create<AppState>((set, get) => {
  const storedRole = sessionStorage.getItem(SS_ROLE) as Role | null

  return {
    currentRole: storedRole,

    login(role) {
      sessionStorage.setItem(SS_ROLE, role)
      set({ currentRole: role })
    },
    logout() {
      sessionStorage.removeItem(SS_ROLE)
      set({ currentRole: null })
    },

    menuItems: loadMenu(),
    setMenuItems(items) {
      saveMenu(items)
      set({ menuItems: items })
    },
    toggleItemAvailability(id) {
      const items = get().menuItems.map(m =>
        m.id === id ? { ...m, available: !m.available } : m
      )
      saveMenu(items)
      set({ menuItems: items })
    },

    orders: loadOrders(),
    createOrder(type, items) {
      // Always read from localStorage so cross-tab updates (e.g. kitchen marking ready) are preserved
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
      }
      const updated = [...orders, order]
      saveOrders(updated)
      set({ orders: updated })
      return order
    },
    updateOrder(id, patch) {
      // Always read from localStorage to preserve cross-tab updates
      const orders = loadOrders().map(o => o.id === id ? { ...o, ...patch } : o)
      saveOrders(orders)
      set({ orders })
    },
    refreshOrders() {
      set({ orders: loadOrders() })
    },
    resetOrders() {
      orderCounter = 0
      saveOrders([])
      set({ orders: [] })
    },

    draftItems: [],
    draftType: null,
    setDraftItems(items) { set({ draftItems: items }) },
    setDraftType(type) { set({ draftType: type }) },
    clearDraft() { set({ draftItems: [], draftType: null }) },

    settings: loadSettings(),
    updateSettings(patch) {
      const settings = { ...get().settings, ...patch }
      saveSettings(settings)
      set({ settings })
    },
    setPin(role, pin) {
      const settings = { ...get().settings, pins: { ...get().settings.pins, [role]: pin } }
      saveSettings(settings)
      set({ settings })
    },

    toast: null,
    showToast(message, type = 'success') {
      set({ toast: { message, type } })
      setTimeout(() => set({ toast: null }), 3500)
    },
    clearToast() { set({ toast: null }) },
  }
})
