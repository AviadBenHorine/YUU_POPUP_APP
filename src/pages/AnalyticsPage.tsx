import { useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import TopBar from '../components/TopBar'
import { useStore } from '../stores/useStore'

const COLORS = ['#1A2340', '#C8A96E', '#4B6380']

function fmtCurrency(n: number) { return `₪${n.toLocaleString()}` }

export default function AnalyticsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const orders = useStore(s => s.orders)
  const menuItems = useStore(s => s.menuItems)
  const resetOrders = useStore(s => s.resetOrders)
  const showToast = useStore(s => s.showToast)

  const [confirmReset, setConfirmReset] = useState(false)

  const paidOrders = useMemo(() =>
    orders.filter(o => !['open', 'awaiting_payment', 'cancelled'].includes(o.status)),
    [orders]
  )

  const todayOrders = useMemo(() =>
    paidOrders.filter(o => o.createdAt.startsWith(today)),
    [paidOrders]
  )

  // KPIs — all based on today
  const totalRevenue = todayOrders.reduce((s, o) => s + o.totalPrice, 0)
  const avgOrderValue = todayOrders.length > 0 ? Math.round(totalRevenue / todayOrders.length) : 0

  const itemCounts: Record<string, number> = {}
  for (const o of todayOrders) {
    for (const oi of o.items) {
      itemCounts[oi.menuItemId] = (itemCounts[oi.menuItemId] ?? 0) + oi.quantity
    }
  }
  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, qty]) => ({ name: menuItems.find(m => m.id === id)?.nameHe ?? id, qty }))

  const mostPopular = topItems[0]?.name ?? '—'

  const sitDownCount = todayOrders.filter(o => o.orderType === 'sit_down').length
  const takeAwayCount = todayOrders.filter(o => o.orderType === 'take_away').length
  const totalCount = sitDownCount + takeAwayCount

  // Hourly data — from first order's hour to last (or current hour)
  const hourlyData = useMemo(() => {
    if (todayOrders.length === 0) {
      const h = new Date().getHours()
      return [{ hour: `${String(h).padStart(2,'0')}:00`, orders: 0, ישיבה: 0, לקחת: 0 }]
    }
    const hours = todayOrders.map(o => new Date(o.createdAt).getHours())
    const firstHour = Math.min(...hours)
    const lastHour = Math.max(Math.max(...hours), new Date().getHours())
    return Array.from({ length: lastHour - firstHour + 1 }, (_, i) => {
      const hour = firstHour + i
      const hourStr = `${String(hour).padStart(2, '0')}:00`
      const hourOrders = todayOrders.filter(o => new Date(o.createdAt).getHours() === hour)
      return {
        hour: hourStr,
        orders: hourOrders.length,
        ישיבה: hourOrders.filter(o => o.orderType === 'sit_down').length,
        לקחת: hourOrders.filter(o => o.orderType === 'take_away').length,
      }
    })
  }, [todayOrders])

  // Revenue by category (today)
  const catRevenue: Record<string, number> = { food: 0, drink: 0, dessert: 0 }
  for (const o of todayOrders) {
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

  function handleReset() {
    resetOrders()
    setConfirmReset(false)
    showToast('הנתונים אופסו / Analytics reset')
  }

  const KPI = ({ label, labelEn, value, sub }: { label: string; labelEn: string; value: string; sub?: string }) => (
    <div className="bg-white rounded-2xl border-2 border-navy/10 p-5 space-y-1">
      <div className="font-body text-xs text-navy/40 uppercase tracking-wider">{label}</div>
      <div className="font-display font-black text-navy text-3xl">{value}</div>
      {sub && <div className="font-body text-xs text-gold">{sub}</div>}
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
              {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
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
                <button onClick={handleReset} className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm font-body hover:bg-red-600 transition-colors">
                  מחק / Delete
                </button>
                <button onClick={() => setConfirmReset(false)} className="text-navy/50 text-sm font-body hover:text-navy">
                  ביטול
                </button>
              </div>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KPI label="הכנסות היום" labelEn="Today's Revenue" value={fmtCurrency(totalRevenue)} />
            <KPI label="הזמנות היום" labelEn="Today's Orders" value={String(todayOrders.length)} />
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

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Top items */}
            <div className="bg-white rounded-2xl border-2 border-navy/10 p-5">
              <h3 className="font-display font-bold text-navy mb-1">פריטים פופולריים</h3>
              <p className="font-body text-xs text-navy/40 mb-4">Top Items Today</p>
              {topItems.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-navy/25 font-body text-sm">אין נתונים להיום</div>
              ) : (
                <ResponsiveContainer width="100%" height={topItems.length * 28 + 30}>
                  <BarChart data={topItems} layout="vertical" margin={{ right: 30, left: 0, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fontFamily: 'Heebo' }} />
                    <Tooltip formatter={(v) => [`${v} יח'`, 'כמות']} />
                    <Bar dataKey="qty" fill="#1A2340" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#1A2340' }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Revenue by category */}
            <div className="bg-white rounded-2xl border-2 border-navy/10 p-5">
              <h3 className="font-display font-bold text-navy mb-1">הכנסות לפי קטגוריה</h3>
              <p className="font-body text-xs text-navy/40 mb-4">Revenue by Category Today</p>
              {pieData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-navy/25 font-body text-sm">אין נתונים להיום</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={false}
                    >
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtCurrency(Number(v))} />
                    <Legend
                      formatter={(value) => <span style={{ fontFamily: 'Heebo', fontSize: 12, color: '#1A2340' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Orders per hour today */}
            <div className="bg-white rounded-2xl border-2 border-navy/10 p-5">
              <h3 className="font-display font-bold text-navy mb-1">הזמנות לפי שעה</h3>
              <p className="font-body text-xs text-navy/40 mb-4">Orders by Hour (Today)</p>
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
              <p className="font-body text-xs text-navy/40 mb-4">Sit Down vs Take Away by Hour (Today)</p>
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
          </div>
        </div>
      </div>
    </div>
  )
}
