import { useEffect } from 'react'
import { useStore } from '../stores/useStore'

export default function Toast() {
  const toast = useStore(s => s.toast)
  const clearToast = useStore(s => s.clearToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 3500)
    return () => clearTimeout(t)
  }, [toast, clearToast])

  if (!toast) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 toast-enter pointer-events-none">
      <div className={`
        px-6 py-3 rounded-full shadow-2xl font-body font-semibold text-base text-white flex items-center gap-2
        ${toast.type === 'error' ? 'bg-red-600' : 'bg-navy border-2 border-gold'}
      `}>
        <span>{toast.type === 'success' ? '✓' : '✕'}</span>
        <span>{toast.message}</span>
      </div>
    </div>
  )
}
