import type { Order } from '../types'

function daysAgo(n: number, hour = 14, min = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}

export const MOCK_ORDERS: Order[] = [
  {
    id: 'YUU-0001', orderType: 'sit_down',
    items: [
      { menuItemId: 'f1', quantity: 2 },
      { menuItemId: 'd1', quantity: 2 },
      { menuItemId: 'ds1', quantity: 1 },
    ],
    totalPrice: 138, status: 'ready',
    createdAt: daysAgo(0, 12, 10), paidAt: daysAgo(0, 12, 15),
    sentToKitchenAt: daysAgo(0, 12, 16), readyAt: daysAgo(0, 12, 30),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0002', orderType: 'take_away',
    items: [
      { menuItemId: 'f2', quantity: 1 },
      { menuItemId: 'f6', quantity: 1 },
      { menuItemId: 'd2', quantity: 2 },
    ],
    totalPrice: 110, status: 'ready',
    createdAt: daysAgo(0, 13, 5), paidAt: daysAgo(0, 13, 8),
    sentToKitchenAt: daysAgo(0, 13, 9), readyAt: daysAgo(0, 13, 20),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0003', orderType: 'sit_down',
    items: [
      { menuItemId: 'f7', quantity: 2 },
      { menuItemId: 'd4', quantity: 2 },
      { menuItemId: 'ds2', quantity: 2 },
    ],
    totalPrice: 228, status: 'ready',
    createdAt: daysAgo(1, 19, 30), paidAt: daysAgo(1, 19, 35),
    sentToKitchenAt: daysAgo(1, 19, 36), readyAt: daysAgo(1, 19, 50),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0004', orderType: 'take_away',
    items: [
      { menuItemId: 'f3', quantity: 2 },
      { menuItemId: 'f5', quantity: 1 },
      { menuItemId: 'd1', quantity: 1 },
    ],
    totalPrice: 122, status: 'ready',
    createdAt: daysAgo(1, 20, 10), paidAt: daysAgo(1, 20, 15),
    sentToKitchenAt: daysAgo(1, 20, 16), readyAt: daysAgo(1, 20, 30),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0005', orderType: 'sit_down',
    items: [
      { menuItemId: 'f1', quantity: 3 },
      { menuItemId: 'f6', quantity: 1 },
      { menuItemId: 'd3', quantity: 2 },
      { menuItemId: 'ds1', quantity: 2 },
    ],
    totalPrice: 256, status: 'ready',
    createdAt: daysAgo(2, 18, 45), paidAt: daysAgo(2, 18, 50),
    sentToKitchenAt: daysAgo(2, 18, 51), readyAt: daysAgo(2, 19, 5),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0006', orderType: 'sit_down',
    items: [
      { menuItemId: 'f4', quantity: 2 },
      { menuItemId: 'f8', quantity: 1 },
      { menuItemId: 'd2', quantity: 3 },
    ],
    totalPrice: 194, status: 'ready',
    createdAt: daysAgo(2, 20, 0), paidAt: daysAgo(2, 20, 6),
    sentToKitchenAt: daysAgo(2, 20, 7), readyAt: daysAgo(2, 20, 20),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0007', orderType: 'take_away',
    items: [
      { menuItemId: 'f9', quantity: 1 },
      { menuItemId: 'd4', quantity: 1 },
    ],
    totalPrice: 102, status: 'ready',
    createdAt: daysAgo(3, 19, 15), paidAt: daysAgo(3, 19, 20),
    sentToKitchenAt: daysAgo(3, 19, 21), readyAt: daysAgo(3, 19, 35),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0008', orderType: 'sit_down',
    items: [
      { menuItemId: 'f1', quantity: 1 },
      { menuItemId: 'f2', quantity: 1 },
      { menuItemId: 'f5', quantity: 2 },
      { menuItemId: 'd1', quantity: 2 },
      { menuItemId: 'ds2', quantity: 1 },
    ],
    totalPrice: 196, status: 'cancelled',
    createdAt: daysAgo(4, 17, 30),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0009', orderType: 'take_away',
    items: [
      { menuItemId: 'f3', quantity: 1 },
      { menuItemId: 'f4', quantity: 1 },
      { menuItemId: 'd3', quantity: 1 },
    ],
    totalPrice: 122, status: 'ready',
    createdAt: daysAgo(5, 18, 0), paidAt: daysAgo(5, 18, 5),
    sentToKitchenAt: daysAgo(5, 18, 6), readyAt: daysAgo(5, 18, 20),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0010', orderType: 'sit_down',
    items: [
      { menuItemId: 'f7', quantity: 1 },
      { menuItemId: 'f6', quantity: 2 },
      { menuItemId: 'd4', quantity: 3 },
      { menuItemId: 'ds1', quantity: 3 },
    ],
    totalPrice: 294, status: 'ready',
    createdAt: daysAgo(5, 19, 45), paidAt: daysAgo(5, 19, 50),
    sentToKitchenAt: daysAgo(5, 19, 51), readyAt: daysAgo(5, 20, 10),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0011', orderType: 'sit_down',
    items: [
      { menuItemId: 'f1', quantity: 4 },
      { menuItemId: 'f5', quantity: 2 },
      { menuItemId: 'd2', quantity: 4 },
    ],
    totalPrice: 320, status: 'ready',
    createdAt: daysAgo(7, 20, 30), paidAt: daysAgo(7, 20, 35),
    sentToKitchenAt: daysAgo(7, 20, 36), readyAt: daysAgo(7, 20, 50),
    paymentMethod: 'bit',
  },
  {
    id: 'YUU-0012', orderType: 'take_away',
    items: [
      { menuItemId: 'f8', quantity: 2 },
      { menuItemId: 'd1', quantity: 1 },
    ],
    totalPrice: 102, status: 'ready',
    createdAt: daysAgo(7, 21, 10), paidAt: daysAgo(7, 21, 15),
    sentToKitchenAt: daysAgo(7, 21, 16), readyAt: daysAgo(7, 21, 30),
    paymentMethod: 'bit',
  },
]
