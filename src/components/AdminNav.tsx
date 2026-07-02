import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/orders',    icon: '🧾',  he: 'הזמנות',   en: 'Orders'    },
  { path: '/kitchen',   icon: '👨‍🍳', he: 'מטבח',    en: 'Kitchen'   },
  { path: '/bar',       icon: '🍸',  he: 'בר',       en: 'Bar'       },
  { path: '/analytics', icon: '📊',  he: 'נתונים',   en: 'Analytics' },
  { path: '/history',   icon: '📋',  he: 'היסטוריה', en: 'History'   },
  { path: '/events',    icon: '📦',  he: 'ארכיון',   en: 'Events'    },
  { path: '/settings',  icon: '⚙️',  he: 'הגדרות',   en: 'Settings'  },
]

export default function AdminNav() {
  return (
    <nav className="bg-navy/95 backdrop-blur border-b border-gold/20 flex items-center justify-center gap-1 px-3 py-1 shrink-0 z-20">
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `
            flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg text-center transition-colors min-w-[60px]
            ${isActive ? 'bg-gold/20 text-gold' : 'text-cream/50 hover:text-cream/80 hover:bg-white/5'}
          `}
        >
          <span className="text-base leading-none">{item.icon}</span>
          <span className="text-xs font-body font-medium">{item.he}</span>
        </NavLink>
      ))}
    </nav>
  )
}
