import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Toast from './components/Toast'
import LoginPage from './pages/LoginPage'
import WaitressPage from './pages/WaitressPage'
import PaymentPage from './pages/PaymentPage'
import KitchenPage from './pages/KitchenPage'
import BarPage from './pages/BarPage'
import HistoryPage from './pages/HistoryPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import AdminNav from './components/AdminNav'
import { useStore } from './stores/useStore'
import {
  FIREBASE_ENABLED,
  fetchInitialData,
  pushSettings,
  pushMenu,
  pushOrder,
  subscribeSettings,
  subscribeOrders,
  subscribeMenu,
} from './services/firebase'

function App() {
  const currentRole           = useStore(s => s.currentRole)
  const setSettingsFromRemote = useStore(s => s._setSettingsFromRemote)
  const setOrdersFromRemote   = useStore(s => s._setOrdersFromRemote)
  const setMenuFromRemote     = useStore(s => s._setMenuFromRemote)

  const [appReady, setAppReady] = useState(!FIREBASE_ENABLED)

  useEffect(() => {
    if (!FIREBASE_ENABLED) return

    // Snapshot local data RIGHT NOW before any Firestore subscription can overwrite it.
    // subscribeOrders fires with [] even on an empty collection, which would wipe
    // localStorage orders before we get a chance to seed Firestore with them.
    const { settings: localSettings, menuItems: localMenu, orders: localOrders } =
      useStore.getState()

    const unsub1 = subscribeSettings(setSettingsFromRemote)
    const unsub2 = subscribeOrders(setOrdersFromRemote)
    const unsub3 = subscribeMenu(setMenuFromRemote)

    fetchInitialData()
      .then(({ settings, menu, orders }) => {
        if (settings) {
          setSettingsFromRemote(settings)
        } else {
          // Nothing in Firestore yet — seed from this device's local data
          pushSettings(localSettings)
        }

        if (menu) {
          setMenuFromRemote(menu)
        } else {
          pushMenu(localMenu)
        }

        if (orders.length > 0) {
          setOrdersFromRemote(orders)
        } else if (localOrders.length > 0) {
          // Firestore has no orders — restore what subscribeOrders may have wiped
          // and push local orders so all devices converge
          setOrdersFromRemote(localOrders)
          localOrders.forEach(o => pushOrder(o))
        }
      })
      .catch(() => {})
      .finally(() => setAppReady(true))

    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  if (!appReady) {
    return (
      <div className="h-dvh bg-cream flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {currentRole === 'admin' && <AdminNav />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/orders" element={
          <ProtectedRoute allowedRoles={['waitress', 'admin']}>
            <WaitressPage />
          </ProtectedRoute>
        } />

        <Route path="/payment/:orderId" element={
          <ProtectedRoute allowedRoles={['waitress', 'admin']}>
            <PaymentPage />
          </ProtectedRoute>
        } />

        <Route path="/kitchen" element={
          <ProtectedRoute allowedRoles={['kitchen', 'admin']}>
            <KitchenPage />
          </ProtectedRoute>
        } />

        <Route path="/bar" element={
          <ProtectedRoute allowedRoles={['bar', 'admin']}>
            <BarPage />
          </ProtectedRoute>
        } />

        <Route path="/history" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <HistoryPage />
          </ProtectedRoute>
        } />

        <Route path="/analytics" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AnalyticsPage />
          </ProtectedRoute>
        } />

        <Route path="/settings" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <SettingsPage />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toast />
    </>
  )
}

export default App
