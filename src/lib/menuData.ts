import type { MenuItem } from '../types'

export const DEFAULT_MENU: MenuItem[] = [
  // Food
  { id: 'f1', name: 'Tacos al Pastor', nameHe: 'טאקו אל פסטור', category: 'food', price: 48, emoji: '🌮', available: true },
  { id: 'f2', name: 'Fish Tacos', nameHe: 'טאקו דג', category: 'food', price: 52, emoji: '🐟', available: true },
  { id: 'f3', name: 'Mushroom Quesadilla', nameHe: 'קסדיה פטריות', category: 'food', price: 44, emoji: '🫓', available: true },
  { id: 'f4', name: 'Chicken Tostada', nameHe: 'טוסטדה עוף', category: 'food', price: 46, emoji: '🍗', available: true },
  { id: 'f5', name: 'Elote (Street Corn)', nameHe: 'אלוטה תירס רחוב', category: 'food', price: 28, emoji: '🌽', available: true },
  { id: 'f6', name: 'Guacamole & Chips', nameHe: 'גואקמולה ונאצ\'וס', category: 'food', price: 32, emoji: '🥑', available: true },
  { id: 'f7', name: 'Birria Bowl', nameHe: 'קערת בריה', category: 'food', price: 58, emoji: '🍲', available: true },
  { id: 'f8', name: 'Veggie Burrito', nameHe: 'בוריטו ירקות', category: 'food', price: 42, emoji: '🌯', available: true },
  { id: 'f9', name: 'Nachos Supreme', nameHe: 'נאצ\'וס סופרים', category: 'food', price: 54, emoji: '🧀', available: true },
  // Drinks
  { id: 'd1', name: 'Agua de Jamaica', nameHe: 'תה היביסקוס קר', category: 'drink', price: 18, emoji: '🌺', available: true },
  { id: 'd2', name: 'Horchata', nameHe: 'הורצ\'טה', category: 'drink', price: 20, emoji: '🥛', available: true },
  { id: 'd3', name: 'Michelada', nameHe: 'מיצ\'לדה', category: 'drink', price: 32, emoji: '🍺', available: true },
  { id: 'd4', name: 'Mezcal Margarita', nameHe: 'מרגריטה מסקל', category: 'drink', price: 48, emoji: '🍹', available: true },
  // Desserts
  { id: 'ds1', name: 'Churros', nameHe: 'צ\'ורוס', category: 'dessert', price: 24, emoji: '🍩', available: true },
  { id: 'ds2', name: 'Tres Leches Cake', nameHe: 'עוגת טרס לצ\'ס', category: 'dessert', price: 28, emoji: '🍰', available: true },
]
