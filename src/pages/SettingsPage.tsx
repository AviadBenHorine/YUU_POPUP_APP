import { useState, useRef } from 'react'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import { useStore } from '../stores/useStore'
import type { Role, MenuItem, MenuCategory } from '../types'
import { printer } from '../services/bluetoothPrinter'

const ROLE_LABELS: Record<Role, { he: string; en: string; icon: string }> = {
  admin: { he: 'מנהל', en: 'Admin', icon: '🧑‍💼' },
  waitress: { he: 'הזמנות', en: 'Orders', icon: '🧾' },
  kitchen: { he: 'מטבח', en: 'Kitchen', icon: '👨‍🍳' },
}

const CATEGORY_LABELS: Record<MenuCategory, { he: string; en: string }> = {
  food: { he: 'אוכל', en: 'Food' },
  drink: { he: 'שתייה', en: 'Drinks' },
  dessert: { he: 'קינוחים', en: 'Desserts' },
}

function PinField({ role }: { role: Role }) {
  const settings = useStore(s => s.settings)
  const setPin = useStore(s => s.setPin)
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
      <div className="flex-1">
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={value}
          onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="w-full border-2 border-navy/20 rounded-xl px-4 py-3 font-display font-bold text-navy tracking-widest text-lg bg-cream focus:outline-none focus:border-gold"
          placeholder="••••"
        />
      </div>
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

// Defined outside SettingsPage so their identity is stable across renders —
// avoids remounting (and focus loss) when parent state updates.
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

export default function SettingsPage() {
  const settings = useStore(s => s.settings)
  const updateSettings = useStore(s => s.updateSettings)
  const menuItems = useStore(s => s.menuItems)
  const setMenuItems = useStore(s => s.setMenuItems)
  const resetOrders = useStore(s => s.resetOrders)
  const showToast = useStore(s => s.showToast)

  const [printerStatus, setPrinterStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const qrFileRef = useRef<HTMLInputElement>(null)

  // Menu editing state
  const [editItem, setEditItem] = useState<MenuItem | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [newItem, setNewItem] = useState<Omit<MenuItem, 'id'>>(EMPTY_ITEM)

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

  function handleQRImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      updateSettings({ bitQRImage: dataUrl })
      showToast('קוד QR של Bit עודכן / Bit QR code updated')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
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
                {printer.isConnected || printerStatus === 'connected' ? 'מחובר / Connected' : printerStatus === 'connecting' ? 'מתחבר...' : 'לא מחובר / Disconnected'}
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
            <div className="text-xs text-navy/40 font-body bg-amber-50 border border-amber-200 rounded-lg p-3">
              דורש Chrome/Edge. לחץ "חבר מדפסת" כדי לסרוק מכשירים קרובים.<br />
              Requires Chrome/Edge. Click "Connect Printer" to scan for nearby devices.
            </div>
          </Section>

          {/* Bit QR Code */}
          <Section title="קוד QR של Bit" titleEn="Bit QR Code">
            <div className="text-xs text-navy/50 font-body bg-navy/5 rounded-lg p-3">
              העלו את תמונת קוד ה-QR של Bit שלכם — היא תוצג בדף התשלום.<br />
              Upload your Bit QR code image — it will be shown on the payment screen.
            </div>

            <input
              ref={qrFileRef}
              type="file"
              accept="image/*"
              onChange={handleQRImageUpload}
              className="hidden"
            />

            {settings.bitQRImage ? (
              <div className="flex flex-col items-center gap-4">
                <div className="p-3 bg-white rounded-xl border-2 border-navy/10">
                  <img
                    src={settings.bitQRImage}
                    alt="Bit QR code"
                    className="w-44 h-44 object-contain"
                  />
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => qrFileRef.current?.click()}
                    className="flex-1 py-3 rounded-xl bg-navy text-cream font-body text-sm hover:bg-navy/80 transition-colors"
                  >
                    החלף תמונה / Replace
                  </button>
                  <button
                    onClick={() => { updateSettings({ bitQRImage: '' }); showToast('קוד QR הוסר / QR code removed') }}
                    className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 font-body text-sm transition-colors"
                  >
                    הסר / Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => qrFileRef.current?.click()}
                className="w-full h-36 rounded-xl border-2 border-dashed border-navy/30 hover:border-gold hover:bg-gold/5 transition-all flex flex-col items-center justify-center gap-2 text-navy/40"
              >
                <span className="text-4xl">📷</span>
                <div className="font-body text-sm">לחץ להעלאת תמונת QR<br /><span className="text-xs">Click to upload QR image</span></div>
              </button>
            )}
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

          {/* Data management */}
          <Section title="ניהול נתונים" titleEn="Data Management">
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
