import { useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import TopBar from '../components/TopBar'
import { useStore } from '../stores/useStore'

const COLORS = ['#1A2340', '#C8A96E', '#4B6380']

function fmtCurrency(n: number) { return `₪${n.toLocaleString()}` }
function fmtMins(mins: number | null): string {
  if (mins === null) return '—'
  return `${Math.round(mins)}′`
}

export default function AnalyticsPage() {
  const orders = useStore(s => s.orders)
  const menuItems = useStore(s => s.menuItems)
  const resetOrders = useStore(s => s.resetOrders)
  const showToast = useStore(s => s.showToast)

  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  // Staff orders are excluded from all revenue statistics
  const paidOrders = useMemo(() =>
    orders.filter(o =>
      !['open', 'awaiting_payment', 'cancelled'].includes(o.status) &&
      o.paymentMethod !== 'staff'
    ),
    [orders]
  )

  const staffOrders = useMemo(() =>
    orders.filter(o =>
      !['open', 'awaiting_payment', 'cancelled'].includes(o.status) &&
      o.paymentMethod === 'staff'
    ),
    [orders]
  )

  // KPIs — all-time
  const totalRevenue = paidOrders.reduce((s, o) => s + o.totalPrice, 0)
  const avgOrderValue = paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0
  const staffRevenue = staffOrders.reduce((s, o) => s + o.totalPrice, 0)

  const itemCounts: Record<string, number> = {}
  for (const o of paidOrders) {
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

  const mostPopular = topItems[0]?.name ?? '—'

  const sitDownCount = paidOrders.filter(o => o.orderType === 'sit_down').length
  const takeAwayCount = paidOrders.filter(o => o.orderType === 'take_away').length
  const totalCount = sitDownCount + takeAwayCount

  // Avg items per order (total units, not line items)
  const totalItemQty = paidOrders.reduce((s, o) => s + o.items.reduce((q, oi) => q + oi.quantity, 0), 0)
  const avgItemsPerOrder = paidOrders.length > 0 ? (totalItemQty / paidOrders.length).toFixed(1) : '—'

  // Service times: kitchenDoneAt / barDoneAt relative to sentToKitchenAt
  const serviceStats = useMemo(() => {
    const kitchenTimes: number[] = []
    const barTimes: number[] = []
    for (const o of orders) {
      if (!o.sentToKitchenAt) continue
      const sentMs = new Date(o.sentToKitchenAt).getTime()
      if (o.kitchenDoneAt) {
        const mins = (new Date(o.kitchenDoneAt).getTime() - sentMs) / 60000
        if (mins > 0 && mins < 180) kitchenTimes.push(mins)
      }
      if (o.barDoneAt) {
        const mins = (new Date(o.barDoneAt).getTime() - sentMs) / 60000
        if (mins > 0 && mins < 180) barTimes.push(mins)
      }
    }
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    return {
      kitchenAvg: avg(kitchenTimes),
      kitchenMax: kitchenTimes.length ? Math.max(...kitchenTimes) : null,
      kitchenCount: kitchenTimes.length,
      barAvg: avg(barTimes),
      barMax: barTimes.length ? Math.max(...barTimes) : null,
      barCount: barTimes.length,
    }
  }, [orders])

  // Peak hour
  const peakHour = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const o of paidOrders) {
      const h = new Date(o.createdAt).getHours()
      counts[h] = (counts[h] ?? 0) + 1
    }
    const entries = Object.entries(counts)
    if (!entries.length) return null
    const [h, count] = entries.sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    return { hour: `${h}:00`, count: Number(count) }
  }, [paidOrders])

  // Hourly pattern — aggregate by hour-of-day across all history (shows peak hours)
  const hourlyData = useMemo(() => {
    const buckets: Record<number, { orders: number; sit: number; take: number }> = {}
    for (let h = 0; h < 24; h++) buckets[h] = { orders: 0, sit: 0, take: 0 }

    for (const o of paidOrders) {
      const h = new Date(o.createdAt).getHours()
      buckets[h].orders++
      if (o.orderType === 'sit_down') buckets[h].sit++
      else buckets[h].take++
    }

    const activeHours = Object.keys(buckets).map(Number).filter(h => buckets[h].orders > 0)
    if (activeHours.length === 0) {
      const h = new Date().getHours()
      return [{ hour: `${String(h).padStart(2, '0')}:00`, orders: 0, ישיבה: 0, לקחת: 0 }]
    }

    const minH = Math.min(...activeHours)
    const maxH = Math.max(...activeHours)
    return Array.from({ length: maxH - minH + 1 }, (_, i) => {
      const h = minH + i
      return {
        hour: `${String(h).padStart(2, '0')}:00`,
        orders: buckets[h].orders,
        ישיבה: buckets[h].sit,
        לקחת: buckets[h].take,
      }
    })
  }, [paidOrders])

  // Revenue by category (all-time)
  const catRevenue: Record<string, number> = { food: 0, drink: 0, dessert: 0 }
  for (const o of paidOrders) {
    for (const oi of o.items) {
      const mi = menuItems.find(m => m.id === oi.menuItemId)
      if (mi) catRevenue[mi.category] = (catRevenue[mi.category] ?? 0) + mi.price * oi.quantity
    }
  }
  const pieData = [
    { name: 'אוכל / Food', value: catRevenue.food },
    { name: 'שתייה / Drinks', value: catRevenue.drink },
    { name: 'קינוחים / Desserts', value: catRevenue.dessert },
  ].filter(d => d.value > 0)

  // Daily revenue trend
  const dailyData = useMemo(() => {
    const byDay: Record<string, number> = {}
    for (const o of paidOrders) {
      const day = o.createdAt.slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + o.totalPrice
    }
    return Object.entries(byDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({
        date: new Date(date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
        revenue,
      }))
  }, [paidOrders])

  async function handleReset() {
    setResetting(true)
    try {
      await resetOrders()
      setConfirmReset(false)
      showToast('הנתונים אופסו / Analytics reset')
    } catch {
      showToast('שגיאה באיפוס — נסה שוב / Reset failed', 'error')
    } finally {
      setResetting(false)
    }
  }

  const KPI = ({ label, labelEn, value, sub, staffLine }: {
    label: string; labelEn: string; value: string; sub?: string; staffLine?: string
  }) => (
    <div className="bg-white rounded-2xl border-2 border-navy/10 p-5 space-y-1">
      <div className="font-body text-xs text-navy/40 uppercase tracking-wider">{label}</div>
      <div className="font-display font-black text-navy text-3xl">{value}</div>
      {sub && <div className="font-body text-xs text-gold">{sub}</div>}
      {staffLine && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-navy/8 mt-1">
          <span className="text-xs font-body text-navy/30">🧾</span>
          <span className="font-body text-xs text-navy/40">{staffLine}</span>
        </div>
      )}
      <div className="font-body text-xs text-navy/30">{labelEn}</div>
    </div>
  )

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden">
      <TopBar title="אנליטיקס" titleEn="Analytics" />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="font-body text-sm text-navy/50">
              סה״כ כל ההיסטוריה / All-time statistics
            </div>
            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="px-4 py-2 rounded-xl border-2 border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 font-body text-sm transition-colors"
              >
                אפס נתונים / Reset Analytics
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-2">
                <span className="font-body text-red-600 text-sm">בטוח? / Are you sure?</span>
                <button onClick={handleReset} disabled={resetting} className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-body hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5">
                  {resetting && <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />}
                  {resetting ? 'מוחק...' : 'מחק / Delete'}
                </button>
                <button onClick={() => setConfirmReset(false)} className="text-navy/50 text-sm font-body hover:text-navy">
                  ביטול
                </button>
              </div>
            )}
          </div>

          {/* KPIs — revenue / orders */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPI label="סה״כ הכנסות" labelEn="Total Revenue" value={fmtCurrency(totalRevenue)}
              staffLine={staffOrders.length > 0 ? `על החשבון: ${fmtCurrency(staffRevenue)}` : undefined} />
            <KPI label="סה״כ הזמנות" labelEn="Total Orders" value={String(paidOrders.length)}
              staffLine={staffOrders.length > 0 ? `על החשבון: ${staffOrders.length}` : undefined} />
            <KPI label="ממוצע להזמנה" labelEn="Avg Order Value" value={fmtCurrency(avgOrderValue)} />
            <KPI label="הפריט הפופולרי" labelEn="Most Popular" value={mostPopular} />
            <div className="bg-white rounded-2xl border-2 border-navy/10 p-5 space-y-1">
              <div className="font-body text-xs text-navy/40 uppercase tracking-wider">ישיבה vs לקחת</div>
              <div className="flex items-end gap-3 pt-1">
                <div>
                  <div className="font-display font-black text-navy text-2xl">{sitDownCount}</div>
                  <div className="flex items-center gap-1 text-xs font-body text-navy/50 mt-0.5">
                    <span>🪑</span><span>ישיבה</span>
                  </div>
                </div>
                <div className="text-navy/20 font-display text-xl pb-4">|</div>
                <div>
                  <div className="font-display font-black text-gold text-2xl">{takeAwayCount}</div>
                  <div className="flex items-center gap-1 text-xs font-body text-navy/50 mt-0.5">
                    <span>🥡</span><span>לקחת</span>
                  </div>
                </div>
              </div>
              {totalCount > 0 && (
                <div className="text-xs text-navy/30 font-body">
                  {Math.round(sitDownCount / totalCount * 100)}% / {Math.round(takeAwayCount / totalCount * 100)}%
                </div>
              )}
              <div className="font-body text-xs text-navy/30">Sit Down / Take Away</div>
            </div>
          </div>

          {/* KPIs — service times */}
          <div>
            <div className="font-body text-xs text-navy/40 uppercase tracking-wider mb-3">זמני שירות / Service Times</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KPI
                label="ממוצע מטבח"
                labelEn={serviceStats.kitchenCount > 0 ? `Kitchen Avg (${serviceStats.kitchenCount})` : 'Kitchen Avg'}
                value={fmtMins(serviceStats.kitchenAvg)}
              />
              <KPI
                label="ארוך ביותר מטבח"
                labelEn="Kitchen Longest"
                value={fmtMins(serviceStats.kitchenMax)}
              />
              <KPI
                label="ממוצע בר"
                labelEn={serviceStats.barCount > 0 ? `Bar Avg (${serviceStats.barCount})` : 'Bar Avg'}
                value={fmtMins(serviceStats.barAvg)}
              />
              <KPI
                label="ארוך ביותר בר"
                labelEn="Bar Longest"
                value={fmtMins(serviceStats.barMax)}
              />
              <KPI
                label="פריטים ממוצע"
                labelEn="Avg Items / Order"
                value={String(avgItemsPerOrder)}
              />
              <KPI
                label="שעת שיא"
                labelEn="Peak Hour"
                value={peakHour ? peakHour.hour : '—'}
                sub={peakHour ? `${peakHour.count} הזמנות` : undefined}
              />
            </div>
          </div>

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Top items — CSS bar list */}
            <div className="bg-white rounded-2xl border-2 border-navy/10 p-5">
              <h3 className="font-display font-bold text-navy mb-1">פריטים פופולריים</h3>
              <p className="font-body text-xs text-navy/40 mb-4">Top Items — All Time</p>
              {topItems.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-navy/25 font-body text-sm">אין נתונים</div>
              ) : (
                <div className="space-y-3">
                  {topItems.map((item, i) => {
                    const pct = Math.round(item.qty / topItems[0].qty * 100)
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-5 text-center font-body text-xs text-navy/25 flex-shrink-0 tabular-nums">{i + 1}</span>
                        <div className="w-28 text-right font-body text-xs text-navy/70 truncate flex-shrink-0" dir="rtl">
                          {item.emoji && <span className="mr-1">{item.emoji}</span>}{item.name}
                        </div>
                        <div className="flex-1 h-3.5 bg-cream rounded-full overflow-hidden">
                          <div className="h-full bg-navy rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-7 text-right font-display font-bold text-navy text-sm flex-shrink-0 tabular-nums">{item.qty}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Revenue by category */}
            <div className="bg-white rounded-2xl border-2 border-navy/10 p-5">
              <h3 className="font-display font-bold text-navy mb-1">הכנסות לפי קטגוריה</h3>
              <p className="font-body text-xs text-navy/40 mb-4">Revenue by Category — All Time</p>
              {pieData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-navy/25 font-body text-sm">אין נתונים</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtCurrency(Number(v))} />
                    <Legend formatter={(value) => <span style={{ fontFamily: 'Heebo', fontSize: 12, color: '#1A2340' }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Orders by hour-of-day (peak hours pattern) */}
            <div className="bg-white rounded-2xl border-2 border-navy/10 p-5">
              <h3 className="font-display font-bold text-navy mb-1">הזמנות לפי שעה</h3>
              <p className="font-body text-xs text-navy/40 mb-4">Orders by Hour of Day — All Time</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="orders" stroke="#1A2340" strokeWidth={2} dot={{ r: 4 }} name="הזמנות" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Sit vs Take Away by hour */}
            <div className="bg-white rounded-2xl border-2 border-navy/10 p-5">
              <h3 className="font-display font-bold text-navy mb-1">ישיבה vs לקחת לפי שעה</h3>
              <p className="font-body text-xs text-navy/40 mb-4">Sit Down vs Take Away by Hour — All Time</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                  <Tooltip />
                  <Legend
                    formatter={(value) => (
                      <span style={{ fontFamily: 'Heebo', fontSize: 12 }}>
                        {value === 'ישיבה' ? '🪑 ישיבה' : '🥡 לקחת'}
                      </span>
                    )}
                  />
                  <Bar dataKey="ישיבה" fill="#1A2340" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="לקחת" fill="#C8A96E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Daily revenue trend — only shown when data spans multiple days */}
            {dailyData.length > 1 && (
              <div className="bg-white rounded-2xl border-2 border-navy/10 p-5 lg:col-span-2">
                <h3 className="font-display font-bold text-navy mb-1">הכנסות יומיות</h3>
                <p className="font-body text-xs text-navy/40 mb-4">Daily Revenue Trend</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                    <YAxis tickFormatter={(v) => `₪${v}`} tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                    <Tooltip formatter={(v) => [fmtCurrency(Number(v)), 'הכנסות']} />
                    <Bar dataKey="revenue" fill="#C8A96E" radius={[4, 4, 0, 0]} name="הכנסות" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
