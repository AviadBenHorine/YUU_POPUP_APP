import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { path: '/orders',    icon: '🧾',  he: 'הזמנות',   en: 'Orders'    },
  { path: '/kitchen',   icon: '👨‍🍳', he: 'מטבח',    en: 'Kitchen'   },
  { path: '/bar',       icon: '🍸',  he: 'בר',       en: 'Bar'       },
  { path: '/analytics', icon: '📊',  he: 'נתונים',   en: 'Analytics' },
  { path: '/history',   icon: '📋',  he: 'היסטוריה', en: 'History'   },
  { path: '/events',    icon: '📦',  he: 'ארכיון',   en: 'Events'    },
  { path: '/prep',      icon: '📝',  he: 'הכנות',    en: 'Prep'      },
  { path: '/inventory', icon: '🗃️',  he: 'מלאי',    en: 'Stock'     },
  { path: '/settings',  icon: '⚙️',  he: 'הגדרות',   en: 'Settings'  },
]

export default function AdminNav() {
  return (
    <nav className="bg-navy/95 backdrop-blur border-b border-gold/20 flex items-center justify-between gap-0.5 px-2 py-1 shrink-0 z-20">
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => `
            flex-1 flex flex-col items-center gap-0.5 min-w-0 px-0.5 py-1.5 rounded-lg text-center transition-colors
            ${isActive ? 'bg-gold/20 text-gold' : 'text-cream/50 hover:text-cream/80 hover:bg-white/5'}
          `}
        >
          <span className="text-sm leading-none">{item.icon}</span>
          <span className="text-[10px] font-body font-medium truncate w-full">{item.he}</span>
        </NavLink>
      ))}
    </nav>
  )
}
