export type Role = 'admin' | 'waitress' | 'kitchen' | 'bar'

export type OrderStatus =
  | 'open'
  | 'awaiting_payment'
  | 'paid'
  | 'sent_to_kitchen'
  | 'ready'
  | 'cancelled'
  | 'deleted'

export type OrderType = 'sit_down' | 'take_away'

export type MenuCategory = 'food' | 'drink' | 'dessert'

export interface MenuItem {
  id: string
  name: string
  nameHe: string
  category: MenuCategory
  price: number
  emoji?: string
  available: boolean
}

export interface OrderItem {
  menuItemId: string
  quantity: number
  notes?: string
}

export interface Order {
  id: string
  orderType: OrderType
  items: OrderItem[]
  totalPrice: number
  status: OrderStatus
  createdAt: string
  paidAt?: string
  sentToKitchenAt?: string
  readyAt?: string
  paymentMethod: 'bit' | 'staff'
  paymentProofImageKey?: string
  customerName?: string
  checkedItems?: Record<string, boolean>  // menuItemId → ticked by kitchen/bar
  kitchenDoneAt?: string   // set when kitchen clicks Done
  barDoneAt?: string       // set when bar clicks Done
  priority?: boolean       // pinned to top of kitchen/bar queue
}

export interface AppSettings {
  bitQR1: string            // hard-coded default or uploaded base64
  bitQR2: string            // optional second QR
  bitQR3: string            // optional third QR
  activeQRSlot: 1 | 2 | 3  // which QR is shown in payment
  stockQuantities: Record<string, number>  // menuItemId → remaining units
  pins: Record<Role, string>
  dessertTo: 'kitchen' | 'bar'  // which department handles desserts
  requirePaymentPhoto: boolean  // whether to require a payment proof photo
  printerEnabled: boolean       // auto-print ticket after each order is taken
  printInHebrew: boolean        // print bon in Hebrew (RTL) instead of English
  quickTags: string[]           // quick-select chips in the item notes modal
  agingEnabled: boolean         // show order age colours in kitchen/bar
  agingYellowMins: number       // minutes before card turns yellow
  agingRedMins: number          // minutes before card turns red
}
