import { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidth?: string
}

export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm" />
      <div
        className={`relative bg-cream rounded-2xl ${maxWidth} w-full shadow-2xl animate-fade-in`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-navy/10">
          <h2 className="font-display font-bold text-navy text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-navy/40 hover:text-navy text-2xl leading-none transition-colors w-10 h-10 flex items-center justify-center rounded-full hover:bg-navy/10"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
