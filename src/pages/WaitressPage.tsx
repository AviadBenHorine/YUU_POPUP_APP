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
import { printer } from '../services/bluetoothPrinter'
import type { MenuItem, MenuCategory } from '../types'

// ─── Draggable menu item ───
function DraggableMenuItem({ item, stockRemaining, draftQty }: {
  item: MenuItem
  stockRemaining?: number
  draftQty: number
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, data: { item } })
  const atLimit = stockRemaining !== undefined && draftQty >= stockRemaining
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`
        bg-white rounded-xl border-2 p-2 select-none touch-none flex flex-col transition-all
        ${atLimit
          ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
          : 'border-navy/10 cursor-grab active:cursor-grabbing hover:border-gold hover:shadow-md'
        }
        ${isDragging ? 'opacity-30' : ''}
      `}
      style={{ touchAction: 'none' }}
    >
      <div className="text-2xl leading-none mb-1">{item.emoji}</div>
      <div className="font-body font-semibold text-navy text-xs leading-tight flex-1">{item.nameHe}</div>
      <div className="flex items-center justify-between mt-1">
        <div className="font-display font-bold text-gold text-xs">₪{item.price}</div>
        {stockRemaining !== undefined && (
          <div className={`text-xs font-body font-semibold rounded-full px-1.5 py-0.5 leading-none
            ${stockRemaining <= 3 ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
            {stockRemaining}
          </div>
        )}
      </div>
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


// ─── Printer connect screen (shown when printerEnabled but not yet connected) ───
type ConnectStatus = 'auto' | 'idle' | 'connecting' | 'failed'

function PrinterConnectScreen({ onReady }: { onReady: () => void }) {
  const [status, setStatus] = useState<ConnectStatus>('auto')
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    printer.tryAutoReconnect().then(ok => {
      if (ok) { onReady(); return }
      setStatus('idle')
    })
  }, [])

  async function handleConnect() {
    setStatus('connecting')
    setError(null)
    try {
      await printer.connect()
      onReady()
    } catch (e) {
      setStatus('failed')
      setError(e instanceof Error ? e.message : 'Connection failed')
    }
  }

  return (
    <div className="h-dvh flex flex-col bg-cream">
      <BrowserWarning />
      <TopBar title="הזמנות" titleEn="Orders" />
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6 text-center">
        <div className="text-6xl">🖨️</div>

        <div>
          <h2 className="font-display font-black text-navy text-2xl">חבר מדפסת</h2>
          <p className="font-body text-navy/50 text-sm mt-1">Connect Printer</p>
        </div>

        {(status === 'auto' || status === 'connecting') && (
          <div className="flex items-center gap-3 text-navy/60 font-body text-sm">
            <div className="w-5 h-5 border-2 border-navy/30 border-t-navy rounded-full animate-spin shrink-0" />
            {status === 'auto'
              ? (printer.lastDeviceName
                  ? `מחפש "${printer.lastDeviceName}"...`
                  : 'מחפש מדפסת... / Searching...')
              : 'מתחבר... / Connecting...'}
          </div>
        )}

        {(status === 'idle' || status === 'failed') && (
          <div className="w-full max-w-xs flex flex-col gap-3">
            {error && (
              <p dir="ltr" className="font-body text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
              </p>
            )}
            <button
              onClick={handleConnect}
              className="w-full py-5 rounded-2xl bg-navy text-cream font-display font-bold text-lg shadow-md hover:bg-navy/80 active:scale-95 transition-all double-border"
            >
              <div>{status === 'failed' ? 'נסה שוב / Retry' : 'חבר מדפסת / Connect'}</div>
              <div className="text-cream/50 text-sm font-body mt-0.5">Tap to pair via Bluetooth</div>
            </button>
          </div>
        )}

        <button
          onClick={onReady}
          className="text-navy/40 font-body text-sm underline hover:text-navy/70 transition-colors mt-2"
        >
          המשך ללא מדפסת / Continue without printer
        </button>
      </div>
    </div>
  )
}

export default function WaitressPage() {
  const menuItems    = useStore(s => s.menuItems)
  const settings     = useStore(s => s.settings)
  const draftItems   = useStore(s => s.draftItems)
  const draftType    = useStore(s => s.draftType)
  const setDraftItems = useStore(s => s.setDraftItems)
  const setDraftType  = useStore(s => s.setDraftType)
  const clearDraft    = useStore(s => s.clearDraft)
  const createOrder   = useStore(s => s.createOrder)
  const showToast     = useStore(s => s.showToast)

  const navigate = useNavigate()

  // Printer gate: show connect screen when printerEnabled but not yet connected
  const [printerReady, setPrinterReady] = useState(() =>
    !settings.printerEnabled || printer.isConnected
  )
  const [activeItem, setActiveItem]     = useState<MenuItem | null>(null)
  const [notesModal, setNotesModal]     = useState<{ itemIndex: number; notes: string } | null>(null)
  const [cancelModal, setCancelModal]   = useState(false)
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<MenuCategory>('food')
  const [customerName, setCustomerName] = useState('')

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
      const totalQty = draftItems.filter(oi => oi.menuItemId === item.id).reduce((s, oi) => s + oi.quantity, 0)
      const stockQty = settings.stockQuantities[item.id]
      if (stockQty !== undefined && totalQty >= stockQty) {
        showToast(`${item.nameHe}: רק ${stockQty} במלאי`, 'error')
        return
      }
      // Always add a new slot — caller can set different notes per slot
      setDraftItems([...draftItems, { menuItemId: item.id, quantity: 1 }])
    }
  }

  function adjustQty(index: number, delta: number) {
    const oi = draftItems[index]
    if (!oi) return
    const newQty = oi.quantity + delta
    if (delta > 0) {
      const totalQty = draftItems.reduce((s, o) => s + (o.menuItemId === oi.menuItemId ? o.quantity : 0), 0)
      const stockQty = settings.stockQuantities[oi.menuItemId]
      if (stockQty !== undefined && totalQty >= stockQty) {
        const mi = menuItems.find(m => m.id === oi.menuItemId)
        showToast(`${mi?.nameHe ?? ''}: רק ${stockQty} במלאי`, 'error')
        return
      }
    }
    if (newQty <= 0) {
      setDraftItems(draftItems.filter((_, i) => i !== index))
    } else {
      setDraftItems(draftItems.map((o, i) => i === index ? { ...o, quantity: newQty } : o))
    }
  }

  function saveNotes(notes: string) {
    if (!notesModal) return
    setDraftItems(draftItems.map((oi, i) =>
      i === notesModal.itemIndex ? { ...oi, notes: notes || undefined } : oi
    ))
    setNotesModal(null)
  }

  async function handleProceedToPayment() {
    if (draftItems.length === 0 || creatingOrder) return
    setCreatingOrder(true)
    try {
      const order = await createOrder(draftType ?? 'sit_down', draftItems, customerName)
      setCustomerName('')
      clearDraft()
      navigate(`/payment/${order.id}`)
    } catch {
      showToast('שגיאה ביצירת הזמנה / Error creating order', 'error')
    } finally {
      setCreatingOrder(false)
    }
  }

  function handleCancel() {
    clearDraft()
    setCancelModal(false)
    showToast('ההזמנה בוטלה / Order cancelled', 'error')
  }

  const isTakeAway = draftType === 'take_away'
  const canProceed = draftItems.length > 0 && customerName.trim().length > 0 && !creatingOrder

  if (!printerReady) {
    return <PrinterConnectScreen onReady={() => setPrinterReady(true)} />
  }

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
                visibleItems.map(item => (
                  <DraggableMenuItem
                    key={item.id}
                    item={item}
                    stockRemaining={settings.stockQuantities[item.id]}
                    draftQty={draftItems.filter(oi => oi.menuItemId === item.id).reduce((s, oi) => s + oi.quantity, 0)}
                  />
                ))
              )}
            </div>
          </div>

          {/* ─── Right panel: Order zone ─── */}
          <div className="flex-1 flex flex-col min-h-0 bg-cream/40 border-l-2 border-navy/10">

            {/* Customer name input */}
            <div className="px-4 py-2.5 border-b-2 border-navy/10 shrink-0 bg-white/80">
              <input
                type="text"
                dir="rtl"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="שם לקוח (חובה) / Customer name *"
                className={`w-full bg-transparent font-body text-navy placeholder-navy/35 focus:outline-none text-sm ${
                  customerName.trim() ? 'text-navy' : ''
                }`}
              />
            </div>

            {/* Order zone header: take-away toggle + item count */}
            <div className="px-4 py-2 border-b-2 border-navy/10 flex items-center justify-between shrink-0 bg-white/60">
              {/* Take-away toggle */}
              <button
                onClick={() => setDraftType(isTakeAway ? 'sit_down' : 'take_away')}
                className={`
                  flex items-center gap-2.5 px-3 py-1.5 rounded-xl border-2 font-body text-sm transition-all
                  ${isTakeAway
                    ? 'border-gold bg-gold/10 text-navy font-semibold shadow-sm'
                    : 'border-navy/15 text-navy/45 hover:border-navy/30 hover:text-navy/60'
                  }
                `}
              >
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
                  {draftItems.map((oi, i) => {
                    const mi = menuItems.find(m => m.id === oi.menuItemId)
                    if (!mi) return null
                    const totalQty = draftItems.filter(o => o.menuItemId === oi.menuItemId).reduce((s, o) => s + o.quantity, 0)
                    const stockQty = settings.stockQuantities[oi.menuItemId]
                    const atStockLimit = stockQty !== undefined && totalQty >= stockQty
                    return (
                      <div key={`${oi.menuItemId}-${i}`}
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
                          onClick={() => setNotesModal({ itemIndex: i, notes: oi.notes ?? '' })}
                          className="text-navy/40 hover:text-navy/70 text-base transition-colors w-8 h-8 flex items-center justify-center shrink-0"
                        >✏️</button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onPointerDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            onClick={() => adjustQty(i, -1)}
                            className="w-8 h-8 rounded-full bg-navy/10 hover:bg-navy/20 text-navy font-bold text-lg flex items-center justify-center transition-colors"
                          >−</button>
                          <span className="font-display font-bold text-navy w-6 text-center">{oi.quantity}</span>
                          <button
                            onPointerDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            onClick={() => adjustQty(i, 1)}
                            disabled={atStockLimit}
                            className={`w-8 h-8 rounded-full font-bold text-lg flex items-center justify-center transition-colors
                              ${atStockLimit ? 'bg-red-100 text-red-300 cursor-not-allowed' : 'bg-navy/10 hover:bg-navy/20 text-navy'}`}
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
                  disabled={!canProceed}
                  className={`
                    w-full py-4 rounded-2xl font-display font-bold text-lg transition-all
                    ${canProceed
                      ? 'bg-gold text-navy hover:bg-gold/90 active:scale-95 shadow-md double-border-gold'
                      : 'bg-navy/10 text-navy/30 cursor-not-allowed'
                    }
                  `}
                >
                  <div>המשך לגביית תשלום</div>
                  {!customerName.trim() && draftItems.length > 0 && (
                    <div className="text-xs font-body mt-0.5 text-navy/40">נא להזין שם לקוח / Enter customer name</div>
                  )}
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
            <div className="flex flex-wrap gap-2 mb-3">
              {(settings.quickTags ?? []).map(tag => {
                const active = notesModal.notes.includes(tag)
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      const current = notesModal.notes
                      if (active) {
                        const removed = current
                          .replace(new RegExp(',?\\s*' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
                          .replace(/^,\s*/, '')
                          .trim()
                        setNotesModal({ ...notesModal, notes: removed })
                      } else {
                        const appended = current.trim()
                          ? current.trim() + ', ' + tag
                          : tag
                        setNotesModal({ ...notesModal, notes: appended })
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full border-2 font-body text-xs transition-all
                      ${active
                        ? 'bg-navy border-navy text-cream'
                        : 'border-navy/20 text-navy/60 hover:border-navy/50 hover:text-navy'
                      }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
            <textarea
              dir="auto"
              value={notesModal.notes}
              onChange={e => setNotesModal({ ...notesModal, notes: e.target.value })}
              placeholder="למשל: ללא כוסברה, אלרגיה לאגוזים..."
              className="w-full border-2 border-navy/20 rounded-xl p-3 font-body text-navy text-sm resize-none h-20 focus:outline-none focus:border-gold bg-cream"
              autoFocus
            />
            <div className="flex gap-3 mt-3">
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
