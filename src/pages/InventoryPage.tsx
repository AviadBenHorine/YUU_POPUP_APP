import { useState, useEffect, useRef } from 'react'
import Modal from '../components/Modal'
import { useStore } from '../stores/useStore'
import {
  subscribeInventoryCategories,
  subscribeInventoryItems,
  saveInventoryCategory,
  deleteInventoryCategory,
  saveInventoryItem,
  updateInventoryItemQty,
  deleteInventoryItem,
  deleteInventoryItemsByCategory,
  seedDefaultCategories,
  DEFAULT_CATEGORIES,
} from '../services/inventoryFirebase'
import type { InventoryCategory, InventoryItem } from '../types/inventory'

const UNIT_PRESETS = ['יחידות', 'ק"ג', 'ליטר', 'בקבוקים', 'קופסאות', 'חבילות', 'שקיות', 'גרם']
const LOCATION_PRESETS = ['מחסן ראשי', 'מחסן משני', 'מטבח', 'בר', 'מקרר', 'מקפיא']
const CATEGORY_ICON_PRESETS = ['🥡', '🍷', '🥫', '🌾', '🥬', '🔧', '🧴', '🥩', '🧂', '☕', '🧊', '📦']

interface ItemFormState {
  id: string
  categoryId: string
  name: string
  qty: string
  unit: string
  location: string
  minQty: string
  note: string
  order: number
}

function emptyItemForm(catId: string, order: number): ItemFormState {
  return { id: '', categoryId: catId, name: '', qty: '0', unit: 'יחידות', location: '', minQty: '0', note: '', order }
}

export default function InventoryPage() {
  const showToast = useStore(s => s.showToast)

  const [categories, setCategories] = useState<InventoryCategory[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [filterCatId, setFilterCatId] = useState<string | null>(null)

  // Qty inline editing
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null)
  const [qtyVal, setQtyVal] = useState('')
  const qtyInputRef = useRef<HTMLInputElement | null>(null)

  // Item add/edit modal
  const [itemForm, setItemForm] = useState<ItemFormState | null>(null)
  const [savingItem, setSavingItem] = useState(false)

  // Category add/edit modal
  const [catForm, setCatForm] = useState<{ id: string; name: string; icon: string; order: number } | null>(null)
  const [savingCat, setSavingCat] = useState(false)

  useEffect(() => {
    const unsub1 = subscribeInventoryCategories(cats => {
      setCategories(cats)
    })
    const unsub2 = subscribeInventoryItems(setItems)
    return () => { unsub1(); unsub2() }
  }, [])

  // Seed default categories if none exist on first real load
  useEffect(() => {
    if (categories === DEFAULT_CATEGORIES) {
      seedDefaultCategories().catch(() => {})
    }
  }, [categories])

  useEffect(() => {
    if (editingQtyId && qtyInputRef.current) qtyInputRef.current.focus()
  }, [editingQtyId])

  const sortedCats = [...categories].sort((a, b) => a.order - b.order)
  const visibleCats = filterCatId ? sortedCats.filter(c => c.id === filterCatId) : sortedCats

  function getCatItems(catId: string) {
    return items.filter(i => i.categoryId === catId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he'))
  }

  const totalItems = items.length
  const outOfStock = items.filter(i => i.qty === 0).length
  const lowStock = items.filter(i => i.minQty > 0 && i.qty > 0 && i.qty <= i.minQty).length

  // ── Qty handlers ────────────────────────────────────────────────────────────

  async function handleDelta(item: InventoryItem, delta: number) {
    const newQty = Math.max(0, item.qty + delta)
    try {
      await updateInventoryItemQty(item.id, newQty)
    } catch {
      showToast('שגיאה בעדכון / Update failed', 'error')
    }
  }

  function openQtyEdit(item: InventoryItem) {
    setEditingQtyId(item.id)
    setQtyVal(String(item.qty))
  }

  async function commitQtyEdit(item: InventoryItem) {
    const val = parseFloat(qtyVal)
    if (!isNaN(val) && val >= 0 && val !== item.qty) {
      try {
        await updateInventoryItemQty(item.id, val)
      } catch {
        showToast('שגיאה בעדכון / Update failed', 'error')
      }
    }
    setEditingQtyId(null)
  }

  // ── Item modal ──────────────────────────────────────────────────────────────

  function openAddItem(catId: string) {
    const maxOrder = Math.max(-1, ...items.filter(i => i.categoryId === catId).map(i => i.order))
    setItemForm(emptyItemForm(catId, maxOrder + 1))
  }

  function openEditItem(item: InventoryItem) {
    setItemForm({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      qty: String(item.qty),
      unit: item.unit,
      location: item.location,
      minQty: String(item.minQty),
      note: item.note,
      order: item.order,
    })
  }

  async function handleSaveItem() {
    if (!itemForm || !itemForm.name.trim()) return
    setSavingItem(true)
    try {
      const item: InventoryItem = {
        id: itemForm.id || `inv_${Date.now()}`,
        categoryId: itemForm.categoryId,
        name: itemForm.name.trim(),
        qty: parseFloat(itemForm.qty) || 0,
        unit: itemForm.unit.trim() || 'יחידות',
        location: itemForm.location.trim(),
        minQty: parseFloat(itemForm.minQty) || 0,
        note: itemForm.note.trim(),
        order: itemForm.order,
        updatedAt: new Date().toISOString(),
      }
      await saveInventoryItem(item)
      showToast(itemForm.id ? 'הפריט עודכן / Item updated' : 'הפריט נוסף / Item added')
      setItemForm(null)
    } catch {
      showToast('שגיאה בשמירה / Save failed', 'error')
    } finally {
      setSavingItem(false)
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      await deleteInventoryItem(itemId)
      showToast('הפריט נמחק / Item deleted')
    } catch {
      showToast('שגיאה במחיקה / Delete failed', 'error')
    }
  }

  // ── Category modal ──────────────────────────────────────────────────────────

  function openAddCat() {
    const maxOrder = Math.max(-1, ...categories.map(c => c.order))
    setCatForm({ id: '', name: '', icon: '📦', order: maxOrder + 1 })
  }

  function openEditCat(cat: InventoryCategory) {
    setCatForm({ id: cat.id, name: cat.name, icon: cat.icon, order: cat.order })
  }

  async function handleSaveCat() {
    if (!catForm || !catForm.name.trim()) return
    setSavingCat(true)
    try {
      const cat: InventoryCategory = {
        id: catForm.id || `cat_${Date.now()}`,
        name: catForm.name.trim(),
        icon: catForm.icon || '📦',
        order: catForm.order,
      }
      await saveInventoryCategory(cat)
      showToast(catForm.id ? 'הקטגוריה עודכנה / Category updated' : 'הקטגוריה נוספה / Category added')
      setCatForm(null)
    } catch {
      showToast('שגיאה בשמירה / Save failed', 'error')
    } finally {
      setSavingCat(false)
    }
  }

  async function handleDeleteCat(cat: InventoryCategory) {
    const catItemCount = items.filter(i => i.categoryId === cat.id).length
    if (catItemCount > 0) {
      const confirmed = window.confirm(`מחיקת הקטגוריה תמחק גם את ${catItemCount} הפריטים שבה. להמשיך?`)
      if (!confirmed) return
      await deleteInventoryItemsByCategory(cat.id)
    }
    try {
      await deleteInventoryCategory(cat.id)
      showToast('הקטגוריה נמחקה / Category deleted')
      setCatForm(null)
    } catch {
      showToast('שגיאה במחיקה / Delete failed', 'error')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-cream" dir="rtl">

      {/* ── Header ── */}
      <div className="shrink-0 bg-navy px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-black text-cream text-xl leading-tight">מלאי</h1>
          <p className="text-gold/60 text-[11px] font-body tracking-wide">Inventory</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Stats chips */}
          {outOfStock > 0 && (
            <span className="bg-red-400/20 text-red-300 text-[10px] font-body px-2 py-0.5 rounded-full">
              {outOfStock} אזל
            </span>
          )}
          {lowStock > 0 && (
            <span className="bg-amber-400/20 text-amber-300 text-[10px] font-body px-2 py-0.5 rounded-full">
              {lowStock} נמוך
            </span>
          )}
          <button
            onClick={openAddCat}
            className="text-cream/50 hover:text-gold transition-colors text-lg px-1"
            title="הוסף קטגוריה"
          >
            ⚙️
          </button>
          <button
            onClick={() => openAddItem(filterCatId ?? sortedCats[0]?.id ?? '')}
            disabled={categories.length === 0}
            className="bg-gold text-navy font-display font-bold text-sm px-3 py-1.5 rounded-xl hover:bg-gold/80 active:scale-95 transition-all disabled:opacity-40"
          >
            + הוסף פריט
          </button>
        </div>
      </div>

      {/* ── Category filter tabs ── */}
      <div className="shrink-0 bg-white border-b-2 border-navy/10 flex items-center gap-1 px-3 py-2 overflow-x-auto">
        <button
          onClick={() => setFilterCatId(null)}
          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-body font-semibold transition-colors ${
            !filterCatId ? 'bg-navy text-cream' : 'text-navy/50 hover:text-navy hover:bg-navy/5'
          }`}
        >
          הכל ({totalItems})
        </button>
        {sortedCats.map(cat => {
          const count = items.filter(i => i.categoryId === cat.id).length
          return (
            <button
              key={cat.id}
              onClick={() => setFilterCatId(cat.id === filterCatId ? null : cat.id)}
              className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-body font-semibold transition-colors ${
                filterCatId === cat.id ? 'bg-navy text-cream' : 'text-navy/50 hover:text-navy hover:bg-navy/5'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
              <span className="opacity-50">({count})</span>
            </button>
          )
        })}
      </div>

      {/* ── Items list ── */}
      <div className="flex-1 overflow-y-auto">
        {categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-navy/30">
            <span className="text-5xl">🗃️</span>
            <p className="font-body text-sm">אין קטגוריות — לחץ ⚙️ להוסיף</p>
          </div>
        ) : (
          <>
            {visibleCats.map(cat => {
              const catItems = getCatItems(cat.id)
              if (filterCatId === null && catItems.length === 0) return null
              return (
                <div key={cat.id} className="mb-3">
                  {/* Category header */}
                  <div className="px-4 py-2 bg-navy/5 border-b border-navy/8 flex items-center justify-between">
                    <button
                      onClick={() => openEditCat(cat)}
                      className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                    >
                      <span className="text-base">{cat.icon}</span>
                      <span className="font-display font-bold text-navy text-sm">{cat.name}</span>
                      <span className="text-navy/35 text-xs font-body">({catItems.length})</span>
                    </button>
                    <button
                      onClick={() => openAddItem(cat.id)}
                      className="text-navy/35 hover:text-gold transition-colors font-bold text-xl leading-none px-1"
                    >
                      +
                    </button>
                  </div>

                  {/* Items in category */}
                  <div className="bg-white">
                    {catItems.length === 0 ? (
                      <button
                        onClick={() => openAddItem(cat.id)}
                        className="w-full px-4 py-3 text-sm text-navy/30 font-body text-center hover:bg-cream/40 transition-colors"
                      >
                        + הוסף פריט ראשון לקטגוריה זו
                      </button>
                    ) : catItems.map(item => {
                      const isOut = item.qty === 0
                      const isLow = item.minQty > 0 && item.qty > 0 && item.qty <= item.minQty
                      const isEditingQty = editingQtyId === item.id

                      return (
                        <div
                          key={item.id}
                          className="grid grid-cols-[1fr_auto_28px] gap-2 items-center px-4 py-2.5 border-b border-navy/5 last:border-0"
                        >
                          {/* Name + location */}
                          <button onClick={() => openEditItem(item)} className="text-right min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isOut && (
                                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-pulse" />
                              )}
                              {isLow && !isOut && (
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                              )}
                              <span className={`font-body font-semibold text-sm truncate ${isOut ? 'text-red-400' : 'text-navy'}`}>
                                {item.name}
                              </span>
                            </div>
                            {item.location && (
                              <div className="text-[11px] text-navy/40 font-body mt-0.5 flex items-center gap-0.5">
                                <span>📍</span>
                                <span className="truncate">{item.location}</span>
                              </div>
                            )}
                            {item.note && (
                              <div className="text-[10px] text-navy/30 font-body truncate">{item.note}</div>
                            )}
                          </button>

                          {/* Qty controls */}
                          <div className="flex flex-col items-center gap-0.5 shrink-0" dir="ltr">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelta(item, -1)}
                                disabled={item.qty === 0}
                                className="w-7 h-7 rounded-full bg-navy/8 text-navy font-bold text-lg flex items-center justify-center hover:bg-navy/15 disabled:opacity-25 transition-colors active:scale-90 select-none"
                              >
                                −
                              </button>

                              {isEditingQty ? (
                                <input
                                  ref={qtyInputRef}
                                  type="number"
                                  inputMode="decimal"
                                  value={qtyVal}
                                  onChange={e => setQtyVal(e.target.value)}
                                  onBlur={() => commitQtyEdit(item)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') commitQtyEdit(item)
                                    if (e.key === 'Escape') setEditingQtyId(null)
                                  }}
                                  className="w-10 text-center border-2 border-gold/50 rounded-lg font-display font-bold text-navy text-sm py-0.5 focus:outline-none focus:border-gold bg-cream"
                                  dir="ltr"
                                />
                              ) : (
                                <button
                                  onClick={() => openQtyEdit(item)}
                                  className={`w-10 text-center font-display font-bold text-base tabular-nums select-none ${
                                    isOut ? 'text-red-400' : isLow ? 'text-amber-500' : 'text-navy'
                                  }`}
                                >
                                  {item.qty % 1 === 0 ? item.qty : item.qty.toFixed(1)}
                                </button>
                              )}

                              <button
                                onClick={() => handleDelta(item, 1)}
                                className="w-7 h-7 rounded-full bg-navy/8 text-navy font-bold text-lg flex items-center justify-center hover:bg-navy/15 transition-colors active:scale-90 select-none"
                              >
                                +
                              </button>
                            </div>
                            <div className="text-[10px] text-navy/40 font-body">{item.unit}</div>
                          </div>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="text-navy/20 hover:text-red-400 transition-colors text-base w-7 h-7 flex items-center justify-center"
                            aria-label={`מחק ${item.name}`}
                          >
                            🗑️
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Empty state when filtered category has items */}
            {filterCatId && getCatItems(filterCatId).length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-navy/30">
                <p className="font-body text-sm">אין פריטים בקטגוריה זו</p>
                <button
                  onClick={() => openAddItem(filterCatId)}
                  className="text-gold font-body text-sm hover:underline"
                >
                  + הוסף פריט
                </button>
              </div>
            )}

            {/* Footer summary */}
            {totalItems > 0 && (
              <div className="px-4 py-3 text-center text-xs text-navy/25 font-body">
                {totalItems} פריטים
                {outOfStock > 0 ? ` · ${outOfStock} אזל` : ''}
                {lowStock > 0 ? ` · ${lowStock} מלאי נמוך` : ''}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add/Edit Item Modal ── */}
      <Modal
        open={!!itemForm}
        onClose={() => setItemForm(null)}
        title={itemForm?.id ? 'עריכת פריט / Edit Item' : 'הוספת פריט / Add Item'}
      >
        {itemForm && (
          <div className="space-y-3" dir="rtl">
            {/* Name */}
            <div>
              <label className="font-body text-sm text-navy/70 block mb-1">שם הפריט *</label>
              <input
                autoFocus
                type="text"
                value={itemForm.name}
                onChange={e => setItemForm(s => s ? { ...s, name: e.target.value } : s)}
                placeholder="לדוג׳ בקבוקי מים, צלחות..."
                className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
              />
            </div>

            {/* Category */}
            <div>
              <label className="font-body text-sm text-navy/70 block mb-1">קטגוריה</label>
              <select
                value={itemForm.categoryId}
                onChange={e => setItemForm(s => s ? { ...s, categoryId: e.target.value } : s)}
                className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
              >
                {sortedCats.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                ))}
              </select>
            </div>

            {/* Qty + Unit */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="font-body text-sm text-navy/70 block mb-1">כמות</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={itemForm.qty}
                  onChange={e => setItemForm(s => s ? { ...s, qty: e.target.value } : s)}
                  dir="ltr"
                  className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
                />
              </div>
              <div className="flex-1">
                <label className="font-body text-sm text-navy/70 block mb-1">יחידה</label>
                <input
                  type="text"
                  value={itemForm.unit}
                  onChange={e => setItemForm(s => s ? { ...s, unit: e.target.value } : s)}
                  className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
                />
              </div>
            </div>

            {/* Unit presets */}
            <div className="flex flex-wrap gap-1.5">
              {UNIT_PRESETS.map(u => (
                <button
                  key={u}
                  onClick={() => setItemForm(s => s ? { ...s, unit: u } : s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-body transition-colors ${
                    itemForm.unit === u ? 'bg-navy text-cream' : 'bg-navy/10 text-navy/60 hover:bg-navy/20'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>

            {/* Location */}
            <div>
              <label className="font-body text-sm text-navy/70 block mb-1">📍 מיקום</label>
              <input
                type="text"
                value={itemForm.location}
                onChange={e => setItemForm(s => s ? { ...s, location: e.target.value } : s)}
                placeholder="מחסן ראשי, מקרר, בר..."
                className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
              />
            </div>

            {/* Location presets */}
            <div className="flex flex-wrap gap-1.5">
              {LOCATION_PRESETS.map(l => (
                <button
                  key={l}
                  onClick={() => setItemForm(s => s ? { ...s, location: l } : s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-body transition-colors ${
                    itemForm.location === l ? 'bg-gold/80 text-navy' : 'bg-navy/10 text-navy/60 hover:bg-navy/20'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Min stock */}
            <div>
              <label className="font-body text-sm text-navy/70 block mb-1">
                סף התרעה (0 = כבוי)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={itemForm.minQty}
                onChange={e => setItemForm(s => s ? { ...s, minQty: e.target.value } : s)}
                dir="ltr"
                className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
              />
            </div>

            {/* Note */}
            <div>
              <label className="font-body text-sm text-navy/70 block mb-1">הערה</label>
              <input
                type="text"
                value={itemForm.note}
                onChange={e => setItemForm(s => s ? { ...s, note: e.target.value } : s)}
                placeholder="אופציונלי..."
                className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveItem}
                disabled={savingItem || !itemForm.name.trim()}
                className="flex-1 py-2.5 bg-navy text-cream rounded-xl font-body font-semibold text-sm hover:bg-navy/80 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {savingItem && <span className="w-3 h-3 border-2 border-cream/40 border-t-cream rounded-full animate-spin" />}
                {itemForm.id ? 'שמור שינויים' : 'הוסף פריט'}
              </button>
              <button
                onClick={() => setItemForm(null)}
                className="px-4 py-2.5 border-2 border-navy/15 rounded-xl font-body text-sm text-navy/60 hover:border-navy/30 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Add/Edit Category Modal ── */}
      <Modal
        open={!!catForm}
        onClose={() => setCatForm(null)}
        title={catForm?.id ? 'עריכת קטגוריה / Edit Category' : 'קטגוריה חדשה / New Category'}
      >
        {catForm && (
          <div className="space-y-3" dir="rtl">
            {/* Icon picker */}
            <div>
              <label className="font-body text-sm text-navy/70 block mb-2">אייקון</label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_ICON_PRESETS.map(icon => (
                  <button
                    key={icon}
                    onClick={() => setCatForm(s => s ? { ...s, icon } : s)}
                    className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-colors ${
                      catForm.icon === icon ? 'bg-gold/20 ring-2 ring-gold' : 'bg-navy/8 hover:bg-navy/15'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
                {/* Custom emoji input */}
                <input
                  type="text"
                  value={catForm.icon}
                  onChange={e => setCatForm(s => s ? { ...s, icon: e.target.value.slice(-2) } : s)}
                  className="w-10 h-10 rounded-xl border-2 border-navy/15 text-center text-xl focus:outline-none focus:border-gold bg-cream"
                  maxLength={2}
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="font-body text-sm text-navy/70 block mb-1">שם הקטגוריה *</label>
              <input
                autoFocus
                type="text"
                value={catForm.name}
                onChange={e => setCatForm(s => s ? { ...s, name: e.target.value } : s)}
                placeholder='לדוג׳ חד"פ, שתייה...'
                className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveCat}
                disabled={savingCat || !catForm.name.trim()}
                className="flex-1 py-2.5 bg-navy text-cream rounded-xl font-body font-semibold text-sm hover:bg-navy/80 disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {savingCat && <span className="w-3 h-3 border-2 border-cream/40 border-t-cream rounded-full animate-spin" />}
                {catForm.id ? 'שמור שינויים' : 'צור קטגוריה'}
              </button>
              {catForm.id && (
                <button
                  onClick={() => handleDeleteCat({ id: catForm.id, name: catForm.name, icon: catForm.icon, order: catForm.order })}
                  className="px-4 py-2.5 border-2 border-red-200 text-red-400 rounded-xl font-body text-sm hover:bg-red-50 transition-colors"
                >
                  מחק
                </button>
              )}
              <button
                onClick={() => setCatForm(null)}
                className="px-4 py-2.5 border-2 border-navy/15 rounded-xl font-body text-sm text-navy/60 hover:border-navy/30 transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
