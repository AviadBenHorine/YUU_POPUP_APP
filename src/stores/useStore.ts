import { create } from 'zustand'
import type { MenuItem, Order, AppSettings, Role, OrderItem, OrderType } from '../types'
import { DEFAULT_MENU } from '../lib/menuData'
import { MOCK_ORDERS } from '../lib/mockOrders'
import { pushSettings, pushOrder, pushMenu, clearOrders, deleteOrderDoc, reserveOrderId, resetOrderCounter } from '../services/firebase'

const LS_ORDERS   = 'yuu_orders'
const LS_MENU     = 'yuu_menu'
const LS_SETTINGS = 'yuu_settings'
const SS_ROLE     = 'yuu_role'

let _toastTimer: ReturnType<typeof setTimeout> | null = null

export const DEFAULT_SETTINGS: AppSettings = {
  bitQR1: '/qr1.jpeg',
  bitQR2: '',
  bitQR3: '',
  activeQRSlot: 1,
  stockQuantities: {},
  pins: { admin: '0000', waitress: '1111', kitchen: '2222', bar: '3333' },
  dessertTo: 'kitchen',
  requirePaymentPhoto: true,
  printerEnabled: false,
  printInHebrew: false,
  quickTags: ['ללא חלב', 'לא חריף', 'ללא כוסברה', 'ללא גלוטן', 'ללא בצל', 'ללא שום', 'ללא אגוזים', 'טבעוני'],
  agingEnabled: true,
  agingYellowMins: 5,
  agingRedMins: 10,
  bellEnabled: true,
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
      const mergedPins = { ...DEFAULT_SETTINGS.pins, ...(parsed.pins as Record<string, string> ?? {}) }
      return { ...DEFAULT_SETTINGS, ...parsed, pins: mergedPins } as AppSettings
    }
  } catch {}
  return DEFAULT_SETTINGS
}

function saveOrders(orders: Order[])  { localStorage.setItem(LS_ORDERS,   JSON.stringify(orders)) }
function saveMenu(menu: MenuItem[])   { localStorage.setItem(LS_MENU,     JSON.stringify(menu))   }
function saveSettings(s: AppSettings) { localStorage.setItem(LS_SETTINGS, JSON.stringify(s))      }


interface AppState {
  currentRole: Role | null
  login:  (role: Role) => void
  logout: () => void

  menuItems: MenuItem[]
  setMenuItems:           (items: MenuItem[]) => void
  toggleItemAvailability: (id: string) => void
  _setMenuFromRemote:     (items: MenuItem[]) => void

  orders: Order[]
  createOrder:          (type: OrderType, items: OrderItem[], customerName?: string, customerPhone?: string) => Promise<Order>
  updateOrder:          (id: string, patch: Partial<Order>) => void
  removeOrder:          (id: string) => void
  refreshOrders:        () => void
  resetOrders:          () => Promise<void>
  _setOrdersFromRemote: (orders: Order[]) => void

  draftItems: OrderItem[]
  draftType:  OrderType | null
  setDraftItems: (items: OrderItem[]) => void
  setDraftType:  (type: OrderType | null) => void
  clearDraft:    () => void

  settings: AppSettings
  updateSettings:         (patch: Partial<AppSettings>) => void
  _setSettingsFromRemote: (s: AppSettings) => void
  setPin:                 (role: Role, pin: string) => void
  updateStockQuantity:    (menuItemId: string, qty: number | null) => void
  decrementStockForItems: (items: OrderItem[]) => void

  syncToCloud: () => void

  toast: { message: string; type: 'success' | 'error' } | null
  showToast:  (message: string, type?: 'success' | 'error') => void
  clearToast: () => void
}

export const useStore = create<AppState>((set, get) => {
  const storedRole = sessionStorage.getItem(SS_ROLE) as Role | null
  return {
    currentRole: storedRole,
    login(role)  { sessionStorage.setItem(SS_ROLE, role); set({ currentRole: role }) },
    logout()     { sessionStorage.removeItem(SS_ROLE);    set({ currentRole: null }) },

    // ── Menu ─────────────────────────────────────────────────────────────────
    menuItems: loadMenu(),
    setMenuItems(items) {
      saveMenu(items); set({ menuItems: items })
      pushMenu(items)
    },
    toggleItemAvailability(id) {
      const items = get().menuItems.map(m => m.id === id ? { ...m, available: !m.available } : m)
      saveMenu(items); set({ menuItems: items })
      pushMenu(items)
    },
    _setMenuFromRemote(items) {
      saveMenu(items); set({ menuItems: items })
    },

    // ── Orders ───────────────────────────────────────────────────────────────
    orders: loadOrders(),
    async createOrder(type, items, customerName, customerPhone) {
      const currentOrders = get().orders
      const totalPrice = items.reduce((sum, oi) => {
        const mi = get().menuItems.find(m => m.id === oi.menuItemId)
        return sum + (mi?.price ?? 0) * oi.quantity
      }, 0)
      const nums = currentOrders.map(o => parseInt(o.id.replace('YUU-', ''), 10)).filter(n => !isNaN(n))
      const localMax = nums.length > 0 ? Math.max(...nums) : 0
      const id = await reserveOrderId(localMax)
      const order: Order = {
        id,
        orderType: type,
        items,
        totalPrice,
        status: 'awaiting_payment',
        createdAt: new Date().toISOString(),
        paymentMethod: 'bit',
        customerName: customerName?.trim() || undefined,
        customerPhone: customerPhone?.trim() || undefined,
      }
      const updated = [...currentOrders, order]
      saveOrders(updated); set({ orders: updated })
      pushOrder(order)
      return order
    },
    updateOrder(id, patch) {
      const updated = get().orders.map(o => o.id === id ? { ...o, ...patch } : o)
      saveOrders(updated); set({ orders: updated })
      const changed = updated.find(o => o.id === id)
      if (changed) pushOrder(changed)
    },
    removeOrder(id) {
      const updated = get().orders.filter(o => o.id !== id)
      saveOrders(updated); set({ orders: updated })
      deleteOrderDoc(id).catch(console.error)
    },
    refreshOrders() { set({ orders: loadOrders() }) },
    async resetOrders() {
      saveOrders([]); set({ orders: [] })
      await clearOrders()
      await resetOrderCounter()
    },
    _setOrdersFromRemote(orders) {
      saveOrders(orders); set({ orders })
    },

    // ── Draft ─────────────────────────────────────────────────────────────────
    draftItems: [],
    draftType:  null,
    setDraftItems(items) { set({ draftItems: items }) },
    setDraftType(type)   { set({ draftType:  type  }) },
    clearDraft()         { set({ draftItems: [], draftType: null }) },

    // ── Settings ──────────────────────────────────────────────────────────────
    settings: loadSettings(),
    updateSettings(patch) {
      const settings = { ...get().settings, ...patch }
      saveSettings(settings); set({ settings })
      pushSettings(settings)
    },
    _setSettingsFromRemote(remote) {
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...remote,
        pins: { ...DEFAULT_SETTINGS.pins, ...remote.pins },
      }
      saveSettings(settings); set({ settings })
    },
    setPin(role, pin) {
      const settings = { ...get().settings, pins: { ...get().settings.pins, [role]: pin } }
      saveSettings(settings); set({ settings })
      pushSettings(settings)
    },
    updateStockQuantity(menuItemId, qty) {
      const { settings, menuItems } = get()
      const newQty = { ...settings.stockQuantities }
      let newMenu = menuItems
      if (qty === null || qty <= 0) {
        delete newQty[menuItemId]
      } else {
        newQty[menuItemId] = qty
        const item = menuItems.find(m => m.id === menuItemId)
        if (item && !item.available) {
          newMenu = menuItems.map(m => m.id === menuItemId ? { ...m, available: true } : m)
          saveMenu(newMenu); set({ menuItems: newMenu })
          pushMenu(newMenu)
        }
      }
      const ns = { ...settings, stockQuantities: newQty }
      saveSettings(ns); set({ settings: ns })
      pushSettings(ns)
    },
    decrementStockForItems(items) {
      const { settings, menuItems } = get()
      let newQty  = { ...settings.stockQuantities }
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
        pushSettings(ns)
        pushMenu(newMenu)
      }
    },

    // ── Cloud sync ───────────────────────────────────────────────────────────
    syncToCloud() {
      const { settings, menuItems, orders } = get()
      pushSettings(settings)
      pushMenu(menuItems)
      orders.forEach(o => pushOrder(o))
    },

    // ── Toast ─────────────────────────────────────────────────────────────────
    toast: null,
    showToast(message, type = 'success') {
      if (_toastTimer) clearTimeout(_toastTimer)
      set({ toast: { message, type } })
      _toastTimer = setTimeout(() => { set({ toast: null }); _toastTimer = null }, 3500)
    },
    clearToast() { set({ toast: null }) },
  }
})
