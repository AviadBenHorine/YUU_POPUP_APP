import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores/useStore'

const ROLE_LABELS: Record<string, string> = {
  admin: 'מנהל',
  waitress: 'הזמנות',
  kitchen: 'מטבח',
}

interface Props {
  title: string
  titleEn?: string
  actions?: React.ReactNode
}

export default function TopBar({ title, titleEn, actions }: Props) {
  const currentRole = useStore(s => s.currentRole)
  const logout = useStore(s => s.logout)
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-navy text-cream shadow-md shrink-0 z-10">
      <div className="flex items-center gap-3">
        <span className="font-display font-bold text-gold text-xl tracking-widest">YUU</span>
        {titleEn && <span className="text-cream/40 text-xs hidden sm:block">|</span>}
        <div className="leading-none">
          <div className="font-body font-semibold text-base text-cream">{title}</div>
          {titleEn && <div className="text-cream/50 text-xs font-body">{titleEn}</div>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {actions}
        {currentRole && (
          <span className="text-gold/70 text-xs hidden sm:block">
            {ROLE_LABELS[currentRole]}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="text-xs text-cream/70 hover:text-cream border border-cream/20 hover:border-cream/50 rounded px-3 py-1.5 transition-colors min-h-[36px]"
        >
          יציאה
          <span className="text-cream/40 mr-1 hidden sm:inline">/ Log out</span>
        </button>
      </div>
    </header>
  )
}
