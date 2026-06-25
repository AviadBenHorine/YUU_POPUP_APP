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
  subscribeSettings,
  subscribeOrders,
  subscribeMenu,
} from './services/firebase'

function App() {
  const currentRole           = useStore(s => s.currentRole)
  const setSettingsFromRemote = useStore(s => s._setSettingsFromRemote)
  const setOrdersFromRemote   = useStore(s => s._setOrdersFromRemote)
  const setMenuFromRemote     = useStore(s => s._setMenuFromRemote)

  // When Firebase is enabled: fetch all data first, then subscribe for updates.
  // This guarantees every device starts from the same Firestore state instead
  // of their own stale localStorage.
  const [appReady, setAppReady] = useState(!FIREBASE_ENABLED)

  useEffect(() => {
    if (!FIREBASE_ENABLED) return

    fetchInitialData()
      .then(({ settings, menu, orders }) => {
        if (settings) setSettingsFromRemote(settings)
        if (menu)     setMenuFromRemote(menu)
        setOrdersFromRemote(orders)
      })
      .catch(() => {})
      .finally(() => setAppReady(true))

    const unsub1 = subscribeSettings(setSettingsFromRemote)
    const unsub2 = subscribeOrders(setOrdersFromRemote)
    const unsub3 = subscribeMenu(setMenuFromRemote)
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
