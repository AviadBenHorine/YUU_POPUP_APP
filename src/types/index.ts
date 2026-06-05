export type Role = 'admin' | 'waitress' | 'kitchen'

export type OrderStatus =
  | 'open'
  | 'awaiting_payment'
  | 'paid'
  | 'sent_to_kitchen'
  | 'ready'
  | 'cancelled'

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
  paymentMethod: 'bit'
  paymentProofImageKey?: string
}

export interface AppSettings {
  bitQRImage: string   // base64 data URL of the Bit QR code image
  pins: Record<Role, string>
}
