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

function App() {
  const currentRole = useStore(s => s.currentRole)

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
