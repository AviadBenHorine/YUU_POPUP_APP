import { useState, useEffect, useCallback } from 'react'
import TopBar from '../components/TopBar'
import { useStore } from '../stores/useStore'
import type { Order } from '../types'

function elapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime()
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  if (mins > 0) return `${mins}:${String(secs).padStart(2, '0')}`
  return `0:${String(secs).padStart(2, '0')}`
}

function agingClass(since: string): string {
  const mins = (Date.now() - new Date(since).getTime()) / 60000
  if (mins > 10) return 'border-red-400 bg-red-50 urgent-pulse'
  if (mins > 5) return 'border-amber-400 bg-amber-50'
  return 'border-navy/20 bg-white'
}

function agingTextClass(since: string): string {
  const mins = (Date.now() - new Date(since).getTime()) / 60000
  if (mins > 10) return 'text-red-500 font-bold'
  if (mins > 5) return 'text-amber-600 font-semibold'
  return 'text-navy/50'
}

function KitchenCard({ order, onReady }: { order: Order; onReady: (id: string) => void }) {
  const menuItems = useStore(s => s.menuItems)
  const [, tick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const since = order.sentToKitchenAt ?? order.createdAt
  const typeLabel = order.orderType === 'sit_down' ? '🪑 ישיבה' : '🥡 לקחת'
  const typeEn = order.orderType === 'sit_down' ? 'SIT DOWN' : 'TAKE AWAY'

  return (
    <div className={`rounded-2xl border-2 p-4 transition-all relative overflow-hidden ${agingClass(since)}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-display font-black text-navy text-xl">{order.id}</div>
          <div className={`
            inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-display font-bold mt-1
            ${order.orderType === 'sit_down' ? 'bg-navy text-cream' : 'bg-gold text-navy'}
          `}>
            {typeLabel} <span className="opacity-60">/ {typeEn}</span>
          </div>
        </div>
        <div className="text-left">
          <div className={`font-display font-bold text-lg tabular-nums ${agingTextClass(since)}`}>
            {elapsed(since)}
          </div>
          <div className="text-navy/30 text-xs mt-0.5">
            {new Date(order.sentToKitchenAt ?? order.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <div className="space-y-1.5 mb-4">
        {order.items.map(oi => {
          const mi = menuItems.find(m => m.id === oi.menuItemId)
          if (!mi) return null
          return (
            <div key={oi.menuItemId} className="flex items-baseline gap-2">
              <span className="font-display font-black text-navy text-lg w-8 shrink-0">{oi.quantity}×</span>
              <div>
                <span className="font-body font-semibold text-navy text-base">{mi.nameHe}</span>
                <span className="font-body text-navy/40 text-sm mr-1">/ {mi.name}</span>
                {oi.notes && (
                  <div className="text-xs text-amber-700 italic font-body mt-0.5 bg-amber-50 px-2 py-0.5 rounded inline-block">
                    ⚠ {oi.notes}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={() => onReady(order.id)}
        className="w-full py-3.5 rounded-xl bg-navy text-cream font-display font-bold text-base hover:bg-navy/80 active:scale-95 transition-all"
      >
        מוכן ✓ / Ready
      </button>
    </div>
  )
}

function DoneOrderRow({ order, onUndo }: { order: Order; onUndo: (id: string) => void }) {
  const menuItems = useStore(s => s.menuItems)
  const typeLabel = order.orderType === 'sit_down' ? '🪑' : '🥡'
  const readyTime = order.readyAt
    ? new Date(order.readyAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-navy/5 last:border-0">
      <span className="text-lg shrink-0">{typeLabel}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-navy text-sm">{order.id}</span>
          {readyTime && <span className="text-navy/30 text-xs font-body">הוגש {readyTime}</span>}
        </div>
        <div className="text-xs text-navy/50 font-body truncate">
          {order.items.map(oi => {
            const mi = menuItems.find(m => m.id === oi.menuItemId)
            return `${oi.quantity}× ${mi?.nameHe ?? '?'}`
          }).join(', ')}
        </div>
      </div>
      <button
        onClick={() => onUndo(order.id)}
        className="shrink-0 px-3 py-1.5 rounded-lg border-2 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 text-xs font-body font-semibold transition-colors"
      >
        ↩ החזר
      </button>
    </div>
  )
}

export default function KitchenPage() {
  const orders = useStore(s => s.orders)
  const menuItems = useStore(s => s.menuItems)
  const updateOrder = useStore(s => s.updateOrder)
  const refreshOrders = useStore(s => s.refreshOrders)
  const showToast = useStore(s => s.showToast)
  const toggleItemAvailability = useStore(s => s.toggleItemAvailability)

  const [showStockPanel, setShowStockPanel] = useState(false)
  const [showDonePanel, setShowDonePanel] = useState(false)

  useEffect(() => {
    const t = setInterval(refreshOrders, 5000)
    return () => clearInterval(t)
  }, [refreshOrders])

  const handleReady = useCallback((id: string) => {
    updateOrder(id, { status: 'ready', readyAt: new Date().toISOString() })
    showToast('הזמנה מוכנה ✓')
  }, [updateOrder, showToast])

  const handleUndo = useCallback((id: string) => {
    updateOrder(id, { status: 'sent_to_kitchen' })
    showToast('הזמנה הוחזרה להכנה')
  }, [updateOrder, showToast])

  const activeOrders = orders
    .filter(o => o.status === 'sent_to_kitchen')
    .sort((a, b) => new Date(a.sentToKitchenAt ?? a.createdAt).getTime() - new Date(b.sentToKitchenAt ?? b.createdAt).getTime())

  const doneOrders = orders
    .filter(o => o.status === 'ready')
    .sort((a, b) => new Date(b.readyAt ?? '').getTime() - new Date(a.readyAt ?? '').getTime())

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden">
      <TopBar
        title="מטבח"
        titleEn="Kitchen"
        actions={
          <div className="flex gap-2">
            {doneOrders.length > 0 && (
              <button
                onClick={() => { setShowDonePanel(s => !s); setShowStockPanel(false) }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors relative ${showDonePanel ? 'bg-green-500 text-white border-green-500' : 'border-cream/30 text-cream/70 hover:border-cream/60'}`}
              >
                ✓ מוכן
                <span className={`mr-1 font-bold ${showDonePanel ? 'text-white' : 'text-green-400'}`}>
                  {doneOrders.length}
                </span>
              </button>
            )}
            <button
              onClick={() => { setShowStockPanel(s => !s); setShowDonePanel(false) }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showStockPanel ? 'bg-gold text-navy border-gold' : 'border-cream/30 text-cream/70 hover:border-cream/60'}`}
            >
              מלאי / Stock
            </button>
          </div>
        }
      />

      {/* Stock panel */}
      {showStockPanel && (
        <div className="bg-white border-b-2 border-navy/10 px-4 py-3 animate-fade-in">
          <div className="max-w-4xl mx-auto">
            <div className="font-display font-bold text-navy text-sm mb-3">
              זמינות פריטים / Item Availability
              <span className="font-body font-normal text-navy/40 text-xs mr-2">לחץ להסרה מהתפריט / tap to toggle</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {menuItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    toggleItemAvailability(item.id)
                    showToast(item.available ? `${item.nameHe} הוסר מהתפריט` : `${item.nameHe} חזר לתפריט`)
                  }}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-body border-2 transition-all
                    ${item.available
                      ? 'bg-green-50 border-green-300 text-green-800 hover:bg-red-50 hover:border-red-300 hover:text-red-700'
                      : 'bg-red-50 border-red-300 text-red-700 line-through opacity-70 hover:opacity-100'
                    }
                  `}
                >
                  <span>{item.emoji}</span>
                  <span>{item.nameHe}</span>
                  {!item.available && <span className="text-xs">✕</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Done orders panel */}
      {showDonePanel && (
        <div className="bg-white border-b-2 border-navy/10 px-4 py-3 animate-fade-in">
          <div className="max-w-4xl mx-auto">
            <div className="font-display font-bold text-navy text-sm mb-3">
              הזמנות שהוגשו / Done Orders
              <span className="font-body font-normal text-navy/40 text-xs mr-2">לחץ "החזר" לשלוח חזרה להכנה</span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {doneOrders.map(order => (
                <DoneOrderRow key={order.id} order={order} onUndo={handleUndo} />
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
                סה"כ הזמנות פתוחות: {activeOrders.length}
                <span className="font-body font-normal text-navy/40 text-xs mr-2">/ Total open orders</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOrders.map(order => (
                <KitchenCard key={order.id} order={order} onReady={handleReady} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
