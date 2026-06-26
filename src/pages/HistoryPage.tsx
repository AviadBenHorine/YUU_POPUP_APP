import { useState, useEffect, useRef } from 'react'
import React from 'react'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import { useStore } from '../stores/useStore'
import type { Order } from '../types'
import type { MenuItem } from '../types'
import { getImage } from '../services/imageDB'

const STATUS_LABELS: Record<string, { he: string; en: string; color: string }> = {
  open: { he: 'פתוח', en: 'Open', color: 'bg-navy/10 text-navy' },
  awaiting_payment: { he: 'ממתין לתשלום', en: 'Awaiting Payment', color: 'bg-amber-100 text-amber-700' },
  paid: { he: 'שולם', en: 'Paid', color: 'bg-blue-100 text-blue-700' },
  sent_to_kitchen: { he: 'במטבח', en: 'In Kitchen', color: 'bg-purple-100 text-purple-700' },
  ready: { he: 'מוכן', en: 'Ready', color: 'bg-green-100 text-green-700' },
  cancelled: { he: 'בוטל', en: 'Cancelled', color: 'bg-red-100 text-red-600' },
  deleted: { he: 'נמחק', en: 'Deleted', color: 'bg-gray-100 text-gray-500' },
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function downloadCSV(orders: Order[], menuItems: MenuItem[]) {
  const rows = [
    ['Order #', 'Type', 'Date', 'Items', 'Total (₪)', 'Status', 'Paid At'],
  ]
  for (const o of orders) {
    const items = o.items.map(oi => {
      const mi = menuItems.find(m => m.id === oi.menuItemId)
      return `${oi.quantity}x ${mi?.name ?? oi.menuItemId}`
    }).join('; ')
    rows.push([
      o.id,
      o.orderType === 'sit_down' ? 'Sit Down' : 'Take Away',
      formatDateTime(o.createdAt),
      items,
      String(o.totalPrice),
      STATUS_LABELS[o.status]?.en ?? o.status,
      o.paidAt ? formatDateTime(o.paidAt) : '',
    ])
  }
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `yuu_orders_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function HistoryPage() {
  const orders = useStore(s => s.orders)
  const menuItems = useStore(s => s.menuItems)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const proofUrlRef = useRef<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterPayment, setFilterPayment] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15

  // Only show orders that actually reached the kitchen
  // Cancelled orders are included only if they were already sent to kitchen
  const filtered = orders.filter(o => {
    if (o.status === 'cancelled' && !o.sentToKitchenAt) return false
    if (!['sent_to_kitchen', 'ready', 'cancelled', 'deleted'].includes(o.status)) return false
    if (filterStatus !== 'all' && o.status !== filterStatus) return false
    if (filterType !== 'all' && o.orderType !== filterType) return false
    if (filterDateFrom && o.createdAt < new Date(filterDateFrom).toISOString()) return false
    if (filterPayment !== 'all' && o.paymentMethod !== filterPayment) return false
    if (filterDateTo) {
      const endOfDay = new Date(filterDateTo)
      endOfDay.setDate(endOfDay.getDate() + 1)
      if (o.createdAt >= endOfDay.toISOString()) return false
    }
    return true
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [filterStatus, filterType, filterPayment, filterDateFrom, filterDateTo])

  async function handleExpand(order: Order) {
    // Revoke previous object URL to prevent memory leak
    if (proofUrlRef.current) {
      URL.revokeObjectURL(proofUrlRef.current)
      proofUrlRef.current = null
    }
    if (expandedId === order.id) { setExpandedId(null); setProofUrl(null); return }
    setExpandedId(order.id)
    setProofUrl(null)
    if (order.paymentProofImageKey) {
      const url = await getImage(order.paymentProofImageKey)
      proofUrlRef.current = url
      setProofUrl(url)
    }
  }

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden">
      <TopBar title="היסטוריה" titleEn="Order History" />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {/* Filters */}
          <div className="bg-white rounded-2xl border-2 border-navy/10 p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="font-body text-xs text-navy/50 block mb-1">סטטוס / Status</label>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="border-2 border-navy/15 rounded-lg px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold"
                >
                  <option value="all">הכל / All</option>
                  {(['sent_to_kitchen', 'ready', 'cancelled', 'deleted'] as const).map(k => (
                    <option key={k} value={k}>{STATUS_LABELS[k].he} / {STATUS_LABELS[k].en}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-body text-xs text-navy/50 block mb-1">סוג / Type</label>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="border-2 border-navy/15 rounded-lg px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold"
                >
                  <option value="all">הכל / All</option>
                  <option value="sit_down">🪑 ישיבה / Sit Down</option>
                  <option value="take_away">🥡 לקחת / Take Away</option>
                </select>
              </div>
              <div>
                <label className="font-body text-xs text-navy/50 block mb-1">מתאריך / From</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="border-2 border-navy/15 rounded-lg px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="font-body text-xs text-navy/50 block mb-1">עד תאריך / To</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="border-2 border-navy/15 rounded-lg px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="font-body text-xs text-navy/50 block mb-1">תשלום / Payment</label>
                <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
                  className="border-2 border-navy/15 rounded-lg px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold">
                  <option value="all">הכל / All</option>
                  <option value="bit">Bit</option>
                  <option value="staff">על החשבון / Staff</option>
                </select>
              </div>
              <button
                onClick={() => { setFilterStatus('all'); setFilterType('all'); setFilterPayment('all'); setFilterDateFrom(''); setFilterDateTo('') }}
                className="px-4 py-2 border-2 border-navy/15 rounded-lg text-sm font-body text-navy/60 hover:border-navy/40 transition-colors"
              >
                נקה / Clear
              </button>
              <button
                onClick={() => downloadCSV(filtered, menuItems)}
                className="px-4 py-2 bg-navy text-cream rounded-lg text-sm font-body hover:bg-navy/80 transition-colors mr-auto"
              >
                📥 ייצוא CSV / Export
              </button>
            </div>
            <div className="mt-3 text-navy/40 font-body text-xs">{filtered.length} הזמנות / orders</div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border-2 border-navy/10 overflow-hidden">
            {paginated.length === 0 ? (
              <div className="py-16 text-center text-navy/30 font-body">אין הזמנות / No orders</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-navy/10 bg-cream/50">
                      {['מס׳', 'סוג', 'תאריך', 'פריטים', 'סה"כ', 'סטטוס', 'אישור'].map(h => (
                        <th key={h} className="px-4 py-3 text-right text-xs font-display font-bold text-navy/50 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(order => (
                      <React.Fragment key={order.id}>
                        <tr
                          onClick={() => handleExpand(order)}
                          className={`border-b border-navy/5 hover:bg-cream/60 cursor-pointer transition-colors ${order.paymentMethod === 'staff' ? 'opacity-60' : ''}`}
                        >
                          <td className="px-4 py-3">
                            {order.customerName
                              ? <><div className="font-body font-semibold text-navy text-sm">{order.customerName}</div>
                                  <div className="font-body text-navy/30 text-xs">{order.id}</div></>
                              : <div className="font-display font-bold text-navy text-sm">{order.id}</div>
                            }
                          </td>
                          <td className="px-4 py-3 font-body text-sm">
                            {order.orderType === 'sit_down' ? '🪑' : '🥡'}
                          </td>
                          <td className="px-4 py-3 font-body text-navy/60 text-xs whitespace-nowrap">{formatDateTime(order.createdAt)}</td>
                          <td className="px-4 py-3 font-body text-navy/60 text-xs">
                            {order.items.slice(0, 2).map(oi => {
                              const mi = menuItems.find(m => m.id === oi.menuItemId)
                              return `${oi.quantity}× ${mi?.nameHe ?? '?'}`
                            }).join(', ')}
                            {order.items.length > 2 ? ` +${order.items.length - 2}` : ''}
                          </td>
                          <td className="px-4 py-3">
                            {order.paymentMethod === 'staff'
                              ? <span className="text-xs px-2 py-0.5 rounded-full font-body bg-slate-100 text-slate-500">על החשבון</span>
                              : <span className="font-display font-bold text-navy text-sm">₪{order.totalPrice}</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-body ${STATUS_LABELS[order.status]?.color}`}>
                              {STATUS_LABELS[order.status]?.he}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-navy/30 text-sm">
                            {order.paymentProofImageKey ? '📷' : '—'}
                          </td>
                        </tr>
                        {expandedId === order.id && (
                          <tr className="bg-cream/40">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="flex gap-8 flex-wrap">
                                <div className="flex-1 min-w-48">
                                  <div className="font-display font-bold text-navy text-sm mb-2">פריטים / Items</div>
                                  <div className="space-y-1">
                                    {order.items.map((oi, i) => {
                                      const mi = menuItems.find(m => m.id === oi.menuItemId)
                                      return (
                                        <div key={`${oi.menuItemId}-${i}`} className="flex justify-between text-sm font-body">
                                          <span className="text-navy/70">{oi.quantity}× {mi?.nameHe} {mi?.emoji}</span>
                                          <span className="text-navy/50 font-semibold">₪{(mi?.price ?? 0) * oi.quantity}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                                {proofUrl && (
                                  <div>
                                    <div className="font-display font-bold text-navy text-sm mb-2">אישור תשלום / Payment Proof</div>
                                    <img
                                      src={proofUrl}
                                      alt="payment proof"
                                      className="w-28 h-28 object-cover rounded-xl border-2 border-gold cursor-pointer hover:opacity-80 transition-opacity"
                                      onClick={() => setLightboxUrl(proofUrl)}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-lg border-2 border-navy/15 text-navy font-body text-sm disabled:opacity-30 hover:border-navy/40 transition-colors"
              >
                ‹ הקודם
              </button>
              <span className="font-body text-sm text-navy/50">{page} / {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-lg border-2 border-navy/15 text-navy font-body text-sm disabled:opacity-30 hover:border-navy/40 transition-colors"
              >
                הבא ›
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <Modal open={!!lightboxUrl} onClose={() => setLightboxUrl(null)} title="אישור תשלום" maxWidth="max-w-2xl">
        {lightboxUrl && <img src={lightboxUrl} alt="payment proof" className="w-full rounded-xl" />}
      </Modal>
    </div>
  )
}
