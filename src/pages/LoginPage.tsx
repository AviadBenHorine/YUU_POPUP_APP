import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../stores/useStore'
import type { Role } from '../types'

const ROLES: { role: Role; label: string; labelEn: string; icon: string; defaultRoute: string }[] = [
  { role: 'admin', label: 'מנהל', labelEn: 'Admin', icon: '🧑‍💼', defaultRoute: '/analytics' },
  { role: 'waitress', label: 'הזמנות', labelEn: 'Orders', icon: '🧾', defaultRoute: '/orders' },
  { role: 'kitchen', label: 'מטבח', labelEn: 'Kitchen', icon: '👨‍🍳', defaultRoute: '/kitchen' },
]

const LOCKOUT_MS = 60_000
const MAX_ATTEMPTS = 3

export default function LoginPage() {
  const settings = useStore(s => s.settings)
  const login = useStore(s => s.login)
  const navigate = useNavigate()

  const [selectedRole, setSelectedRole] = useState<(typeof ROLES)[0] | null>(null)
  const [pin, setPin] = useState('')
  const [shaking, setShaking] = useState(false)
  const [attempts, setAttempts] = useState<Record<Role, number>>({ admin: 0, waitress: 0, kitchen: 0 })
  const [lockouts, setLockouts] = useState<Record<Role, number>>({ admin: 0, waitress: 0, kitchen: 0 })
  const [lockoutCountdown, setLockoutCountdown] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!selectedRole) return
    const remaining = lockouts[selectedRole.role] - Date.now()
    if (remaining <= 0) { setLockoutCountdown(0); return }
    setLockoutCountdown(Math.ceil(remaining / 1000))
    timerRef.current = setInterval(() => {
      const rem = lockouts[selectedRole.role] - Date.now()
      if (rem <= 0) {
        setLockoutCountdown(0)
        clearInterval(timerRef.current!)
      } else {
        setLockoutCountdown(Math.ceil(rem / 1000))
      }
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [selectedRole, lockouts])

  function selectRole(r: typeof ROLES[0]) {
    if (lockouts[r.role] > Date.now()) return
    setSelectedRole(r)
    setPin('')
  }

  function appendDigit(d: string) {
    if (pin.length >= 4 || lockoutCountdown > 0) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) verify(next)
  }

  function backspace() {
    setPin(p => p.slice(0, -1))
  }

  function verify(entered: string) {
    if (!selectedRole) return
    const correct = settings.pins[selectedRole.role]
    if (entered === correct) {
      login(selectedRole.role)
      navigate(selectedRole.defaultRoute, { replace: true })
    } else {
      const newAttempts = { ...attempts, [selectedRole.role]: attempts[selectedRole.role] + 1 }
      setAttempts(newAttempts)
      setShaking(true)
      setTimeout(() => { setShaking(false); setPin('') }, 600)
      if (newAttempts[selectedRole.role] >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS
        setLockouts(l => ({ ...l, [selectedRole.role]: until }))
        setAttempts(a => ({ ...a, [selectedRole.role]: 0 }))
        setPin('')
      }
    }
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div className="min-h-dvh bg-cream flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="font-display font-black text-navy text-5xl tracking-widest mb-1">YUU</h1>
        <p className="text-gold font-body text-sm tracking-widest uppercase">Pop-Up Restaurant</p>
        <div className="mt-3 h-px w-24 bg-gold mx-auto" />
        <div className="mt-1 h-px w-16 bg-gold/50 mx-auto" />
      </div>

      {!selectedRole ? (
        /* Role selection */
        <div className="w-full max-w-sm animate-fade-in">
          <p className="text-center text-navy/60 font-body text-sm mb-6">בחר תפקיד / Select role</p>
          <div className="flex flex-col gap-4">
            {ROLES.map(r => {
              const locked = lockouts[r.role] > Date.now()
              return (
                <button
                  key={r.role}
                  onClick={() => selectRole(r)}
                  disabled={locked}
                  className={`
                    group flex items-center gap-5 px-6 py-5 rounded-2xl border-2 transition-all
                    ${locked
                      ? 'bg-navy/5 border-navy/10 opacity-40 cursor-not-allowed'
                      : 'bg-white border-navy/20 hover:border-gold hover:bg-gold/5 active:scale-95 cursor-pointer'
                    }
                  `}
                >
                  <span className="text-4xl">{r.icon}</span>
                  <div className="text-right flex-1">
                    <div className="font-display font-bold text-navy text-xl">{r.label}</div>
                    <div className="text-navy/50 text-sm font-body">{r.labelEn}</div>
                  </div>
                  <span className="text-navy/20 group-hover:text-gold transition-colors text-2xl">›</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        /* PIN entry */
        <div className="w-full max-w-xs animate-slide-up">
          <button
            onClick={() => { setSelectedRole(null); setPin('') }}
            className="flex items-center gap-2 text-navy/50 hover:text-navy text-sm mb-6 transition-colors"
          >
            ‹ <span className="font-body">{selectedRole.label} {selectedRole.icon}</span>
          </button>

          <div className="text-center mb-6">
            <p className="text-navy/60 font-body text-sm mb-4">הזן קוד / Enter PIN</p>

            {lockoutCountdown > 0 ? (
              <div className="text-red-500 font-body text-sm py-2">
                נסיון חוזר עוד {lockoutCountdown} שניות
              </div>
            ) : (
              <div className={`flex justify-center gap-4 ${shaking ? 'animate-shake' : ''}`}>
                {[0,1,2,3].map(i => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 transition-all ${
                      i < pin.length
                        ? 'bg-navy border-navy'
                        : 'bg-transparent border-navy/30'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Keypad — explicit LTR so 1 is always top-left regardless of page direction */}
          <div dir="ltr" className="grid grid-cols-3 gap-3">
            {keys.map((k, i) => {
              if (k === '') return <div key={i} />
              return (
                <button
                  key={i}
                  onClick={() => k === '⌫' ? backspace() : appendDigit(k)}
                  disabled={lockoutCountdown > 0}
                  className={`
                    pin-key h-16 rounded-xl font-display font-semibold text-2xl
                    transition-all border-2
                    ${lockoutCountdown > 0
                      ? 'bg-navy/5 border-navy/10 text-navy/20 cursor-not-allowed'
                      : k === '⌫'
                        ? 'bg-navy/5 border-navy/10 text-navy/50 hover:bg-navy/10 active:bg-navy/20'
                        : 'bg-white border-navy/15 text-navy hover:border-gold hover:bg-gold/5 active:bg-gold/10'
                    }
                  `}
                >
                  {k}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
