import { useState, useEffect, useMemo } from 'react'
import React from 'react'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import TopBar from '../components/TopBar'
import { useStore } from '../stores/useStore'
import {
  subscribeEventSnapshots, updateEventNotes, deleteEventSnapshot, FIREBASE_ENABLED,
} from '../services/firebase'
import type { EventSnapshot, Order, MenuItem } from '../types'

const PIE_COLORS = ['#1A2340', '#C8A96E', '#4B6380']

const STATUS_LABELS: Record<string, { he: string; color: string }> = {
  sent_to_kitchen: { he: 'במטבח', color: 'bg-purple-100 text-purple-700' },
  ready:           { he: 'מוכן',  color: 'bg-green-100 text-green-700' },
  cancelled:       { he: 'בוטל',  color: 'bg-red-100 text-red-600' },
  deleted:         { he: 'נמחק',  color: 'bg-gray-100 text-gray-500' },
}

function fmtCurrency(n: number) { return `₪${n.toLocaleString()}` }
function fmtMins(mins: number | null) { return mins === null ? '—' : `${Math.round(mins)}′` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Pure function — compute analytics stats from a snapshot's orders+menu
function computeAnalytics(orders: Order[], menuItems: MenuItem[]) {
  const paid = orders.filter(o =>
    !['open', 'awaiting_payment', 'cancelled'].includes(o.status) && o.paymentMethod !== 'staff'
  )
  const staff = orders.filter(o =>
    !['open', 'awaiting_payment', 'cancelled'].includes(o.status) && o.paymentMethod === 'staff'
  )

  const totalRevenue = paid.reduce((s, o) => s + o.totalPrice, 0)
  const staffRevenue = staff.reduce((s, o) => s + o.totalPrice, 0)
  const avgOrderValue = paid.length > 0 ? Math.round(totalRevenue / paid.length) : 0
  const totalUnits = paid.reduce((s, o) => s + o.items.reduce((q, oi) => q + oi.quantity, 0), 0)
  const avgItems = paid.length > 0 ? (totalUnits / paid.length).toFixed(1) : '—'
  const sitDown = paid.filter(o => o.orderType === 'sit_down').length
  const takeAway = paid.filter(o => o.orderType === 'take_away').length

  // Top items
  const itemCounts: Record<string, number> = {}
  for (const o of paid) {
    for (const oi of o.items) {
      itemCounts[oi.menuItemId] = (itemCounts[oi.menuItemId] ?? 0) + oi.quantity
    }
  }
  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, qty]) => {
      const mi = menuItems.find(m => m.id === id)
      return { name: mi?.nameHe ?? id, emoji: mi?.emoji ?? '', qty }
    })

  // Revenue by category
  const catRev: Record<string, number> = { food: 0, drink: 0, dessert: 0 }
  for (const o of paid) {
    for (const oi of o.items) {
      const mi = menuItems.find(m => m.id === oi.menuItemId)
      if (mi) catRev[mi.category] = (catRev[mi.category] ?? 0) + mi.price * oi.quantity
    }
  }
  const pieData = [
    { name: 'אוכל / Food', value: catRev.food },
    { name: 'שתייה / Drinks', value: catRev.drink },
    { name: 'קינוחים / Desserts', value: catRev.dessert },
  ].filter(d => d.value > 0)

  // Orders by hour
  const buckets: Record<number, number> = {}
  for (let h = 0; h < 24; h++) buckets[h] = 0
  for (const o of paid) { buckets[new Date(o.createdAt).getHours()]++ }
  const activeHours = Object.keys(buckets).map(Number).filter(h => buckets[h] > 0)
  const hourlyData = activeHours.length === 0 ? [] : (() => {
    const minH = Math.min(...activeHours), maxH = Math.max(...activeHours)
    return Array.from({ length: maxH - minH + 1 }, (_, i) => {
      const h = minH + i
      return { hour: `${String(h).padStart(2, '0')}:00`, orders: buckets[h] }
    })
  })()

  // Peak hour
  const peakEntry = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]
  const peakHour = peakEntry && Number(peakEntry[1]) > 0
    ? { hour: `${peakEntry[0]}:00`, count: Number(peakEntry[1]) }
    : null

  // Service times
  const kitchenTimes: number[] = [], barTimes: number[] = []
  for (const o of orders) {
    if (!o.sentToKitchenAt) continue
    const sent = new Date(o.sentToKitchenAt).getTime()
    if (o.kitchenDoneAt) { const m = (new Date(o.kitchenDoneAt).getTime() - sent) / 60000; if (m > 0 && m < 180) kitchenTimes.push(m) }
    if (o.barDoneAt)     { const m = (new Date(o.barDoneAt).getTime() - sent) / 60000;     if (m > 0 && m < 180) barTimes.push(m) }
  }
  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  return {
    paid, staff, totalRevenue, staffRevenue, avgOrderValue, avgItems,
    sitDown, takeAway, topItems, pieData, hourlyData, peakHour,
    kitchenAvg: avg(kitchenTimes), kitchenMax: kitchenTimes.length ? Math.max(...kitchenTimes) : null,
    barAvg: avg(barTimes), barMax: barTimes.length ? Math.max(...barTimes) : null,
    kitchenCount: kitchenTimes.length, barCount: barTimes.length,
  }
}

const PAGE_SIZE = 15

export default function EventsPage() {
  const showToast = useStore(s => s.showToast)

  const [snapshots, setSnapshots] = useState<EventSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'analytics' | 'history' | 'notes'>('analytics')
  const [notesText, setNotesText] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // history tab state
  const [historyFilter, setHistoryFilter] = useState<string>('all')
  const [historyPage, setHistoryPage] = useState(1)

  useEffect(() => {
    if (!FIREBASE_ENABLED) { setLoading(false); return }
    return subscribeEventSnapshots(events => {
      setSnapshots(events.sort((a, b) => b.savedAt.localeCompare(a.savedAt)))
      setLoading(false)
    })
  }, [])

  const selectedEvent = snapshots.find(s => s.id === expandedId) ?? null

  const analytics = useMemo(
    () => selectedEvent ? computeAnalytics(selectedEvent.orders, selectedEvent.menuItems) : null,
    [selectedEvent]
  )

  const historyOrders = useMemo(() => {
    if (!selectedEvent) return []
    return selectedEvent.orders
      .filter(o => {
        if (!o.sentToKitchenAt) return false
        if (!['sent_to_kitchen', 'ready', 'cancelled', 'deleted'].includes(o.status)) return false
        if (historyFilter !== 'all' && o.status !== historyFilter) return false
        return true
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [selectedEvent, historyFilter])

  const historyPages = Math.max(1, Math.ceil(historyOrders.length / PAGE_SIZE))
  const historyPaginated = historyOrders.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE)

  function handleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    const ev = snapshots.find(s => s.id === id)
    setExpandedId(id)
    setActiveTab('analytics')
    setNotesText(ev?.notes ?? '')
    setHistoryFilter('all')
    setHistoryPage(1)
  }

  async function handleSaveNotes() {
    if (!expandedId) return
    setSavingNotes(true)
    try {
      await updateEventNotes(expandedId, notesText)
      setSnapshots(prev => prev.map(s => s.id === expandedId ? { ...s, notes: notesText } : s))
      showToast('הערות נשמרו / Notes saved')
    } catch {
      showToast('שגיאה בשמירה / Save failed', 'error')
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleDeleteEvent(id: string) {
    setDeletingId(id)
    try {
      await deleteEventSnapshot(id)
      setSnapshots(prev => prev.filter(s => s.id !== id))
      if (expandedId === id) setExpandedId(null)
      setDeleteConfirmId(null)
      showToast('האירוע נמחק / Event deleted')
    } catch {
      showToast('שגיאה במחיקה / Delete failed', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const KPI = ({ label, labelEn, value, sub }: { label: string; labelEn: string; value: string; sub?: string }) => (
    <div className="bg-cream rounded-2xl border-2 border-navy/10 p-4 space-y-1">
      <div className="font-body text-xs text-navy/40 uppercase tracking-wider">{label}</div>
      <div className="font-display font-black text-navy text-2xl">{value}</div>
      {sub && <div className="font-body text-xs text-gold">{sub}</div>}
      <div className="font-body text-xs text-navy/30">{labelEn}</div>
    </div>
  )

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden">
      <TopBar title="ארכיון אירועים" titleEn="Event Archive" />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">

          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
            </div>
          ) : !FIREBASE_ENABLED ? (
            <div className="py-20 text-center">
              <div className="text-4xl mb-3">☁️</div>
              <div className="font-display font-bold text-navy text-lg mb-1">Firebase לא מוגדר</div>
              <div className="font-body text-navy/40 text-sm">Event archive requires Firebase / ארכיון אירועים דורש Firebase</div>
            </div>
          ) : snapshots.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-5xl mb-4">📦</div>
              <div className="font-display font-bold text-navy text-xl mb-2">אין אירועים שמורים</div>
              <div className="font-body text-navy/50 text-sm max-w-sm mx-auto">
                No saved events yet. Before resetting Analytics, click{' '}
                <span className="text-gold font-semibold">💾 Save Event</span>{' '}
                to archive the current event's data.
              </div>
            </div>
          ) : (
            snapshots.map(event => {
              const paidCount = event.orders.filter(o =>
                !['open', 'awaiting_payment', 'cancelled'].includes(o.status) && o.paymentMethod !== 'staff'
              ).length
              const revenue = event.orders
                .filter(o => !['open', 'awaiting_payment', 'cancelled'].includes(o.status) && o.paymentMethod !== 'staff')
                .reduce((s, o) => s + o.totalPrice, 0)
              const isOpen = expandedId === event.id

              return (
                <div key={event.id} className="space-y-0">

                  {/* Event card header */}
                  <div
                    className={`bg-white rounded-2xl border-2 transition-colors cursor-pointer
                      ${isOpen ? 'border-gold/60 rounded-b-none border-b-0' : 'border-navy/10 hover:border-gold/40'}`}
                  >
                    <div className="p-5" onClick={() => handleExpand(event.id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-display font-bold text-navy text-lg leading-tight">{event.name}</div>
                          <div className="font-body text-navy/45 text-xs mt-0.5">
                            {fmtDate(event.eventDate)}
                            <span className="mx-2 text-navy/20">·</span>
                            נשמר {fmtDate(event.savedAt)}
                          </div>
                        </div>
                        <span className="text-navy/30 text-sm flex-shrink-0 mt-1">{isOpen ? '▲' : '▼'}</span>
                      </div>
                      <div className="flex items-center gap-6 mt-3">
                        <div>
                          <span className="font-display font-black text-navy text-xl">{paidCount}</span>
                          <span className="font-body text-xs text-navy/40 mr-1">הזמנות</span>
                        </div>
                        <div>
                          <span className="font-display font-black text-gold text-xl">{fmtCurrency(revenue)}</span>
                          <span className="font-body text-xs text-navy/40 mr-1">הכנסות</span>
                        </div>
                        {event.notes && (
                          <span className="text-xs font-body text-navy/30 flex items-center gap-1">
                            📝 <span>יש הערות</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete controls inside card, below summary */}
                    <div className="px-5 pb-3 flex justify-end">
                      {deleteConfirmId === event.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-body text-red-500">מחיקה סופית? / Confirm?</span>
                          <button
                            onClick={() => handleDeleteEvent(event.id)}
                            disabled={deletingId === event.id}
                            className="px-3 py-1 bg-red-500 text-white text-xs rounded-lg font-body hover:bg-red-600 disabled:opacity-50 transition-colors"
                          >
                            {deletingId === event.id ? '...' : 'מחק'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-3 py-1 border border-navy/20 text-navy/50 text-xs rounded-lg font-body hover:border-navy/40 transition-colors"
                          >
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteConfirmId(event.id) }}
                          className="text-xs font-body text-navy/25 hover:text-red-400 transition-colors"
                        >
                          🗑️ מחק ארכיון
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isOpen && analytics && (
                    <div className="bg-white border-2 border-gold/60 border-t-0 rounded-b-2xl overflow-hidden">

                      {/* Tab bar */}
                      <div className="flex border-b-2 border-navy/8">
                        {([
                          { id: 'analytics', label: '📊 נתונים', en: 'Analytics' },
                          { id: 'history',   label: '📋 היסטוריה', en: 'History' },
                          { id: 'notes',     label: '📝 הערות', en: 'Notes' },
                        ] as const).map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-3 font-body text-sm font-medium transition-colors
                              ${activeTab === tab.id
                                ? 'text-navy border-b-2 border-gold -mb-0.5 bg-gold/5'
                                : 'text-navy/40 hover:text-navy/70'}`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* ── Analytics tab ─────────────────────────────────────── */}
                      {activeTab === 'analytics' && (
                        <div className="p-5 space-y-6">

                          {/* KPI row 1 */}
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            <KPI label="סה״כ הכנסות" labelEn="Total Revenue" value={fmtCurrency(analytics.totalRevenue)}
                              sub={analytics.staff.length > 0 ? `+ ${fmtCurrency(analytics.staffRevenue)} על החשבון` : undefined} />
                            <KPI label="הזמנות" labelEn="Paid Orders" value={String(analytics.paid.length)}
                              sub={analytics.staff.length > 0 ? `+ ${analytics.staff.length} על החשבון` : undefined} />
                            <KPI label="ממוצע להזמנה" labelEn="Avg Order Value" value={fmtCurrency(analytics.avgOrderValue)} />
                            <KPI label="פריטים ממוצע" labelEn="Avg Items / Order" value={String(analytics.avgItems)} />
                            <div className="bg-cream rounded-2xl border-2 border-navy/10 p-4 space-y-1">
                              <div className="font-body text-xs text-navy/40 uppercase tracking-wider">ישיבה vs לקחת</div>
                              <div className="flex items-end gap-2 pt-1">
                                <div>
                                  <div className="font-display font-black text-navy text-xl">{analytics.sitDown}</div>
                                  <div className="text-xs font-body text-navy/40">🪑 ישיבה</div>
                                </div>
                                <div className="text-navy/20 pb-3">|</div>
                                <div>
                                  <div className="font-display font-black text-gold text-xl">{analytics.takeAway}</div>
                                  <div className="text-xs font-body text-navy/40">🥡 לקחת</div>
                                </div>
                              </div>
                              <div className="font-body text-xs text-navy/30">Sit Down / Take Away</div>
                            </div>
                          </div>

                          {/* KPI row 2 — service times */}
                          {(analytics.kitchenCount > 0 || analytics.barCount > 0) && (
                            <div>
                              <div className="font-body text-xs text-navy/40 uppercase tracking-wider mb-3">זמני שירות / Service Times</div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <KPI label="ממוצע מטבח" labelEn={`Kitchen Avg (${analytics.kitchenCount})`} value={fmtMins(analytics.kitchenAvg)} />
                                <KPI label="ארוך ביותר מטבח" labelEn="Kitchen Longest" value={fmtMins(analytics.kitchenMax)} />
                                <KPI label="ממוצע בר" labelEn={`Bar Avg (${analytics.barCount})`} value={fmtMins(analytics.barAvg)} />
                                <KPI label="ארוך ביותר בר" labelEn="Bar Longest" value={fmtMins(analytics.barMax)} />
                              </div>
                            </div>
                          )}

                          {/* Charts */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                            {/* Top items */}
                            {analytics.topItems.length > 0 && (
                              <div className="bg-cream rounded-2xl border-2 border-navy/10 p-4">
                                <div className="font-display font-bold text-navy text-sm mb-3">פריטים פופולריים / Top Items</div>
                                <div className="space-y-2.5">
                                  {analytics.topItems.map((item, i) => {
                                    const pct = Math.round(item.qty / analytics.topItems[0].qty * 100)
                                    return (
                                      <div key={i} className="flex items-center gap-2">
                                        <span className="w-4 text-center font-body text-xs text-navy/25 flex-shrink-0">{i + 1}</span>
                                        <div className="w-24 text-right font-body text-xs text-navy/70 truncate flex-shrink-0" dir="rtl">
                                          {item.emoji && <span className="mr-1">{item.emoji}</span>}{item.name}
                                        </div>
                                        <div className="flex-1 h-3 bg-white rounded-full overflow-hidden">
                                          <div className="h-full bg-navy rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="w-6 text-right font-display font-bold text-navy text-xs flex-shrink-0">{item.qty}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Revenue by category pie */}
                            {analytics.pieData.length > 0 && (
                              <div className="bg-cream rounded-2xl border-2 border-navy/10 p-4">
                                <div className="font-display font-bold text-navy text-sm mb-3">הכנסות לפי קטגוריה / Revenue by Category</div>
                                <ResponsiveContainer width="100%" height={200}>
                                  <PieChart>
                                    <Pie data={analytics.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
                                      {analytics.pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(v) => fmtCurrency(Number(v))} />
                                    <Legend formatter={(v) => <span style={{ fontFamily: 'Heebo', fontSize: 11, color: '#1A2340' }}>{v}</span>} />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            )}

                            {/* Orders by hour */}
                            {analytics.hourlyData.length > 1 && (
                              <div className="bg-cream rounded-2xl border-2 border-navy/10 p-4 md:col-span-2">
                                <div className="font-display font-bold text-navy text-sm mb-1">הזמנות לפי שעה / Orders by Hour</div>
                                {analytics.peakHour && (
                                  <div className="font-body text-xs text-navy/40 mb-3">
                                    שעת שיא: {analytics.peakHour.hour} ({analytics.peakHour.count} הזמנות)
                                  </div>
                                )}
                                <ResponsiveContainer width="100%" height={180}>
                                  <LineChart data={analytics.hourlyData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="hour" tick={{ fontSize: 10, fontFamily: 'Heebo' }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fontFamily: 'Heebo' }} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="orders" stroke="#1A2340" strokeWidth={2} dot={{ r: 3 }} name="הזמנות" />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── History tab ───────────────────────────────────────── */}
                      {activeTab === 'history' && (
                        <div className="p-5 space-y-4">
                          <div className="flex items-center gap-3 flex-wrap">
                            <div>
                              <label className="font-body text-xs text-navy/50 block mb-1">סטטוס / Status</label>
                              <select
                                value={historyFilter}
                                onChange={e => { setHistoryFilter(e.target.value); setHistoryPage(1) }}
                                className="border-2 border-navy/15 rounded-lg px-3 py-1.5 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold"
                              >
                                <option value="all">הכל / All</option>
                                {(['sent_to_kitchen', 'ready', 'cancelled', 'deleted'] as const).map(k => (
                                  <option key={k} value={k}>{STATUS_LABELS[k]?.he}</option>
                                ))}
                              </select>
                            </div>
                            <div className="font-body text-xs text-navy/40 self-end pb-2">
                              {historyOrders.length} הזמנות
                            </div>
                          </div>

                          <div className="bg-cream rounded-2xl border-2 border-navy/10 overflow-hidden">
                            {historyPaginated.length === 0 ? (
                              <div className="py-10 text-center font-body text-sm text-navy/30">אין הזמנות / No orders</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b-2 border-navy/10 bg-white/50">
                                      {['מס׳', 'סוג', 'תאריך', 'פריטים', 'סה"כ', 'סטטוס'].map(h => (
                                        <th key={h} className="px-4 py-3 text-right text-xs font-display font-bold text-navy/50 uppercase tracking-wider">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {historyPaginated.map(order => (
                                      <React.Fragment key={order.id}>
                                        <tr className="border-b border-navy/5">
                                          <td className="px-4 py-3">
                                            {order.customerName
                                              ? <><div className="font-body font-semibold text-navy text-sm">{order.customerName}</div>
                                                  <div className="font-body text-navy/30 text-xs">{order.id}</div></>
                                              : <div className="font-display font-bold text-navy text-sm">{order.id}</div>
                                            }
                                          </td>
                                          <td className="px-4 py-3 text-sm">{order.orderType === 'sit_down' ? '🪑' : '🥡'}</td>
                                          <td className="px-4 py-3 font-body text-navy/60 text-xs whitespace-nowrap">{fmtDateTime(order.createdAt)}</td>
                                          <td className="px-4 py-3 font-body text-navy/60 text-xs">
                                            {order.items.slice(0, 2).map(oi => {
                                              const mi = selectedEvent!.menuItems.find(m => m.id === oi.menuItemId)
                                              return `${oi.quantity}× ${mi?.nameHe ?? '?'}`
                                            }).join(', ')}
                                            {order.items.length > 2 ? ` +${order.items.length - 2}` : ''}
                                          </td>
                                          <td className="px-4 py-3">
                                            {order.paymentMethod === 'staff'
                                              ? <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-body">על החשבון</span>
                                              : <span className="font-display font-bold text-navy text-sm">₪{order.totalPrice}</span>
                                            }
                                          </td>
                                          <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-body ${STATUS_LABELS[order.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                                              {STATUS_LABELS[order.status]?.he ?? order.status}
                                            </span>
                                          </td>
                                        </tr>
                                      </React.Fragment>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {historyPages > 1 && (
                            <div className="flex items-center justify-center gap-3">
                              <button disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)}
                                className="px-4 py-2 rounded-lg border-2 border-navy/15 text-navy font-body text-sm disabled:opacity-30 hover:border-navy/40 transition-colors">
                                ‹ הקודם
                              </button>
                              <span className="font-body text-sm text-navy/50">{historyPage} / {historyPages}</span>
                              <button disabled={historyPage === historyPages} onClick={() => setHistoryPage(p => p + 1)}
                                className="px-4 py-2 rounded-lg border-2 border-navy/15 text-navy font-body text-sm disabled:opacity-30 hover:border-navy/40 transition-colors">
                                הבא ›
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── Notes tab ─────────────────────────────────────────── */}
                      {activeTab === 'notes' && (
                        <div className="p-5 space-y-4">
                          <div>
                            <div className="font-display font-bold text-navy mb-1">הערות לשיפור / Notes for Improvement</div>
                            <p className="font-body text-xs text-navy/40 mb-3">
                              רשום מה עבד טוב, מה אפשר לשפר, ורעיונות לאירוע הבא.
                              Write what worked well, what can be improved, and ideas for the next event.
                            </p>
                            <textarea
                              value={notesText}
                              onChange={e => setNotesText(e.target.value)}
                              rows={8}
                              placeholder="למשל: הלחם נגמר מוקדם, כדאי להזמין יותר. הפיק שעה 20:00 היה קשה לניהול..."
                              className="w-full border-2 border-navy/15 rounded-xl px-4 py-3 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold resize-none"
                              dir="rtl"
                            />
                          </div>
                          <button
                            onClick={handleSaveNotes}
                            disabled={savingNotes}
                            className="px-6 py-3 bg-navy text-cream rounded-xl font-body font-semibold hover:bg-navy/80 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {savingNotes && <span className="w-4 h-4 border-2 border-cream/40 border-t-cream rounded-full animate-spin" />}
                            {savingNotes ? 'שומר...' : '💾 שמור הערות / Save Notes'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
