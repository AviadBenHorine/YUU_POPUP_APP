export type PrepStatus = 'planning' | 'active' | 'done'

export interface PrepShoppingGroup {
  id: string
  title: string
  subtitle?: string
  order: number
}

export interface PrepOwner {
  id: string
  name: string
  order: number
}

export interface PrepPortion {
  id: string
  name: string
  qty: number
  order: number
}

export interface PrepEvent {
  id: string
  name: string
  date: string | null
  status: PrepStatus
  notes: string
  shoppingGroups: PrepShoppingGroup[]
  owners: PrepOwner[]
  portions: PrepPortion[]
  totalItems: number
  doneItems: number
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface PrepItem {
  id: string
  kind: 'shop' | 'task'
  groupId: string
  name: string
  qty: string | null
  unit: string | null
  note: string | null
  order: number
  done: boolean
  doneBy: string | null
  doneAt: string | null
  createdAt: string
  updatedAt: string
}

// Snapshot embedded in EventSnapshot when archiving
export interface PrepSnapshot {
  prepEventId: string
  prepEventName: string
  shoppingGroups: PrepShoppingGroup[]
  owners: PrepOwner[]
  portions: PrepPortion[]
  items: PrepItem[]
  notes: string
}
