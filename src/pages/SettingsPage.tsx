import { useState, useRef, useEffect } from 'react'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import { useStore } from '../stores/useStore'
import type { Role, MenuItem, MenuCategory } from '../types'
import { printer } from '../services/bluetoothPrinter'
import { FIREBASE_ENABLED } from '../services/firebase'

const ROLE_LABELS: Record<Role, { he: string; en: string; icon: string }> = {
  admin:    { he: 'מנהל',   en: 'Admin',    icon: '🧑‍💼' },
  waitress: { he: 'הזמנות', en: 'Orders',   icon: '🧾'  },
  kitchen:  { he: 'מטבח',  en: 'Kitchen',  icon: '👨‍🍳' },
  bar:      { he: 'בר',    en: 'Bar',      icon: '🍸'  },
}

const CATEGORY_LABELS: Record<MenuCategory, { he: string; en: string }> = {
  food:    { he: 'אוכל',    en: 'Food'     },
  drink:   { he: 'שתייה',  en: 'Drinks'   },
  dessert: { he: 'קינוחים', en: 'Desserts' },
}

function PinField({ role }: { role: Role }) {
  const settings = useStore(s => s.settings)
  const setPin   = useStore(s => s.setPin)
  const showToast = useStore(s => s.showToast)
  const [value, setValue] = useState(settings.pins[role])
  const [saved, setSaved] = useState(false)

  function save() {
    if (role === 'admin' && !value) { showToast('Admin PIN cannot be empty', 'error'); return }
    if (!/^\d{4}$/.test(value)) { showToast('PIN must be 4 digits', 'error'); return }
    setPin(role, value)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    showToast(`PIN updated for ${ROLE_LABELS[role].en}`)
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className="flex-1 border-2 border-navy/20 rounded-xl px-4 py-3 font-display font-bold text-navy tracking-widest text-lg bg-cream focus:outline-none focus:border-gold"
        placeholder="••••"
      />
      <button
        onClick={save}
        className={`px-5 py-3 rounded-xl font-body text-sm font-semibold transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-navy text-cream hover:bg-navy/80'}`}
      >
        {saved ? '✓' : 'שמור'}
      </button>
    </div>
  )
}

const EMPTY_ITEM: Omit<MenuItem, 'id'> = {
  name: '', nameHe: '', category: 'food', price: 0, emoji: '', available: true,
}

function Section({ title, titleEn, children }: { title: string; titleEn: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-navy/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-navy/10 bg-cream/50">
        <h2 className="font-display font-bold text-navy text-base">{title}</h2>
        <p className="font-body text-xs text-navy/40">{titleEn}</p>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  )
}

function ItemForm({ item, onChange }: { item: Omit<MenuItem, 'id'>; onChange: (i: Omit<MenuItem, 'id'>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-body text-xs text-navy/50 block mb-1">שם בעברית *</label>
          <input dir="rtl" value={item.nameHe} onChange={e => onChange({ ...item, nameHe: e.target.value })}
            placeholder="טאקו אל פסטור"
            className="w-full border-2 border-navy/20 rounded-xl px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold" />
        </div>
        <div>
          <label className="font-body text-xs text-navy/50 block mb-1">Name (English) *</label>
          <input dir="ltr" value={item.name} onChange={e => onChange({ ...item, name: e.target.value })}
            placeholder="Tacos al Pastor"
            className="w-full border-2 border-navy/20 rounded-xl px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="font-body text-xs text-navy/50 block mb-1">מחיר ₪ *</label>
          <input type="number" min="0" value={item.price || ''} onChange={e => onChange({ ...item, price: parseFloat(e.target.value) || 0 })}
            placeholder="48"
            className="w-full border-2 border-navy/20 rounded-xl px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold" />
        </div>
        <div>
          <label className="font-body text-xs text-navy/50 block mb-1">קטגוריה / Category</label>
          <select value={item.category} onChange={e => onChange({ ...item, category: e.target.value as MenuCategory })}
            className="w-full border-2 border-navy/20 rounded-xl px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold">
            {(Object.keys(CATEGORY_LABELS) as MenuCategory[]).map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c].he} / {CATEGORY_LABELS[c].en}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="font-body text-xs text-navy/50 block mb-1">אמוג'י</label>
          <input value={item.emoji ?? ''} onChange={e => onChange({ ...item, emoji: e.target.value })}
            placeholder="🌮"
            className="w-full border-2 border-navy/20 rounded-xl px-3 py-2 text-sm font-body text-navy bg-cream focus:outline-none focus:border-gold" />
        </div>
      </div>
    </div>
  )
}

// QR slot sub-component
type QRSlot = 1 | 2 | 3
const QR_KEYS: Record<QRSlot, 'bitQR1' | 'bitQR2' | 'bitQR3'> = {
  1: 'bitQR1', 2: 'bitQR2', 3: 'bitQR3',
}

function QRSlotCard({ slot }: { slot: QRSlot }) {
  const settings       = useStore(s => s.settings)
  const updateSettings = useStore(s => s.updateSettings)
  const showToast      = useStore(s => s.showToast)
  const fileRef        = useRef<HTMLInputElement>(null)

  const key      = QR_KEYS[slot]
  const imgSrc   = settings[key] || (slot === 1 ? '/qr1.jpeg' : '')
  const isActive = settings.activeQRSlot === slot

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      updateSettings({ [key]: ev.target?.result as string })
      showToast(`QR ${slot} עודכן`)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleRemove() {
    if (slot === 1) {
      // slot 1 always has the hard-coded fallback, can't be fully removed
      updateSettings({ bitQR1: '/qr1.jpeg' })
      showToast('QR 1 אופס לברירת המחדל')
    } else {
      updateSettings({ [key]: '' })
      if (isActive) updateSettings({ activeQRSlot: 1 })
      showToast(`QR ${slot} הוסר`)
    }
  }

  return (
    <div className={`rounded-2xl border-2 p-4 transition-all ${isActive ? 'border-gold shadow-md bg-gold/5' : 'border-navy/15 bg-white'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold
            ${isActive ? 'border-gold bg-gold text-navy' : 'border-navy/20 text-navy/40'}`}>
            {slot}
          </div>
          <span className="font-body text-sm font-semibold text-navy">QR {slot}</span>
          {isActive && <span className="text-xs font-body text-gold font-semibold">✓ פעיל / Active</span>}
        </div>
        <button
          onClick={() => updateSettings({ activeQRSlot: slot })}
          disabled={!imgSrc}
          className={`text-xs px-3 py-1.5 rounded-lg font-body transition-colors
            ${isActive
              ? 'bg-gold text-navy font-semibold cursor-default'
              : imgSrc
                ? 'border-2 border-navy/20 text-navy/60 hover:border-gold hover:text-gold'
                : 'border-2 border-navy/10 text-navy/20 cursor-not-allowed'
            }`}
        >
          {isActive ? '✓ בשימוש' : 'הפעל'}
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

      {imgSrc ? (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg border border-navy/10">
            <img src={imgSrc} alt={`Bit QR ${slot}`} className="w-20 h-20 object-contain" />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <button onClick={() => fileRef.current?.click()}
              className="py-2 rounded-lg bg-navy text-cream font-body text-xs hover:bg-navy/80 transition-colors">
              החלף / Replace
            </button>
            <button onClick={handleRemove}
              className={`py-2 rounded-lg border-2 font-body text-xs transition-colors
                ${slot === 1 ? 'border-navy/10 text-navy/30' : 'border-red-200 text-red-400 hover:border-red-400'}`}>
              {slot === 1 ? 'ברירת מחדל' : 'הסר / Remove'}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()}
          className="w-full h-24 rounded-xl border-2 border-dashed border-navy/20 hover:border-gold hover:bg-gold/5 transition-all flex flex-col items-center justify-center gap-1.5 text-navy/30">
          <span className="text-2xl">📷</span>
          <div className="font-body text-xs">העלה תמונת QR<br /><span className="text-navy/20">Upload QR image</span></div>
        </button>
      )}
    </div>
  )
}

function QuickTagsSection() {
  const settings       = useStore(s => s.settings)
  const updateSettings = useStore(s => s.updateSettings)
  const showToast      = useStore(s => s.showToast)
  const tags = settings.quickTags ?? []

  const [newTag, setNewTag]     = useState('')
  const [editIdx, setEditIdx]   = useState<number | null>(null)
  const [editVal, setEditVal]   = useState('')

  function addTag() {
    const trimmed = newTag.trim()
    if (!trimmed || tags.includes(trimmed)) return
    updateSettings({ quickTags: [...tags, trimmed] })
    setNewTag('')
  }

  function removeTag(i: number) {
    updateSettings({ quickTags: tags.filter((_, idx) => idx !== i) })
  }

  function startEdit(i: number) {
    setEditIdx(i)
    setEditVal(tags[i])
  }

  function saveEdit() {
    if (editIdx === null) return
    const trimmed = editVal.trim()
    if (!trimmed) { setEditIdx(null); return }
    const updated = tags.map((t, i) => i === editIdx ? trimmed : t)
    updateSettings({ quickTags: updated })
    setEditIdx(null)
    showToast('תגית עודכנה / Tag updated')
  }

  return (
    <Section title="תגיות מהירות" titleEn="Quick Tags">
      <p className="font-body text-xs text-navy/50 -mt-2">
        תגיות אלו מופיעות בחלון ההערות בעת לקיחת הזמנה / Shown as quick-select chips in the item notes modal
      </p>

      {/* Existing tags */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, i) => (
          <div key={i} className="flex items-center gap-1 bg-cream border-2 border-navy/15 rounded-full pr-1 pl-3 py-1">
            {editIdx === i ? (
              <>
                <input
                  autoFocus
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditIdx(null) }}
                  className="w-24 bg-transparent font-body text-xs text-navy focus:outline-none"
                  dir="rtl"
                />
                <button onClick={saveEdit}
                  className="w-6 h-6 rounded-full bg-navy text-cream text-xs flex items-center justify-center hover:bg-navy/80">
                  ✓
                </button>
              </>
            ) : (
              <>
                <span className="font-body text-xs text-navy">{tag}</span>
                <button onClick={() => startEdit(i)}
                  className="w-6 h-6 rounded-full text-navy/40 hover:text-navy text-xs flex items-center justify-center transition-colors">
                  ✏️
                </button>
                <button onClick={() => removeTag(i)}
                  className="w-6 h-6 rounded-full text-navy/30 hover:text-red-500 text-xs flex items-center justify-center transition-colors font-bold">
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add new tag */}
      <div className="flex gap-2 mt-1">
        <input
          dir="rtl"
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTag() }}
          placeholder="תגית חדשה... / New tag..."
          className="flex-1 border-2 border-navy/20 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
        />
        <button
          onClick={addTag}
          disabled={!newTag.trim() || tags.includes(newTag.trim())}
          className="px-4 py-2 rounded-xl bg-navy text-cream font-body text-sm disabled:opacity-30 hover:bg-navy/80 transition-colors"
        >
          הוסף / Add
        </button>
      </div>
    </Section>
  )
}

export default function SettingsPage() {
  const settings       = useStore(s => s.settings)
  const updateSettings = useStore(s => s.updateSettings)
  const menuItems    = useStore(s => s.menuItems)
  const setMenuItems = useStore(s => s.setMenuItems)
  const resetOrders  = useStore(s => s.resetOrders)
  const syncToCloud  = useStore(s => s.syncToCloud)
  const showToast    = useStore(s => s.showToast)

  const [printerStatus, setPrinterStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')

  // Auto-reconnect to the last printer on mount
  useEffect(() => {
    if (printer.isConnected) { setPrinterStatus('connected'); return }
    setPrinterStatus('connecting')
    printer.tryAutoReconnect().then(ok => {
      setPrinterStatus(ok ? 'connected' : 'idle')
    })
  }, [])

  // Menu editing state
  const [editItem, setEditItem] = useState<MenuItem | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [newItem, setNewItem]   = useState<Omit<MenuItem, 'id'>>(EMPTY_ITEM)

  async function connectPrinter() {
    setPrinterStatus('connecting')
    try {
      await printer.connect()
      setPrinterStatus('connected')
      showToast('מדפסת מחוברת / Printer connected')
    } catch (e) {
      console.error(e)
      setPrinterStatus('error')
      showToast('חיבור מדפסת נכשל / Printer connection failed', 'error')
    }
  }

  async function testPrint() {
    if (!printer.isConnected) { showToast('מדפסת לא מחוברת / Printer not connected', 'error'); return }
    try {
      await printer.testPrint()
      showToast('הדפסת בדיקה נשלחה / Test print sent')
    } catch {
      showToast('הדפסה נכשלה / Print failed', 'error')
    }
  }

  function saveEditItem() {
    if (!editItem) return
    if (!editItem.name || !editItem.nameHe) { showToast('נא למלא שם בעברית ובאנגלית', 'error'); return }
    if (editItem.price <= 0) { showToast('מחיר חייב להיות גדול מ-0', 'error'); return }
    setMenuItems(menuItems.map(m => m.id === editItem.id ? editItem : m))
    setEditItem(null)
    showToast('פריט עודכן / Item updated')
  }

  function addNewItem() {
    if (!newItem.name || !newItem.nameHe) { showToast('נא למלא שם בעברית ובאנגלית', 'error'); return }
    if (newItem.price <= 0) { showToast('מחיר חייב להיות גדול מ-0', 'error'); return }
    const item: MenuItem = { ...newItem, id: `custom_${Date.now()}` }
    setMenuItems([...menuItems, item])
    setAddModal(false)
    setNewItem(EMPTY_ITEM)
    showToast('פריט נוסף לתפריט / Item added')
  }

  function deleteItem(id: string) {
    if (!confirm('למחוק פריט זה מהתפריט? / Delete this item?')) return
    setMenuItems(menuItems.filter(m => m.id !== id))
    showToast('פריט נמחק / Item deleted')
  }

  function toggleItemAvail(id: string) {
    setMenuItems(menuItems.map(m => m.id === id ? { ...m, available: !m.available } : m))
  }

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden">
      <TopBar title="הגדרות" titleEn="Settings" />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Printer */}
          <Section title="מדפסת Bluetooth" titleEn="Bluetooth Printer">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${printer.isConnected || printerStatus === 'connected' ? 'bg-green-500' : printerStatus === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="font-body text-sm text-navy/70">
                {printer.isConnected || printerStatus === 'connected'
                  ? `מחובר / Connected${printer.lastDeviceName ? ` — ${printer.lastDeviceName}` : ''}`
                  : printerStatus === 'connecting'
                  ? `מתחבר...${printer.lastDeviceName ? ` (${printer.lastDeviceName})` : ''}`
                  : 'לא מחובר / Disconnected'}
              </span>
            </div>
            <div className="flex gap-3">
              <button onClick={connectPrinter} disabled={printerStatus === 'connecting'}
                className="flex-1 py-3 rounded-xl bg-navy text-cream font-body text-sm hover:bg-navy/80 disabled:opacity-50 transition-colors">
                {printerStatus === 'connecting' ? 'מתחבר...' : 'חבר מדפסת / Connect Printer'}
              </button>
              <button onClick={testPrint}
                className="flex-1 py-3 rounded-xl border-2 border-navy/20 text-navy font-body text-sm hover:border-navy/50 transition-colors">
                הדפסת בדיקה / Test Print
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-navy/8">
              <div>
                <div className="font-body text-sm text-navy">הדפסה אוטומטית / Auto-print tickets</div>
                <div className="font-body text-xs text-navy/40 mt-0.5">
                  {(settings.printerEnabled ?? false)
                    ? 'מופעל — מדפיס כרטיס אחרי כל הזמנה'
                    : 'כבוי — הדפסה ידנית בלבד'}
                </div>
              </div>
              <button
                onClick={() => updateSettings({ printerEnabled: !(settings.printerEnabled ?? false) })}
                className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${(settings.printerEnabled ?? false) ? 'bg-green-500' : 'bg-navy/20'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-1 shadow transition-all duration-200 ${(settings.printerEnabled ?? false) ? 'right-1' : 'left-1'}`} />
              </button>
            </div>

            <div className="text-xs text-navy/40 font-body bg-amber-50 border border-amber-200 rounded-lg p-3">
              דורש Chrome/Edge. לחץ "חבר מדפסת" כדי לסרוק מכשירים קרובים.<br />
              Requires Chrome/Edge. Click "Connect Printer" to scan for nearby devices.
            </div>
          </Section>

          {/* Bit QR Codes — 3 slots */}
          <Section title="קודי QR של Bit" titleEn="Bit QR Codes">
            <div className="text-xs text-navy/50 font-body bg-navy/5 rounded-lg p-3">
              ניתן להוסיף עד 3 קודי QR ולהחליף ביניהם בקלות.<br />
              Add up to 3 QR codes and switch between them any time.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <QRSlotCard slot={1} />
              <QRSlotCard slot={2} />
              <QRSlotCard slot={3} />
            </div>
          </Section>

          {/* Department routing */}
          <Section title="ניתוב מחלקות" titleEn="Department Routing">
            <div>
              <div className="font-body text-sm text-navy mb-1">קינוחים ישלחו אל / Desserts sent to:</div>
              <div className="flex gap-3">
                <button
                  onClick={() => { updateSettings({ dessertTo: 'kitchen' }); showToast('קינוחים → מטבח') }}
                  className={`flex-1 py-3 rounded-xl border-2 font-body text-sm transition-all flex items-center justify-center gap-2
                    ${(settings.dessertTo ?? 'kitchen') === 'kitchen' ? 'bg-navy text-cream border-navy shadow-md' : 'border-navy/20 text-navy hover:border-navy/50'}`}
                >
                  <span>👨‍🍳</span> מטבח / Kitchen
                  {(settings.dessertTo ?? 'kitchen') === 'kitchen' && <span className="text-cream/60 text-xs">✓</span>}
                </button>
                <button
                  onClick={() => { updateSettings({ dessertTo: 'bar' }); showToast('קינוחים → בר') }}
                  className={`flex-1 py-3 rounded-xl border-2 font-body text-sm transition-all flex items-center justify-center gap-2
                    ${settings.dessertTo === 'bar' ? 'bg-navy text-cream border-navy shadow-md' : 'border-navy/20 text-navy hover:border-navy/50'}`}
                >
                  <span>🍸</span> בר / Bar
                  {settings.dessertTo === 'bar' && <span className="text-cream/60 text-xs">✓</span>}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-navy/8">
              <div>
                <div className="font-body text-sm text-navy">צילום אישור תשלום / Payment proof photo</div>
                <div className="font-body text-xs text-navy/40 mt-0.5">
                  {(settings.requirePaymentPhoto ?? true)
                    ? 'מופעל — מצלמים אישור מלקוח'
                    : 'כבוי — אישור בלחיצה בלבד'}
                </div>
              </div>
              <button
                onClick={() => updateSettings({ requirePaymentPhoto: !(settings.requirePaymentPhoto ?? true) })}
                className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${(settings.requirePaymentPhoto ?? true) ? 'bg-green-500' : 'bg-navy/20'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-1 shadow transition-all duration-200 ${(settings.requirePaymentPhoto ?? true) ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </Section>

          {/* PINs */}
          <Section title="ניהול PINים" titleEn="PIN Management">
            {(Object.keys(ROLE_LABELS) as Role[]).map(role => (
              <div key={role}>
                <label className="flex items-center gap-2 font-body text-sm text-navy/70 mb-2">
                  <span>{ROLE_LABELS[role].icon}</span>
                  <span>{ROLE_LABELS[role].he} / {ROLE_LABELS[role].en}</span>
                </label>
                <PinField role={role} />
              </div>
            ))}
          </Section>

          {/* Menu Management */}
          <Section title="ניהול תפריט" titleEn="Menu Management">
            <button
              onClick={() => { setNewItem(EMPTY_ITEM); setAddModal(true) }}
              className="w-full py-3 rounded-xl bg-gold text-navy font-display font-bold text-sm hover:bg-gold/80 transition-colors border-2 border-gold"
            >
              + הוסף פריט / Add Item
            </button>

            <div className="space-y-1 max-h-80 overflow-y-auto">
              {menuItems.length === 0 && (
                <div className="text-center py-8 text-navy/30 font-body text-sm">אין פריטים. הוסף פריט ראשון!</div>
              )}
              {(Object.keys(CATEGORY_LABELS) as MenuCategory[]).map(cat => {
                const catItems = menuItems.filter(m => m.category === cat)
                if (catItems.length === 0) return null
                return (
                  <div key={cat}>
                    <div className="text-xs text-navy/40 font-body uppercase tracking-wider py-2 sticky top-0 bg-white">
                      {CATEGORY_LABELS[cat].he} / {CATEGORY_LABELS[cat].en}
                    </div>
                    {catItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 py-2 border-b border-navy/5">
                        <span className="text-xl w-8 text-center shrink-0">{item.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-body text-sm text-navy font-semibold truncate">{item.nameHe}</div>
                          <div className="font-body text-xs text-navy/40 truncate">{item.name}</div>
                        </div>
                        <div className="font-display font-bold text-navy text-sm shrink-0">₪{item.price}</div>
                        <button
                          onClick={() => toggleItemAvail(item.id)}
                          className={`text-xs px-2 py-1 rounded-full border transition-colors shrink-0 ${item.available ? 'border-green-300 text-green-700 bg-green-50' : 'border-red-200 text-red-500 bg-red-50'}`}
                        >
                          {item.available ? '✓' : '✕'}
                        </button>
                        <button
                          onClick={() => setEditItem({ ...item })}
                          className="text-navy/40 hover:text-navy transition-colors p-1 shrink-0"
                          title="עדכן / Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="text-red-300 hover:text-red-500 transition-colors p-1 shrink-0"
                          title="מחק / Delete"
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </Section>

          {/* Quick tags */}
          <QuickTagsSection />

          {/* Data management */}
          <Section title="ניהול נתונים" titleEn="Data Management">
            <button
              onClick={() => {
                if (!FIREBASE_ENABLED) {
                  showToast('Firebase not configured — check Vercel env vars', 'error')
                  return
                }
                syncToCloud()
                showToast('כל הנתונים סונכרנו לענן / All data synced to cloud')
              }}
              className="w-full py-3 rounded-xl border-2 border-navy/20 text-navy hover:border-navy hover:bg-navy hover:text-cream font-body text-sm transition-colors"
            >
              סנכרן לענן עכשיו / Sync to Cloud Now
            </button>
            <button
              onClick={() => {
                if (confirm('האם לנקות את כל ההזמנות? פעולה זו לא ניתנת לביטול.')) {
                  resetOrders()
                  showToast('הנתונים נמחקו / Data cleared')
                }
              }}
              className="w-full py-3 rounded-xl border-2 border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 font-body text-sm transition-colors"
            >
              מחק את כל ההזמנות / Delete All Orders
            </button>
          </Section>

        </div>
      </div>

      {/* Edit item modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="עדכן פריט / Edit Item">
        {editItem && (
          <div>
            <ItemForm item={editItem} onChange={i => setEditItem({ ...editItem, ...i })} />
            <div className="flex gap-3 mt-5">
              <button onClick={saveEditItem}
                className="flex-1 py-3 bg-navy text-cream rounded-xl font-display font-bold text-sm hover:bg-navy/80 transition-colors">
                שמור / Save
              </button>
              <button onClick={() => setEditItem(null)}
                className="flex-1 py-3 border-2 border-navy/20 text-navy rounded-xl font-body text-sm hover:border-navy/50 transition-colors">
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add item modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="הוסף פריט / Add Item">
        <ItemForm item={newItem} onChange={setNewItem} />
        <div className="flex gap-3 mt-5">
          <button onClick={addNewItem}
            className="flex-1 py-3 bg-gold text-navy rounded-xl font-display font-bold text-sm hover:bg-gold/80 transition-colors">
            הוסף / Add
          </button>
          <button onClick={() => setAddModal(false)}
            className="flex-1 py-3 border-2 border-navy/20 text-navy rounded-xl font-body text-sm hover:border-navy/50 transition-colors">
            ביטול
          </button>
        </div>
      </Modal>
    </div>
  )
}
