import { useState, useEffect, useCallback } from 'react'
import TopBar from '../components/TopBar'
import { useStore } from '../stores/useStore'
import { printer } from '../services/bluetoothPrinter'
import type { Order } from '../types'

function elapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime()
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  if (mins > 0) return `${mins}:${String(secs).padStart(2, '0')}`
  return `0:${String(secs).padStart(2, '0')}`
}

function agingClass(since: string, yellowMins: number, redMins: number, enabled: boolean): string {
  if (!enabled) return 'border-navy/20 bg-white'
  const mins = (Date.now() - new Date(since).getTime()) / 60000
  if (mins > redMins)    return 'border-red-400 bg-red-50 urgent-pulse'
  if (mins > yellowMins) return 'border-amber-400 bg-amber-50'
  return 'border-navy/20 bg-white'
}

function agingTextClass(since: string, yellowMins: number, redMins: number, enabled: boolean): string {
  if (!enabled) return 'text-navy/50'
  const mins = (Date.now() - new Date(since).getTime()) / 60000
  if (mins > redMins)    return 'text-red-500 font-bold'
  if (mins > yellowMins) return 'text-amber-600 font-semibold'
  return 'text-navy/50'
}

function KitchenCard({ order, dessertTo }: { order: Order; dessertTo: 'kitchen' | 'bar' }) {
  const menuItems   = useStore(s => s.menuItems)
  const updateOrder = useStore(s => s.updateOrder)
  const showToast   = useStore(s => s.showToast)
  const settings    = useStore(s => s.settings)
  const [, tick]    = useState(0)

  const agingOn     = settings.agingEnabled ?? true
  const yellowMins  = settings.agingYellowMins ?? 5
  const redMins     = settings.agingRedMins ?? 10

  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!deleteConfirm) return
    const t = setTimeout(() => setDeleteConfirm(false), 3000)
    return () => clearTimeout(t)
  }, [deleteConfirm])

  const since = order.sentToKitchenAt ?? order.createdAt

  // Kitchen handles food + desserts if dessertTo === 'kitchen'
  // _idx = original position in order.items, used as the checkedItems key
  const myItems = order.items
    .map((oi, idx) => ({ ...oi, _idx: idx }))
    .filter(oi => {
      const mi = menuItems.find(m => m.id === oi.menuItemId)
      if (!mi) return false
      if (mi.category === 'food') return true
      if (mi.category === 'dessert' && dessertTo === 'kitchen') return true
      return false
    })

  const checked   = order.checkedItems ?? {}
  const allMyDone = myItems.length > 0 && myItems.every(oi => checked[String(oi._idx)] === true)

  function toggleItem(idx: number) {
    const key = String(idx)
    const current = checked[key] ?? false
    updateOrder(order.id, { checkedItems: { ...checked, [key]: !current } })
  }

  function handleDelete() {
    if (!deleteConfirm) { setDeleteConfirm(true); return }
    updateOrder(order.id, { status: 'deleted' })
    showToast('הזמנה נמחקה / Order deleted')
  }

  function handleSelectAll() {
    const newChecked = { ...checked }
    myItems.forEach(oi => { newChecked[String(oi._idx)] = !allMyDone })
    updateOrder(order.id, { checkedItems: newChecked })
  }

  function handleReprint() {
    if (!printer.isConnected) { showToast('מדפסת לא מחוברת / Printer not connected', 'error'); return }
    printer.enqueuePrint(order, menuItems, settings.printInHebrew ?? false)
    showToast('שולח להדפסה / Sending to printer...')
  }

  function handleDone() {
    const now = new Date().toISOString()
    const newChecked = { ...checked }
    myItems.forEach(oi => { newChecked[String(oi._idx)] = true })
    // Order becomes 'ready' only when BOTH departments are done (or this is the only department)
    const allDone = order.items.every((_, idx) => newChecked[String(idx)] === true)
    updateOrder(order.id, {
      checkedItems: newChecked,
      kitchenDoneAt: now,
      ...(allDone ? { status: 'ready', readyAt: now } : {}),
    })
    showToast(allDone ? 'הזמנה מוכנה ✓ / Order ready' : 'מטבח סיים — ממתין לבר')
  }

  const doneCount = myItems.filter(oi => checked[String(oi._idx)]).length

  return (
    <div className={`rounded-2xl border-2 p-4 transition-all relative overflow-hidden ${agingClass(since, yellowMins, redMins, agingOn)}`}>
      {/* Header — name first, number secondary */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          {order.customerName ? (
            <>
              <div className="font-display font-black text-navy text-2xl leading-tight truncate">{order.customerName}</div>
              <div className="font-body text-navy/40 text-xs mt-0.5">{order.id}</div>
            </>
          ) : (
            <div className="font-display font-black text-navy text-xl">{order.id}</div>
          )}
          <div className={`
            inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-display font-bold mt-1
            ${order.orderType === 'sit_down' ? 'bg-navy text-cream' : 'bg-gold text-navy'}
          `}>
            {order.orderType === 'sit_down' ? '🪑 ישיבה' : '🥡 לקחת'}
          </div>
        </div>
        <div className="text-left shrink-0 mr-2 flex flex-col items-end gap-1">
          <div className={`font-display font-bold text-lg tabular-nums ${agingTextClass(since, yellowMins, redMins, agingOn)}`}>{elapsed(since)}</div>
          <div className="text-navy/30 text-xs">
            {new Date(since).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <button onClick={handleDelete}
            className={`mt-1 text-xs font-body px-2 py-1 rounded-lg border transition-colors ${deleteConfirm ? 'bg-red-500 text-white border-red-500' : 'text-navy/30 border-navy/15 hover:text-red-500 hover:border-red-300'}`}>
            {deleteConfirm ? 'מחק? ✕' : '🗑'}
          </button>
        </div>
      </div>

      {/* Checklist */}
      {myItems.length > 1 && (
        <div className="flex justify-end mb-1.5">
          <button onClick={handleSelectAll}
            className="text-xs font-body text-navy/40 hover:text-navy border border-navy/20 rounded-lg px-2.5 py-1 transition-colors">
            {allMyDone ? 'בטל הכל ✕' : 'סמן הכל ✓'}
          </button>
        </div>
      )}
      <div className="space-y-2 mb-4">
        {myItems.map(oi => {
          const mi = menuItems.find(m => m.id === oi.menuItemId)
          if (!mi) return null
          const isDone = checked[String(oi._idx)] === true
          return (
            <button
              key={oi._idx}
              onClick={() => toggleItem(oi._idx)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all text-right
                ${isDone ? 'border-green-300 bg-green-50 opacity-70' : 'border-navy/15 bg-white hover:border-navy/30'}`}
            >
              <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
                ${isDone ? 'bg-green-500 border-green-500' : 'border-navy/30 bg-white'}`}>
                {isDone && <span className="text-white text-xs font-bold">✓</span>}
              </div>
              <span className={`font-display font-black text-navy text-lg w-7 shrink-0 ${isDone ? 'line-through opacity-50' : ''}`}>
                {oi.quantity}×
              </span>
              <div className="flex-1 min-w-0 text-right">
                <span className={`font-body font-semibold text-navy text-base ${isDone ? 'line-through opacity-50' : ''}`}>{mi.nameHe}</span>
                {mi.category === 'dessert' && <span className="text-xs text-navy/30 font-body mr-1"> 🍮</span>}
                {oi.notes && (
                  <div className="text-xs text-amber-700 italic font-body mt-0.5 bg-amber-50 px-2 py-0.5 rounded inline-block">⚠ {oi.notes}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Progress */}
      {myItems.length > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-xs font-body text-navy/40 mb-1">
            <span>{doneCount} / {myItems.length} מוכן</span>
            <span>{allMyDone ? '✓ הכל מוכן' : 'בהכנה...'}</span>
          </div>
          <div className="h-1.5 rounded-full bg-navy/10 overflow-hidden">
            <div className="h-full rounded-full bg-green-400 transition-all duration-300"
              style={{ width: `${(doneCount / myItems.length) * 100}%` }} />
          </div>
        </div>
      )}

      <button onClick={handleDone} disabled={!allMyDone}
        className={`w-full py-3.5 rounded-xl font-display font-bold text-base transition-all
          ${allMyDone ? 'bg-green-500 text-white hover:bg-green-600 active:scale-95 shadow-md' : 'bg-navy/10 text-navy/30 cursor-not-allowed'}`}>
        {allMyDone ? 'מוכן ✓ / Done' : `סמן את כל הפריטים (${myItems.length - doneCount} נותרו)`}
      </button>
      <button onClick={handleReprint}
        className="w-full mt-2 py-2 rounded-xl border-2 border-navy/15 text-navy/40 font-body text-sm hover:border-navy/40 hover:text-navy transition-colors flex items-center justify-center gap-1.5">
        🖨 הדפס שוב / Reprint
      </button>
    </div>
  )
}

function DoneOrderRow({ order, onUndo, waitingForBar, dessertTo }: { order: Order; onUndo: (id: string) => void; waitingForBar?: boolean; dessertTo: 'kitchen' | 'bar' }) {
  const menuItems = useStore(s => s.menuItems)
  const typeLabel = order.orderType === 'sit_down' ? '🪑' : '🥡'
  const readyTime = order.readyAt
    ? new Date(order.readyAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-navy/5 last:border-0">
      <span className="text-lg shrink-0">{typeLabel}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {order.customerName
            ? <span className="font-body font-semibold text-navy text-sm">{order.customerName}</span>
            : <span className="font-display font-bold text-navy text-sm">{order.id}</span>
          }
          {order.customerName && <span className="font-body text-navy/30 text-xs">{order.id}</span>}
          {waitingForBar
            ? <span className="text-xs font-body text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">⏳ ממתין לבר</span>
            : readyTime && <span className="text-navy/30 text-xs font-body">הוגש {readyTime}</span>
          }
        </div>
        <div className="text-xs text-navy/50 font-body truncate">
          {order.items
            .filter(oi => {
              const cat = menuItems.find(m => m.id === oi.menuItemId)?.category
              return cat === 'food' || (cat === 'dessert' && dessertTo === 'kitchen')
            })
            .map(oi => {
              const mi = menuItems.find(m => m.id === oi.menuItemId)
              return `${oi.quantity}× ${mi?.nameHe ?? '?'}`
            }).join(', ')}
        </div>
      </div>
      <button onClick={() => onUndo(order.id)}
        className="shrink-0 px-3 py-1.5 rounded-lg border-2 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 text-xs font-body font-semibold transition-colors">
        ↩ החזר
      </button>
    </div>
  )
}

export default function KitchenPage() {
  const orders      = useStore(s => s.orders)
  const menuItems   = useStore(s => s.menuItems)
  const settings    = useStore(s => s.settings)
  const updateOrder = useStore(s => s.updateOrder)
  const refreshOrders          = useStore(s => s.refreshOrders)
  const showToast              = useStore(s => s.showToast)
  const toggleItemAvailability = useStore(s => s.toggleItemAvailability)
  const updateStockQuantity    = useStore(s => s.updateStockQuantity)

  const [showStockPanel, setShowStockPanel] = useState(false)
  const [showDonePanel, setShowDonePanel]   = useState(false)
  const [stockDraft, setStockDraft]         = useState<Record<string, string>>({})

  const dessertTo = settings.dessertTo ?? 'kitchen'

  useEffect(() => {
    const t = setInterval(refreshOrders, 5000)
    return () => clearInterval(t)
  }, [refreshOrders])

  useEffect(() => {
    if (showStockPanel) {
      const draft: Record<string, string> = {}
      for (const [id, qty] of Object.entries(settings.stockQuantities)) draft[id] = String(qty)
      setStockDraft(draft)
    }
  }, [showStockPanel]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndo = useCallback((id: string) => {
    const order = orders.find(o => o.id === id)
    if (!order) return
    // Uncheck kitchen items and clear kitchenDoneAt so card reappears
    const newChecked = { ...(order.checkedItems ?? {}) }
    order.items.forEach(oi => {
      const mi = menuItems.find(m => m.id === oi.menuItemId)
      if (!mi) return
      if (mi.category === 'food') delete newChecked[oi.menuItemId]
      if (mi.category === 'dessert' && dessertTo === 'kitchen') delete newChecked[oi.menuItemId]
    })
    updateOrder(id, {
      checkedItems: newChecked,
      kitchenDoneAt: undefined,
      ...(order.status === 'ready' ? { status: 'sent_to_kitchen', readyAt: undefined } : {}),
    })
    showToast('הזמנה הוחזרה להכנה')
  }, [orders, menuItems, dessertTo, updateOrder, showToast])

  function commitStock(menuItemId: string) {
    const raw = stockDraft[menuItemId]?.trim()
    const num = raw === '' || raw === undefined ? null : parseInt(raw, 10)
    updateStockQuantity(menuItemId, isNaN(num as number) ? null : num)
    showToast(num === null || isNaN(num as number) ? 'מלאי הוסר' : `מלאי עודכן: ${num} יח׳`)
  }

  // Kitchen sees food + desserts (if dessertTo === 'kitchen')
  const isKitchenItem = (cat: string) => cat === 'food' || (cat === 'dessert' && dessertTo === 'kitchen')

  const activeOrders = orders
    .filter(o => {
      if (o.status !== 'sent_to_kitchen') return false
      if (o.kitchenDoneAt) return false  // kitchen already clicked Done
      return o.items.some(oi => isKitchenItem(menuItems.find(m => m.id === oi.menuItemId)?.category ?? ''))
    })
    .sort((a, b) => new Date(a.sentToKitchenAt ?? a.createdAt).getTime() - new Date(b.sentToKitchenAt ?? b.createdAt).getTime())

  // Done panel: orders where kitchen has explicitly clicked Done (not just any 'ready' order)
  const doneOrders = orders
    .filter(o => !!o.kitchenDoneAt)
    .sort((a, b) => new Date(b.readyAt ?? b.kitchenDoneAt ?? '').getTime() - new Date(a.readyAt ?? a.kitchenDoneAt ?? '').getTime())

  const stockItems = menuItems.filter(m => isKitchenItem(m.category))

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden">
      <TopBar title="מטבח" titleEn="Kitchen" actions={
        <div className="flex gap-2">
          {doneOrders.length > 0 && (
            <button onClick={() => { setShowDonePanel(s => !s); setShowStockPanel(false) }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showDonePanel ? 'bg-green-500 text-white border-green-500' : 'border-cream/30 text-cream/70 hover:border-cream/60'}`}>
              ✓ מוכן <span className={`font-bold ${showDonePanel ? 'text-white' : 'text-green-400'}`}>{doneOrders.length}</span>
            </button>
          )}
          <button onClick={() => { setShowStockPanel(s => !s); setShowDonePanel(false) }}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showStockPanel ? 'bg-gold text-navy border-gold' : 'border-cream/30 text-cream/70 hover:border-cream/60'}`}>
            מלאי / Stock
          </button>
        </div>
      } />

      {/* Stock panel */}
      {showStockPanel && (
        <div className="bg-white border-b-2 border-navy/10 px-4 py-4 animate-fade-in overflow-y-auto max-h-72">
          <div className="max-w-4xl mx-auto">
            <div className="font-display font-bold text-navy text-sm mb-3">
              מלאי מטבח / Kitchen Stock
              <span className="font-body font-normal text-navy/40 text-xs mr-2">הכנס כמות שנותרה</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {stockItems.map(item => {
                const currentQty = settings.stockQuantities[item.id]
                const draft = stockDraft[item.id] ?? ''
                return (
                  <div key={item.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border-2 ${item.available ? 'border-navy/10 bg-white' : 'border-red-200 bg-red-50 opacity-70'}`}>
                    <button onClick={() => { toggleItemAvailability(item.id); showToast(item.available ? `${item.nameHe} הוסר` : `${item.nameHe} חזר`) }}
                      className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center text-sm transition-all
                        ${item.available ? 'border-green-300 bg-green-50 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600' : 'border-red-300 bg-red-100 text-red-600'}`}>
                      {item.available ? '✓' : '✕'}
                    </button>
                    <span className="text-lg shrink-0">{item.emoji}</span>
                    <span className="font-body font-semibold text-navy text-sm flex-1 min-w-0 truncate">{item.nameHe}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input type="number" min="0" dir="ltr" value={draft}
                        onChange={e => setStockDraft(d => ({ ...d, [item.id]: e.target.value }))}
                        onBlur={() => commitStock(item.id)}
                        onKeyDown={e => e.key === 'Enter' && commitStock(item.id)}
                        placeholder={currentQty !== undefined ? String(currentQty) : '∞'}
                        className="w-14 px-2 py-1 text-center text-sm font-body border-2 border-navy/20 rounded-lg focus:border-gold outline-none bg-cream" />
                      <span className="text-navy/30 text-xs font-body">יח׳</span>
                    </div>
                    {currentQty !== undefined && (
                      <span className="text-xs font-body text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">{currentQty} left</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Done orders panel */}
      {showDonePanel && (
        <div className="bg-white border-b-2 border-navy/10 px-4 py-3 animate-fade-in">
          <div className="max-w-4xl mx-auto">
            <div className="font-display font-bold text-navy text-sm mb-3">הזמנות שהוגשו / Done Orders</div>
            <div className="max-h-64 overflow-y-auto">
              {doneOrders.map(order => (
                <DoneOrderRow key={order.id} order={order} onUndo={handleUndo}
                  waitingForBar={order.status === 'sent_to_kitchen'} dessertTo={dessertTo} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {activeOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-navy/25">
            <div className="text-6xl mb-4">🍽</div>
            <div className="font-display font-bold text-xl">אין הזמנות פעילות</div>
            <div className="font-body text-sm mt-1">No active orders</div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-3 h-3 rounded-full bg-navy" />
              <h2 className="font-display font-bold text-navy text-lg">
                {activeOrders.length} הזמנות פתוחות
                <span className="font-body font-normal text-navy/40 text-xs mr-2">/ open orders</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOrders.map(order => <KitchenCard key={order.id} order={order} dessertTo={dessertTo} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
