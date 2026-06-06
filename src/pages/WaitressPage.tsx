import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay,
  useSensor, useSensors, PointerSensor, TouchSensor, useDroppable,
  useDraggable
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import BrowserWarning from '../components/BrowserWarning'
import { useStore } from '../stores/useStore'
import type { MenuItem, MenuCategory } from '../types'

// ─── Draggable menu item ───
function DraggableMenuItem({ item }: { item: MenuItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, data: { item } })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`
        bg-white rounded-xl border-2 border-navy/10 p-2 cursor-grab active:cursor-grabbing
        hover:border-gold hover:shadow-md transition-all select-none touch-none flex flex-col
        ${isDragging ? 'opacity-30' : ''}
      `}
      style={{ touchAction: 'none' }}
    >
      <div className="text-2xl leading-none mb-1">{item.emoji}</div>
      <div className="font-body font-semibold text-navy text-xs leading-tight flex-1">{item.nameHe}</div>
      <div className="font-display font-bold text-gold text-xs mt-1">₪{item.price}</div>
    </div>
  )
}

// ─── Drop zone ───
function OrderDropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'order-zone' })
  return (
    <div
      ref={setNodeRef}
      className={`
        flex-1 min-h-0 overflow-y-auto transition-colors
        ${isOver ? 'bg-gold/10 ring-2 ring-gold ring-inset' : ''}
      `}
    >
      {children}
    </div>
  )
}

const CATEGORY_LABELS: Record<MenuCategory, { he: string; en: string; icon: string }> = {
  food:    { he: 'אוכל',    en: 'Food',     icon: '🍽' },
  drink:   { he: 'שתייה',   en: 'Drinks',   icon: '🥤' },
  dessert: { he: 'קינוחים', en: 'Desserts', icon: '🍮' },
}

export default function WaitressPage() {
  const menuItems    = useStore(s => s.menuItems)
  const draftItems   = useStore(s => s.draftItems)
  const draftType    = useStore(s => s.draftType)
  const setDraftItems = useStore(s => s.setDraftItems)
  const setDraftType  = useStore(s => s.setDraftType)
  const clearDraft    = useStore(s => s.clearDraft)
  const createOrder   = useStore(s => s.createOrder)
  const showToast     = useStore(s => s.showToast)

  const navigate = useNavigate()
  const [activeItem, setActiveItem]     = useState<MenuItem | null>(null)
  const [notesModal, setNotesModal]     = useState<{ itemId: string; notes: string } | null>(null)
  const [cancelModal, setCancelModal]   = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<MenuCategory>('food')

  // Always default to sit_down — never leave type unset
  useEffect(() => {
    if (!draftType) setDraftType('sit_down')
  }, [draftType])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const visibleItems = menuItems.filter(m => m.available && m.category === categoryFilter)

  const totalPrice = draftItems.reduce((sum, oi) => {
    const mi = menuItems.find(m => m.id === oi.menuItemId)
    return sum + (mi?.price ?? 0) * oi.quantity
  }, 0)

  function handleDragStart(e: DragStartEvent) {
    setActiveItem(e.active.data.current?.item as MenuItem ?? null)
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveItem(null)
    const { over, active } = e
    if (!over) return
    const item = active.data.current?.item as MenuItem | undefined
    if (over.id === 'order-zone' && item) {
      const existing = draftItems.find(oi => oi.menuItemId === item.id)
      if (existing) {
        setDraftItems(draftItems.map(oi => oi.menuItemId === item.id ? { ...oi, quantity: oi.quantity + 1 } : oi))
      } else {
        setDraftItems([...draftItems, { menuItemId: item.id, quantity: 1 }])
      }
    }
  }

  function adjustQty(menuItemId: string, delta: number) {
    const existing = draftItems.find(oi => oi.menuItemId === menuItemId)
    if (!existing) return
    const newQty = existing.quantity + delta
    if (newQty <= 0) {
      setDraftItems(draftItems.filter(oi => oi.menuItemId !== menuItemId))
    } else {
      setDraftItems(draftItems.map(oi => oi.menuItemId === menuItemId ? { ...oi, quantity: newQty } : oi))
    }
  }

  function saveNotes(notes: string) {
    if (!notesModal) return
    setDraftItems(draftItems.map(oi =>
      oi.menuItemId === notesModal.itemId ? { ...oi, notes: notes || undefined } : oi
    ))
    setNotesModal(null)
  }

  function handleProceedToPayment() {
    if (draftItems.length === 0) return
    const order = createOrder(draftType ?? 'sit_down', draftItems)
    clearDraft()
    navigate(`/payment/${order.id}`)
  }

  function handleCancel() {
    clearDraft()
    setCancelModal(false)
    showToast('ההזמנה בוטלה / Order cancelled', 'error')
  }

  const isTakeAway = draftType === 'take_away'

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-dvh flex flex-col bg-cream overflow-hidden">
        <BrowserWarning />
        <TopBar title="הזמנות" titleEn="Orders" />

        <div className="flex-1 flex min-h-0 overflow-hidden">

          {/* ─── Left panel: Menu ─── */}
          <div className="w-[40%] flex flex-col bg-white border-l-2 border-navy/10 min-h-0">

            {/* Category tab bar */}
            <div className="flex gap-2 p-2 border-b-2 border-navy/10 bg-cream/60 shrink-0">
              {(['food', 'drink', 'dessert'] as MenuCategory[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`
                    flex-1 py-3.5 rounded-xl flex flex-col items-center gap-1.5 transition-all
                    ${categoryFilter === cat
                      ? 'bg-navy text-cream shadow-md ring-2 ring-navy/20 ring-offset-1'
                      : 'bg-white text-navy/40 border-2 border-navy/10 hover:border-navy/25 hover:text-navy/60'
                    }
                  `}
                >
                  <span className={`leading-none transition-all ${categoryFilter === cat ? 'text-3xl' : 'text-2xl'}`}>
                    {CATEGORY_LABELS[cat].icon}
                  </span>
                  <span className={`font-display font-bold transition-all ${categoryFilter === cat ? 'text-sm' : 'text-xs text-navy/40'}`}>
                    {CATEGORY_LABELS[cat].he}
                  </span>
                </button>
              ))}
            </div>

            {/* Item grid */}
            <div className="flex-1 p-2 grid grid-cols-3 gap-1.5 content-start overflow-y-auto">
              {visibleItems.length === 0 ? (
                <div className="col-span-3 py-12 flex flex-col items-center justify-center text-navy/25 select-none">
                  <div className="text-3xl mb-2">{CATEGORY_LABELS[categoryFilter].icon}</div>
                  <div className="font-body text-xs text-center">אין פריטים זמינים<br />No items available</div>
                </div>
              ) : (
                visibleItems.map(item => <DraggableMenuItem key={item.id} item={item} />)
              )}
            </div>
          </div>

          {/* ─── Right panel: Order zone ─── */}
          <div className="flex-1 flex flex-col min-h-0 bg-cream/40 border-l-2 border-navy/10">

            {/* Order zone header: take-away toggle + item count */}
            <div className="px-4 py-2.5 border-b-2 border-navy/10 flex items-center justify-between shrink-0 bg-white/60">
              {/* Take-away toggle */}
              <button
                onClick={() => setDraftType(isTakeAway ? 'sit_down' : 'take_away')}
                className={`
                  flex items-center gap-2.5 px-3.5 py-2 rounded-xl border-2 font-body text-sm transition-all
                  ${isTakeAway
                    ? 'border-gold bg-gold/10 text-navy font-semibold shadow-sm'
                    : 'border-navy/15 text-navy/45 hover:border-navy/30 hover:text-navy/60'
                  }
                `}
              >
                {/* Checkbox */}
                <span className={`
                  w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all text-xs font-bold
                  ${isTakeAway ? 'bg-gold border-gold text-white' : 'border-navy/25 bg-white'}
                `}>
                  {isTakeAway && '✓'}
                </span>
                <span>🥡 לקחת / Take Away</span>
              </button>

              <span className="font-body text-xs text-navy/40">{draftItems.length} פריטים</span>
            </div>

            {/* Drop zone */}
            <OrderDropZone>
              {draftItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-navy/25 select-none p-8">
                  <div className="text-5xl mb-3">🍽</div>
                  <div className="font-body text-sm text-center">
                    גרור פריטים לכאן<br />
                    <span className="text-xs">Drag items here</span>
                  </div>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {draftItems.map(oi => {
                    const mi = menuItems.find(m => m.id === oi.menuItemId)
                    if (!mi) return null
                    return (
                      <div key={oi.menuItemId}
                        className="bg-white rounded-xl border-2 border-navy/10 p-3 flex items-center gap-3"
                      >
                        <span className="text-xl">{mi.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-body font-semibold text-navy text-sm truncate">{mi.nameHe}</div>
                          {oi.notes && (
                            <div className="text-xs text-navy/40 italic truncate">"{oi.notes}"</div>
                          )}
                        </div>
                        <div className="font-body text-xs text-gold font-semibold shrink-0">
                          ₪{mi.price * oi.quantity}
                        </div>
                        <button
                          onPointerDown={e => e.stopPropagation()}
                          onTouchStart={e => e.stopPropagation()}
                          onClick={() => setNotesModal({ itemId: oi.menuItemId, notes: oi.notes ?? '' })}
                          className="text-navy/40 hover:text-navy/70 text-base transition-colors w-8 h-8 flex items-center justify-center shrink-0"
                        >✏️</button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onPointerDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            onClick={() => adjustQty(oi.menuItemId, -1)}
                            className="w-8 h-8 rounded-full bg-navy/10 hover:bg-navy/20 text-navy font-bold text-lg flex items-center justify-center transition-colors"
                          >−</button>
                          <span className="font-display font-bold text-navy w-6 text-center">{oi.quantity}</span>
                          <button
                            onPointerDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            onClick={() => adjustQty(oi.menuItemId, 1)}
                            className="w-8 h-8 rounded-full bg-navy/10 hover:bg-navy/20 text-navy font-bold text-lg flex items-center justify-center transition-colors"
                          >+</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </OrderDropZone>

            {/* Footer: total + actions */}
            <div className="shrink-0 border-t-2 border-navy/10 bg-white/70">
              {/* Total */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-navy/8">
                <span className="font-body text-navy/60 text-sm">סה"כ / Total</span>
                <span className="font-display font-black text-navy text-2xl">₪{totalPrice}</span>
              </div>

              {/* Buttons */}
              <div className="px-4 py-3 flex flex-col gap-2">
                <button
                  onClick={handleProceedToPayment}
                  disabled={draftItems.length === 0}
                  className={`
                    w-full py-4 rounded-2xl font-display font-bold text-lg transition-all
                    ${draftItems.length > 0
                      ? 'bg-gold text-navy hover:bg-gold/90 active:scale-95 shadow-md double-border-gold'
                      : 'bg-navy/10 text-navy/30 cursor-not-allowed'
                    }
                  `}
                >
                  <div>לתשלום</div>
                  <div className={`text-xs font-body mt-0.5 ${draftItems.length > 0 ? 'text-navy/60' : 'text-navy/20'}`}>
                    Proceed to Payment
                  </div>
                </button>

                {draftItems.length > 0 && (
                  <button
                    onClick={() => setCancelModal(true)}
                    className="w-full py-2.5 rounded-xl border-2 border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 font-body text-sm transition-colors"
                  >
                    בטל הזמנה / Cancel Order
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeItem && (
          <div className="drag-overlay bg-white rounded-xl border-2 border-gold p-3 w-28">
            <div className="text-2xl mb-1">{activeItem.emoji}</div>
            <div className="font-body font-semibold text-navy text-xs leading-tight">{activeItem.nameHe}</div>
            <div className="font-display font-bold text-gold text-sm mt-1">₪{activeItem.price}</div>
          </div>
        )}
      </DragOverlay>

      {/* Notes modal */}
      <Modal open={!!notesModal} onClose={() => setNotesModal(null)} title="הערה לפריט / Item Note">
        {notesModal && (
          <div>
            <textarea
              dir="auto"
              value={notesModal.notes}
              onChange={e => setNotesModal({ ...notesModal, notes: e.target.value })}
              placeholder="למשל: ללא כוסברה, אלרגיה לאגוזים..."
              className="w-full border-2 border-navy/20 rounded-xl p-3 font-body text-navy text-sm resize-none h-24 focus:outline-none focus:border-gold bg-cream"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => saveNotes(notesModal.notes)}
                className="flex-1 py-3 bg-navy text-cream rounded-xl font-display font-bold text-sm hover:bg-navy/80 transition-colors">
                שמור / Save
              </button>
              <button onClick={() => setNotesModal(null)}
                className="flex-1 py-3 border-2 border-navy/20 text-navy rounded-xl font-body text-sm hover:border-navy/50 transition-colors">
                ביטול / Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel modal */}
      <Modal open={cancelModal} onClose={() => setCancelModal(false)} title="ביטול הזמנה / Cancel Order">
        <p className="font-body text-navy/70 mb-6 text-sm">האם לבטל את ההזמנה הנוכחית? לא ניתן לבטל פעולה זו.</p>
        <div className="flex gap-3">
          <button onClick={handleCancel}
            className="flex-1 py-3 bg-red-500 text-white rounded-xl font-display font-bold text-sm hover:bg-red-600 transition-colors">
            בטל הזמנה
          </button>
          <button onClick={() => setCancelModal(false)}
            className="flex-1 py-3 border-2 border-navy/20 text-navy rounded-xl font-body text-sm hover:border-navy/50 transition-colors">
            חזור
          </button>
        </div>
      </Modal>
    </DndContext>
  )
}
