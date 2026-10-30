export interface InventoryCategory {
  id: string
  name: string
  icon: string
  order: number
}

export interface InventoryItem {
  id: string
  categoryId: string
  name: string
  qty: number
  unit: string
  location: string
  minQty: number   // 0 = no warning threshold
  note: string
  order: number
  updatedAt: string
}
