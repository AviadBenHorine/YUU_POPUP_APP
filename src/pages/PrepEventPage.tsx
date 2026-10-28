import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import { useStore } from '../stores/useStore'
import { FIREBASE_ENABLED } from '../services/firebase'
import {
  subscribePrepEvent,
  subscribePrepItems,
  updatePrepEvent,
  addPrepItem,
  updatePrepItem,
  deletePrepItem,
  checkPrepItem,
} from '../services/prepFirebase'
import type { PrepEvent, PrepItem, PrepShoppingGroup, PrepOwner, PrepPortion, PrepStatus } from '../types/prep'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'shop' | 'tasks' | 'portions'

interface ItemEditState {
  itemId: string
  name: string
  qty: string
  unit: string
  note: string
  moveToGroupId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return d
}

const STATUS_INFO: Record<PrepStatus, { he: string; color: string }> = {
  planning: { he: 'בתכנון', color: 'bg-amber-100 text-amber-700' },
  active:   { he: 'פעיל',   color: 'bg-green-100 text-green-700' },
  done:     { he: 'הסתיים', color: 'bg-navy/10 text-navy/50' },
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'מנהל', waitress: 'מלצרות', kitchen: 'מטבח', bar: 'בר',
}

// ─── AddItemRow ───────────────────────────────────────────────────────────────

interface AddItemRowProps {
  kind: 'shop' | 'task'
  onAdd: (name: string, qty: string, unit: string) => void
}

function AddItemRow({ kind, onAdd }: AddItemRowProps) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  function submit() {
    if (!name.trim()) return
    onAdd(name.trim(), qty.trim(), unit.trim())
    setName('')
    setQty('')
    setUnit('')
    nameRef.current?.focus()
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-navy/5">
      <input
        ref={nameRef}
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder={kind === 'shop' ? 'שם פריט...' : 'שם משימה...'}
        className="flex-1 min-w-0 bg-cream/60 border border-navy/10 rounded-lg px-3 py-1.5 font-body text-sm text-navy placeholder-navy/30 focus:outline-none focus:border-gold"
      />
      {kind === 'shop' && (
        <>
          <input
            type="text"
            value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="כמות"
            dir="ltr"
            className="w-16 bg-cream/60 border border-navy/10 rounded-lg px-2 py-1.5 font-body text-sm text-navy placeholder-navy/30 focus:outline-none focus:border-gold"
          />
          <input
            type="text"
            value={unit}
            onChange={e => setUnit(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="יחידה"
            className="w-16 bg-cream/60 border border-navy/10 rounded-lg px-2 py-1.5 font-body text-sm text-navy placeholder-navy/30 focus:outline-none focus:border-gold"
          />
        </>
      )}
      <button
        onClick={submit}
        disabled={!name.trim()}
        className="px-3 py-1.5 bg-navy text-cream text-xs font-body font-medium rounded-lg disabled:opacity-40 hover:bg-navy/80 transition-colors shrink-0"
      >
        הוסף
      </button>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function PrepEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const currentRole = useStore(s => s.currentRole)
  const showToast = useStore(s => s.showToast)

  const tab = (searchParams.get('tab') ?? 'shop') as Tab

  const [event, setEvent] = useState<PrepEvent | null>(null)
  const [items, setItems] = useState<PrepItem[]>([])
  const [loading, setLoading] = useState(true)

  // Hide-done toggle (localStorage)
  const [hideDone, setHideDone] = useState(() => {
    try { return localStorage.getItem('prep_hide_done') === 'true' } catch { return false }
  })

  // Header editing
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState('')
  const [editingDate, setEditingDate] = useState(false)
  const [dateVal, setDateVal] = useState('')

  // Group/owner editing
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupTitleVal, setGroupTitleVal] = useState('')
  const [groupSubtitleVal, setGroupSubtitleVal] = useState('')
  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null)
  const [ownerNameVal, setOwnerNameVal] = useState('')

  // Add group/owner modals
  const [addGroupModal, setAddGroupModal] = useState(false)
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [newGroupSubtitle, setNewGroupSubtitle] = useState('')
  const [addOwnerModal, setAddOwnerModal] = useState(false)
  const [newOwnerName, setNewOwnerName] = useState('')

  // Item edit modal
  const [itemEdit, setItemEdit] = useState<ItemEditState | null>(null)
  const [itemSaving, setItemSaving] = useState(false)

  // Delete confirms
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [deleteGroup, setDeleteGroup] = useState<{ id: string; name: string } | null>(null)
  const [deleteOwner, setDeleteOwner] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Portions inline editing
  const [editingPortionId, setEditingPortionId] = useState<string | null>(null)
  const [portionEditName, setPortionEditName] = useState('')
  const [portionEditQty, setPortionEditQty] = useState('')
  const [notesVal, setNotesVal] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    if (!eventId || !FIREBASE_ENABLED) { setLoading(false); return }
    const unsub1 = subscribePrepEvent(eventId, e => {
      setEvent(e)
      setLoading(false)
      if (e && notesVal === '') setNotesVal(e.notes)
    })
    const unsub2 = subscribePrepItems(eventId, setItems)
    return () => { unsub1(); unsub2() }
  }, [eventId])  // eslint-disable-line react-hooks/exhaustive-deps

  function setTab(t: Tab) {
    setSearchParams({ tab: t }, { replace: true })
  }

  function toggleHideDone() {
    const next = !hideDone
    setHideDone(next)
    try { localStorage.setItem('prep_hide_done', String(next)) } catch { /* */ }
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const shopItems = items.filter(i => i.kind === 'shop').sort((a, b) => a.order - b.order)
  const taskItems = items.filter(i => i.kind === 'task').sort((a, b) => a.order - b.order)
  const totalDone = items.filter(i => i.done).length
  const totalCount = items.length
  const shopDone = shopItems.filter(i => i.done).length
  const taskDone = taskItems.filter(i => i.done).length

  function itemsForGroup(groupId: string, kind: 'shop' | 'task') {
    const base = items
      .filter(i => i.kind === kind && i.groupId === groupId)
      .sort((a, b) => a.order - b.order)
    return hideDone ? base.filter(i => !i.done) : base
  }

  function allItemsForGroup(groupId: string, kind: 'shop' | 'task') {
    return items.filter(i => i.kind === kind && i.groupId === groupId)
  }

  // ── Header handlers ───────────────────────────────────────────────────────

  async function saveName() {
    if (!event || !nameVal.trim() || nameVal.trim() === event.name) { setEditingName(false); return }
    try {
      await updatePrepEvent(event.id, { name: nameVal.trim() })
    } catch {
      showToast('שגיאה בעדכון שם / Update failed', 'error')
    }
    setEditingName(false)
  }

  async function saveDate() {
    if (!event) { setEditingDate(false); return }
    try {
      await updatePrepEvent(event.id, { date: dateVal || null })
    } catch {
      showToast('שגיאה בעדכון תאריך / Update failed', 'error')
    }
    setEditingDate(false)
  }

  async function handleStatusChange(status: PrepStatus) {
    if (!event) return
    try {
      await updatePrepEvent(event.id, { status })
    } catch {
      showToast('שגיאה בעדכון סטטוס / Update failed', 'error')
    }
  }

  // ── Item handlers ─────────────────────────────────────────────────────────

  async function handleCheck(item: PrepItem, done: boolean) {
    if (!eventId) return
    try {
      await checkPrepItem(eventId, item.id, done, currentRole ?? null)
    } catch {
      showToast('שגיאה בעדכון / Update failed', 'error')
    }
  }

  async function handleAddItem(groupId: string, kind: 'shop' | 'task', name: string, qty: string, unit: string) {
    if (!eventId) return
    const groupItems = items.filter(i => i.kind === kind && i.groupId === groupId)
    const maxOrder = groupItems.length > 0 ? Math.max(...groupItems.map(i => i.order)) : -1
    const now = new Date().toISOString()
    const item: PrepItem = {
      id: newId(),
      kind,
      groupId,
      name,
      qty: qty || null,
      unit: unit || null,
      note: null,
      order: maxOrder + 1,
      done: false,
      doneBy: null,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await addPrepItem(eventId, item)
    } catch {
      showToast('שגיאה בהוספת פריט / Add failed', 'error')
    }
  }

  async function handleSaveItemEdit() {
    if (!itemEdit || !eventId) return
    setItemSaving(true)
    try {
      await updatePrepItem(eventId, itemEdit.itemId, {
        name: itemEdit.name.trim(),
        qty: itemEdit.qty.trim() || null,
        unit: itemEdit.unit.trim() || null,
        note: itemEdit.note.trim() || null,
        groupId: itemEdit.moveToGroupId,
      })
      setItemEdit(null)
    } catch {
      showToast('שגיאה בשמירה / Save failed', 'error')
    } finally {
      setItemSaving(false)
    }
  }

  async function handleDeleteItem() {
    if (!deleteItem || !eventId) return
    setDeleting(true)
    try {
      await deletePrepItem(eventId, deleteItem.id)
      setDeleteItem(null)
      showToast('פריט נמחק / Item deleted')
    } catch {
      showToast('שגיאה במחיקה / Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleMoveItem(item: PrepItem, direction: 'up' | 'down', kind: 'shop' | 'task') {
    if (!eventId) return
    const peers = items
      .filter(i => i.kind === kind && i.groupId === item.groupId)
      .sort((a, b) => a.order - b.order)
    const idx = peers.findIndex(i => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= peers.length) return
    const other = peers[swapIdx]
    try {
      await Promise.all([
        updatePrepItem(eventId, item.id, { order: other.order }),
        updatePrepItem(eventId, other.id, { order: item.order }),
      ])
    } catch {
      showToast('שגיאה בסידור / Reorder failed', 'error')
    }
  }

  // ── Group handlers ────────────────────────────────────────────────────────

  async function handleAddGroup() {
    if (!event || !newGroupTitle.trim()) return
    const maxOrder = event.shoppingGroups.length > 0
      ? Math.max(...event.shoppingGroups.map(g => g.order)) : -1
    const newGroup: PrepShoppingGroup = {
      id: `sg_${Date.now()}`,
      title: newGroupTitle.trim(),
      subtitle: newGroupSubtitle.trim() || undefined,
      order: maxOrder + 1,
    }
    try {
      await updatePrepEvent(event.id, {
        shoppingGroups: [...event.shoppingGroups, newGroup],
      })
      setAddGroupModal(false)
      setNewGroupTitle('')
      setNewGroupSubtitle('')
    } catch {
      showToast('שגיאה בהוספת קבוצה / Add failed', 'error')
    }
  }

  async function handleSaveGroupEdit(groupId: string) {
    if (!event) return
    const groups = event.shoppingGroups.map(g =>
      g.id === groupId
        ? { ...g, title: groupTitleVal.trim() || g.title, subtitle: groupSubtitleVal.trim() || undefined }
        : g
    )
    try {
      await updatePrepEvent(event.id, { shoppingGroups: groups })
    } catch {
      showToast('שגיאה בעדכון / Update failed', 'error')
    }
    setEditingGroupId(null)
  }

  async function handleMoveGroup(groupId: string, direction: 'up' | 'down') {
    if (!event) return
    const sorted = [...event.shoppingGroups].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(g => g.id === groupId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const updated = sorted.map(g => {
      if (g.id === sorted[idx].id) return { ...g, order: sorted[swapIdx].order }
      if (g.id === sorted[swapIdx].id) return { ...g, order: sorted[idx].order }
      return g
    })
    try {
      await updatePrepEvent(event.id, { shoppingGroups: updated })
    } catch {
      showToast('שגיאה בסידור / Reorder failed', 'error')
    }
  }

  async function handleDeleteGroup() {
    if (!deleteGroup || !event) return
    setDeleting(true)
    try {
      await updatePrepEvent(event.id, {
        shoppingGroups: event.shoppingGroups.filter(g => g.id !== deleteGroup.id),
      })
      setDeleteGroup(null)
      showToast('קבוצה נמחקה / Group deleted')
    } catch {
      showToast('שגיאה במחיקה / Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function copyGroupToClipboard(group: PrepShoppingGroup) {
    const unchecked = shopItems
      .filter(i => i.groupId === group.id && !i.done)
    let text: string
    if (unchecked.length === 0) {
      text = `${group.title}: הכול נקנה ✔`
    } else {
      const lines = unchecked.map(item => {
        let row = `• ${item.name}`
        if (item.qty) row += ` — ${item.qty}${item.unit ? ` ${item.unit}` : ''}`
        return row
      })
      text = `${group.title}:\n${lines.join('\n')}`
    }
    try {
      await navigator.clipboard.writeText(text)
      showToast('הרשימה הועתקה / Copied to clipboard')
    } catch {
      showToast('שגיאה בהעתקה / Copy failed', 'error')
    }
  }

  // ── Owner handlers ────────────────────────────────────────────────────────

  async function handleAddOwner() {
    if (!event || !newOwnerName.trim()) return
    const maxOrder = event.owners.length > 0 ? Math.max(...event.owners.map(o => o.order)) : -1
    const newOwner: PrepOwner = {
      id: `ow_${Date.now()}`,
      name: newOwnerName.trim(),
      order: maxOrder + 1,
    }
    try {
      await updatePrepEvent(event.id, { owners: [...event.owners, newOwner] })
      setAddOwnerModal(false)
      setNewOwnerName('')
    } catch {
      showToast('שגיאה בהוספת בעלים / Add failed', 'error')
    }
  }

  async function handleSaveOwnerEdit(ownerId: string) {
    if (!event) return
    const owners = event.owners.map(o =>
      o.id === ownerId ? { ...o, name: ownerNameVal.trim() || o.name } : o
    )
    try {
      await updatePrepEvent(event.id, { owners })
    } catch {
      showToast('שגיאה בעדכון / Update failed', 'error')
    }
    setEditingOwnerId(null)
  }

  async function handleMoveOwner(ownerId: string, direction: 'up' | 'down') {
    if (!event) return
    const sorted = [...event.owners].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(o => o.id === ownerId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const updated = sorted.map(o => {
      if (o.id === sorted[idx].id) return { ...o, order: sorted[swapIdx].order }
      if (o.id === sorted[swapIdx].id) return { ...o, order: sorted[idx].order }
      return o
    })
    try {
      await updatePrepEvent(event.id, { owners: updated })
    } catch {
      showToast('שגיאה בסידור / Reorder failed', 'error')
    }
  }

  async function handleDeleteOwner() {
    if (!deleteOwner || !event) return
    setDeleting(true)
    try {
      await updatePrepEvent(event.id, {
        owners: event.owners.filter(o => o.id !== deleteOwner.id),
      })
      setDeleteOwner(null)
      showToast('בעלים נמחק / Owner deleted')
    } catch {
      showToast('שגיאה במחיקה / Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // ── Portions handlers ─────────────────────────────────────────────────────

  async function savePortionEdit(portionId: string) {
    if (!event) return
    const portions = event.portions.map(p =>
      p.id === portionId
        ? { ...p, name: portionEditName.trim() || p.name, qty: parseFloat(portionEditQty) || p.qty }
        : p
    )
    try {
      await updatePrepEvent(event.id, { portions })
    } catch {
      showToast('שגיאה בעדכון / Update failed', 'error')
    }
    setEditingPortionId(null)
  }

  async function handleAddPortion() {
    if (!event) return
    const maxOrder = event.portions.length > 0 ? Math.max(...event.portions.map(p => p.order)) : -1
    const newPortion: PrepPortion = {
      id: `po_${Date.now()}`,
      name: 'מנה חדשה',
      qty: 0,
      order: maxOrder + 1,
    }
    try {
      await updatePrepEvent(event.id, { portions: [...event.portions, newPortion] })
      setEditingPortionId(newPortion.id)
      setPortionEditName(newPortion.name)
      setPortionEditQty('0')
    } catch {
      showToast('שגיאה בהוספה / Add failed', 'error')
    }
  }

  async function handleDeletePortion(portionId: string) {
    if (!event) return
    try {
      await updatePrepEvent(event.id, {
        portions: event.portions.filter(p => p.id !== portionId),
      })
    } catch {
      showToast('שגיאה במחיקה / Delete failed', 'error')
    }
  }

  async function handleMovePortion(portionId: string, direction: 'up' | 'down') {
    if (!event) return
    const sorted = [...event.portions].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(p => p.id === portionId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const updated = sorted.map(p => {
      if (p.id === sorted[idx].id) return { ...p, order: sorted[swapIdx].order }
      if (p.id === sorted[swapIdx].id) return { ...p, order: sorted[idx].order }
      return p
    })
    try {
      await updatePrepEvent(event.id, { portions: updated })
    } catch {
      showToast('שגיאה בסידור / Reorder failed', 'error')
    }
  }

  async function handleSaveNotes() {
    if (!event) return
    setSavingNotes(true)
    try {
      await updatePrepEvent(event.id, { notes: notesVal })
      showToast('הערות נשמרו / Notes saved')
    } catch {
      showToast('שגיאה בשמירה / Save failed', 'error')
    } finally {
      setSavingNotes(false)
    }
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (!FIREBASE_ENABLED) {
    return (
      <div className="h-dvh flex flex-col bg-cream" dir="rtl">
        <div className="p-4 border-b border-navy/10 flex items-center gap-3">
          <button onClick={() => navigate('/prep')} className="text-navy/40 hover:text-navy font-body text-sm">
            ← חזרה
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">☁️</div>
            <div className="font-display font-bold text-navy text-lg">Firebase לא מוגדר</div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-dvh bg-cream flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="h-dvh flex flex-col bg-cream" dir="rtl">
        <div className="p-4 border-b border-navy/10">
          <button onClick={() => navigate('/prep')} className="text-navy/40 hover:text-navy font-body text-sm">
            ← חזרה לרשימה
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">🔍</div>
            <div className="font-display font-bold text-navy text-lg">אירוע לא נמצא</div>
          </div>
        </div>
      </div>
    )
  }

  const sortedGroups = [...event.shoppingGroups].sort((a, b) => a.order - b.order)
  const sortedOwners = [...event.owners].sort((a, b) => a.order - b.order)
  const sortedPortions = [...event.portions].sort((a, b) => a.order - b.order)
  const totalPortionQty = event.portions.reduce((s, p) => s + p.qty, 0)
  const maxPortionQty = event.portions.length > 0 ? Math.max(...event.portions.map(p => p.qty)) : 1

  const progPct = totalCount > 0 ? Math.round((totalDone / totalCount) * 100) : 0

  return (
    <div className="h-dvh flex flex-col bg-cream overflow-hidden" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-navy px-4 pt-3 pb-0 shrink-0">

        {/* Back + status */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => navigate('/prep')}
            className="text-cream/50 hover:text-cream font-body text-sm transition-colors"
            aria-label="חזרה לרשימה"
          >
            ← חזרה
          </button>
          <select
            value={event.status}
            onChange={e => handleStatusChange(e.target.value as PrepStatus)}
            className={`text-xs px-2 py-1 rounded-full font-body font-medium border-0 focus:outline-none cursor-pointer ${STATUS_INFO[event.status].color}`}
          >
            <option value="planning">בתכנון</option>
            <option value="active">פעיל</option>
            <option value="done">הסתיים</option>
          </select>
        </div>

        {/* Event name */}
        {editingName ? (
          <input
            autoFocus
            type="text"
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
            className="w-full bg-navy/20 text-cream font-display font-bold text-xl rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gold/50 mb-1"
          />
        ) : (
          <button
            onClick={() => { setEditingName(true); setNameVal(event.name) }}
            className="font-display font-bold text-cream text-xl text-right w-full hover:text-gold/80 transition-colors mb-1 flex items-center gap-1"
          >
            {event.name}
            <span className="text-cream/30 text-sm">✏️</span>
          </button>
        )}

        {/* Date */}
        {editingDate ? (
          <input
            autoFocus
            type="date"
            value={dateVal}
            onChange={e => setDateVal(e.target.value)}
            onBlur={saveDate}
            onKeyDown={e => { if (e.key === 'Enter') saveDate(); if (e.key === 'Escape') setEditingDate(false) }}
            dir="ltr"
            className="bg-navy/20 text-cream text-sm rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gold/50 mb-2"
          />
        ) : (
          <button
            onClick={() => { setEditingDate(true); setDateVal(fmtDate(event.date)) }}
            className="font-body text-cream/50 text-sm hover:text-cream/80 transition-colors mb-2 flex items-center gap-1"
          >
            {event.date ? new Date(event.date).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '+ הוסף תאריך'}
            {event.date && <span className="text-cream/20">✏️</span>}
          </button>
        )}

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <div className="font-body text-xs text-cream/50">{totalDone}/{totalCount} בוצעו</div>
              <div className="font-body text-xs text-cream/40">{progPct}%</div>
            </div>
            <div className="h-1.5 bg-cream/10 rounded-full overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${progPct}%` }} />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0 -mx-4">
          {([
            { id: 'shop',     label: `קניות ${shopDone}/${shopItems.length}` },
            { id: 'tasks',    label: `משימות ${taskDone}/${taskItems.length}` },
            { id: 'portions', label: 'הערכת מנות' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 font-body text-sm font-medium transition-colors
                ${tab === t.id
                  ? 'text-gold border-b-2 border-gold bg-navy/20'
                  : 'text-cream/40 hover:text-cream/70'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hide-done toggle */}
      <div className="bg-white border-b border-navy/8 px-4 py-2 flex items-center justify-end shrink-0">
        <button
          onClick={toggleHideDone}
          className="flex items-center gap-2 text-xs font-body text-navy/50 hover:text-navy transition-colors"
        >
          <span>{hideDone ? 'הצג הכל' : 'הסתר מה שכבר סומן'}</span>
          <div className={`w-8 h-4 rounded-full transition-colors relative ${hideDone ? 'bg-navy' : 'bg-navy/20'}`}>
            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 shadow transition-all ${hideDone ? 'right-0.5' : 'left-0.5'}`} />
          </div>
        </button>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* ── Shopping tab ─────────────────────────────────────────────── */}
          {tab === 'shop' && (
            <>
              {sortedGroups.map((group, gIdx) => {
                const visItems = itemsForGroup(group.id, 'shop')
                const allGItems = allItemsForGroup(group.id, 'shop')
                const doneCount = allGItems.filter(i => i.done).length
                const pct = allGItems.length > 0 ? Math.round(doneCount / allGItems.length * 100) : 0
                const isEditingGroup = editingGroupId === group.id

                return (
                  <div key={group.id} className="bg-white rounded-2xl border-2 border-navy/10 overflow-hidden">
                    {/* Group header */}
                    <div className="bg-cream/50 px-4 py-3 border-b border-navy/8">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          {isEditingGroup ? (
                            <div className="space-y-1">
                              <input
                                autoFocus
                                type="text"
                                value={groupTitleVal}
                                onChange={e => setGroupTitleVal(e.target.value)}
                                onBlur={() => handleSaveGroupEdit(group.id)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveGroupEdit(group.id); if (e.key === 'Escape') setEditingGroupId(null) }}
                                className="w-full border border-navy/20 rounded-lg px-2 py-1 font-display font-bold text-navy text-sm focus:outline-none focus:border-gold bg-white"
                              />
                              <input
                                type="text"
                                value={groupSubtitleVal}
                                onChange={e => setGroupSubtitleVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveGroupEdit(group.id) }}
                                placeholder="כותרת משנה (אופציונלי)"
                                className="w-full border border-navy/15 rounded-lg px-2 py-0.5 font-body text-navy/60 text-xs focus:outline-none focus:border-gold bg-white"
                              />
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => { setEditingGroupId(group.id); setGroupTitleVal(group.title); setGroupSubtitleVal(group.subtitle ?? '') }}
                                className="font-display font-bold text-navy text-sm text-right hover:text-gold transition-colors"
                              >
                                {group.title}
                              </button>
                              {group.subtitle && (
                                <div className="font-body text-xs text-navy/40">{group.subtitle}</div>
                              )}
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 mt-0.5">
                          <div className="font-body text-xs text-navy/50">{doneCount}/{allGItems.length}</div>
                          <button
                            onClick={() => copyGroupToClipboard(group)}
                            aria-label="העתק מה שנשאר"
                            className="text-xs text-navy/40 hover:text-navy border border-navy/15 rounded-lg px-2 py-0.5 font-body hover:border-navy/30 transition-colors"
                          >
                            העתק
                          </button>
                          {/* Group menu */}
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleMoveGroup(group.id, 'up')}
                              disabled={gIdx === 0}
                              aria-label="הזז קבוצה למעלה"
                              className="text-navy/25 hover:text-navy disabled:opacity-20 transition-colors text-sm px-1"
                            >▲</button>
                            <button
                              onClick={() => handleMoveGroup(group.id, 'down')}
                              disabled={gIdx === sortedGroups.length - 1}
                              aria-label="הזז קבוצה למטה"
                              className="text-navy/25 hover:text-navy disabled:opacity-20 transition-colors text-sm px-1"
                            >▼</button>
                            <button
                              onClick={() => setDeleteGroup({ id: group.id, name: group.title })}
                              aria-label={`מחק קבוצה ${group.title}`}
                              className="text-navy/20 hover:text-red-400 transition-colors text-sm px-1"
                            >🗑️</button>
                          </div>
                        </div>
                      </div>

                      {allGItems.length > 0 && (
                        <div className="mt-2 h-1 bg-navy/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>

                    {/* Items */}
                    {visItems.map((item) => {
                      const allGroupItems = allItemsForGroup(group.id, 'shop').sort((a, b) => a.order - b.order)
                      const realIdx = allGroupItems.findIndex(i => i.id === item.id)
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 px-4 min-h-[48px] border-b border-navy/5 last:border-0 transition-colors
                            ${item.done ? 'bg-navy/2 opacity-60' : 'hover:bg-cream/30'}`}
                        >
                          <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer py-2">
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={e => handleCheck(item, e.target.checked)}
                              className="w-5 h-5 accent-gold shrink-0 cursor-pointer"
                              aria-label={item.name}
                            />
                            <div className="flex-1 min-w-0">
                              <div className={`font-body text-sm text-navy ${item.done ? 'line-through text-navy/40' : ''}`}>
                                {item.name}
                              </div>
                              {item.note && (
                                <div className="font-body text-xs text-navy/35 mt-0.5">{item.note}</div>
                              )}
                              {item.done && item.doneBy && (
                                <div className="font-body text-xs text-navy/25 mt-0.5">
                                  סומן ע״י {ROLE_LABELS[item.doneBy] ?? item.doneBy}
                                </div>
                              )}
                            </div>
                          </label>

                          {(item.qty || item.unit) && (
                            <div className="font-body text-sm text-navy/50 tabular-nums shrink-0 text-left" dir="ltr">
                              {item.qty}{item.unit ? ` ${item.unit}` : ''}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => handleMoveItem(item, 'up', 'shop')}
                              disabled={realIdx === 0}
                              aria-label="הזז למעלה"
                              className="w-6 h-6 flex items-center justify-center text-navy/25 hover:text-navy disabled:opacity-20 transition-colors"
                            >▲</button>
                            <button
                              onClick={() => handleMoveItem(item, 'down', 'shop')}
                              disabled={realIdx === allGroupItems.length - 1}
                              aria-label="הזז למטה"
                              className="w-6 h-6 flex items-center justify-center text-navy/25 hover:text-navy disabled:opacity-20 transition-colors"
                            >▼</button>
                            <button
                              onClick={() => setItemEdit({
                                itemId: item.id,
                                name: item.name,
                                qty: item.qty ?? '',
                                unit: item.unit ?? '',
                                note: item.note ?? '',
                                moveToGroupId: item.groupId,
                              })}
                              aria-label={`ערוך ${item.name}`}
                              className="w-6 h-6 flex items-center justify-center text-navy/30 hover:text-navy transition-colors text-sm"
                            >✏️</button>
                            <button
                              onClick={() => setDeleteItem({ id: item.id, name: item.name })}
                              aria-label={`מחק ${item.name}`}
                              className="w-6 h-6 flex items-center justify-center text-navy/20 hover:text-red-400 transition-colors text-sm"
                            >🗑️</button>
                          </div>
                        </div>
                      )
                    })}

                    <AddItemRow
                      kind="shop"
                      onAdd={(name, qty, unit) => handleAddItem(group.id, 'shop', name, qty, unit)}
                    />
                  </div>
                )
              })}

              <button
                onClick={() => setAddGroupModal(true)}
                className="w-full py-3 border-2 border-dashed border-navy/20 rounded-2xl font-body text-navy/40 text-sm hover:border-gold/40 hover:text-navy/60 transition-colors"
              >
                + הוסף קבוצה
              </button>
            </>
          )}

          {/* ── Tasks tab ──────────────────────────────────────────────────── */}
          {tab === 'tasks' && (
            <>
              {sortedOwners.map((owner, oIdx) => {
                const visItems = itemsForGroup(owner.id, 'task')
                const allOItems = allItemsForGroup(owner.id, 'task')
                const doneCount = allOItems.filter(i => i.done).length
                const pct = allOItems.length > 0 ? Math.round(doneCount / allOItems.length * 100) : 0
                const isEditingOwner = editingOwnerId === owner.id

                return (
                  <div key={owner.id} className="bg-white rounded-2xl border-2 border-navy/10 overflow-hidden">
                    {/* Owner header */}
                    <div className="bg-cream/50 px-4 py-3 border-b border-navy/8">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          {isEditingOwner ? (
                            <input
                              autoFocus
                              type="text"
                              value={ownerNameVal}
                              onChange={e => setOwnerNameVal(e.target.value)}
                              onBlur={() => handleSaveOwnerEdit(owner.id)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveOwnerEdit(owner.id); if (e.key === 'Escape') setEditingOwnerId(null) }}
                              className="w-full border border-navy/20 rounded-lg px-2 py-1 font-display font-bold text-navy text-sm focus:outline-none focus:border-gold bg-white"
                            />
                          ) : (
                            <button
                              onClick={() => { setEditingOwnerId(owner.id); setOwnerNameVal(owner.name) }}
                              className="font-display font-bold text-navy text-sm text-right hover:text-gold transition-colors"
                            >
                              {owner.name}
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="font-body text-xs text-navy/50">{doneCount}/{allOItems.length}</div>
                          <div className="flex gap-1">
                            <button onClick={() => handleMoveOwner(owner.id, 'up')} disabled={oIdx === 0}
                              aria-label="הזז בעלים למעלה"
                              className="text-navy/25 hover:text-navy disabled:opacity-20 transition-colors text-sm px-1">▲</button>
                            <button onClick={() => handleMoveOwner(owner.id, 'down')} disabled={oIdx === sortedOwners.length - 1}
                              aria-label="הזז בעלים למטה"
                              className="text-navy/25 hover:text-navy disabled:opacity-20 transition-colors text-sm px-1">▼</button>
                            <button onClick={() => setDeleteOwner({ id: owner.id, name: owner.name })}
                              aria-label={`מחק בעלים ${owner.name}`}
                              className="text-navy/20 hover:text-red-400 transition-colors text-sm px-1">🗑️</button>
                          </div>
                        </div>
                      </div>

                      {allOItems.length > 0 && (
                        <div className="mt-2 h-1 bg-navy/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>

                    {/* Tasks */}
                    {visItems.map((item) => {
                      const allOwnerItems = allItemsForGroup(owner.id, 'task').sort((a, b) => a.order - b.order)
                      const realIdx = allOwnerItems.findIndex(i => i.id === item.id)
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 px-4 min-h-[48px] border-b border-navy/5 last:border-0 transition-colors
                            ${item.done ? 'opacity-60' : 'hover:bg-cream/30'}`}
                        >
                          <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer py-2">
                            <input
                              type="checkbox"
                              checked={item.done}
                              onChange={e => handleCheck(item, e.target.checked)}
                              className="w-5 h-5 accent-gold shrink-0 cursor-pointer"
                              aria-label={item.name}
                            />
                            <div className="flex-1 min-w-0">
                              <div className={`font-body text-sm text-navy ${item.done ? 'line-through text-navy/40' : ''}`}>
                                {item.name}
                              </div>
                              {item.note && (
                                <div className="font-body text-xs text-navy/35 mt-0.5">{item.note}</div>
                              )}
                              {item.done && item.doneBy && (
                                <div className="font-body text-xs text-navy/25 mt-0.5">
                                  סומן ע״י {ROLE_LABELS[item.doneBy] ?? item.doneBy}
                                </div>
                              )}
                            </div>
                          </label>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => handleMoveItem(item, 'up', 'task')} disabled={realIdx === 0}
                              aria-label="הזז למעלה"
                              className="w-6 h-6 flex items-center justify-center text-navy/25 hover:text-navy disabled:opacity-20 transition-colors">▲</button>
                            <button onClick={() => handleMoveItem(item, 'down', 'task')} disabled={realIdx === allOwnerItems.length - 1}
                              aria-label="הזז למטה"
                              className="w-6 h-6 flex items-center justify-center text-navy/25 hover:text-navy disabled:opacity-20 transition-colors">▼</button>
                            <button
                              onClick={() => setItemEdit({
                                itemId: item.id,
                                name: item.name,
                                qty: '',
                                unit: '',
                                note: item.note ?? '',
                                moveToGroupId: item.groupId,
                              })}
                              aria-label={`ערוך משימה ${item.name}`}
                              className="w-6 h-6 flex items-center justify-center text-navy/30 hover:text-navy transition-colors text-sm">✏️</button>
                            <button
                              onClick={() => setDeleteItem({ id: item.id, name: item.name })}
                              aria-label={`מחק משימה ${item.name}`}
                              className="w-6 h-6 flex items-center justify-center text-navy/20 hover:text-red-400 transition-colors text-sm">🗑️</button>
                          </div>
                        </div>
                      )
                    })}

                    <AddItemRow
                      kind="task"
                      onAdd={(name) => handleAddItem(owner.id, 'task', name, '', '')}
                    />
                  </div>
                )
              })}

              <button
                onClick={() => setAddOwnerModal(true)}
                className="w-full py-3 border-2 border-dashed border-navy/20 rounded-2xl font-body text-navy/40 text-sm hover:border-gold/40 hover:text-navy/60 transition-colors"
              >
                + הוסף בעלים
              </button>
            </>
          )}

          {/* ── Portions tab ───────────────────────────────────────────────── */}
          {tab === 'portions' && (
            <>
              <div className="bg-white rounded-2xl border-2 border-navy/10 overflow-hidden">
                {sortedPortions.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="font-body text-sm text-navy/40 mb-3">עדיין אין מנות — הוסף שורה</div>
                    <button
                      onClick={handleAddPortion}
                      className="px-4 py-2 bg-navy text-cream text-sm rounded-xl font-body font-medium hover:bg-navy/80 transition-colors"
                    >
                      + הוסף מנה
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="grid grid-cols-[1fr_80px_100px_40px] gap-2 px-4 py-2 bg-cream/60 border-b border-navy/8">
                      <div className="font-body text-xs text-navy/50 uppercase tracking-wider">מנה</div>
                      <div className="font-body text-xs text-navy/50 uppercase tracking-wider text-left" dir="ltr">כמות</div>
                      <div className="font-body text-xs text-navy/50 uppercase tracking-wider"></div>
                      <div />
                    </div>

                    {sortedPortions.map((portion, pIdx) => {
                      const barPct = maxPortionQty > 0 ? (portion.qty / maxPortionQty) * 100 : 0
                      const isEditingPortion = editingPortionId === portion.id

                      return (
                        <div key={portion.id} className="grid grid-cols-[1fr_80px_100px_40px] gap-2 items-center px-4 py-2 border-b border-navy/5 last:border-0 min-h-[48px] hover:bg-cream/20 transition-colors">
                          {isEditingPortion ? (
                            <>
                              <input
                                autoFocus
                                type="text"
                                value={portionEditName}
                                onChange={e => setPortionEditName(e.target.value)}
                                onBlur={() => savePortionEdit(portion.id)}
                                onKeyDown={e => { if (e.key === 'Enter') savePortionEdit(portion.id); if (e.key === 'Escape') setEditingPortionId(null) }}
                                className="border border-navy/20 rounded-lg px-2 py-1 font-body text-sm text-navy focus:outline-none focus:border-gold"
                              />
                              <input
                                type="number"
                                min="0"
                                value={portionEditQty}
                                onChange={e => setPortionEditQty(e.target.value)}
                                onBlur={() => savePortionEdit(portion.id)}
                                onKeyDown={e => { if (e.key === 'Enter') savePortionEdit(portion.id) }}
                                dir="ltr"
                                className="border border-navy/20 rounded-lg px-2 py-1 font-body text-sm text-navy focus:outline-none focus:border-gold text-left"
                              />
                              <div />
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => { setEditingPortionId(portion.id); setPortionEditName(portion.name); setPortionEditQty(String(portion.qty)) }}
                                className="font-body text-sm text-navy text-right hover:text-gold transition-colors"
                              >
                                {portion.name}
                              </button>
                              <button
                                onClick={() => { setEditingPortionId(portion.id); setPortionEditName(portion.name); setPortionEditQty(String(portion.qty)) }}
                                className="font-body text-sm tabular-nums text-navy/70 text-left hover:text-gold transition-colors"
                                dir="ltr"
                              >
                                {portion.qty}
                              </button>
                              <div className="h-2 bg-navy/10 rounded-full overflow-hidden">
                                <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${barPct}%` }} />
                              </div>
                            </>
                          )}
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => handleMovePortion(portion.id, 'up')} disabled={pIdx === 0}
                              aria-label="הזז מנה למעלה"
                              className="text-navy/25 hover:text-navy disabled:opacity-20 transition-colors text-xs leading-tight">▲</button>
                            <button onClick={() => handleMovePortion(portion.id, 'down')} disabled={pIdx === sortedPortions.length - 1}
                              aria-label="הזז מנה למטה"
                              className="text-navy/25 hover:text-navy disabled:opacity-20 transition-colors text-xs leading-tight">▼</button>
                            <button onClick={() => handleDeletePortion(portion.id)}
                              aria-label={`מחק מנה ${portion.name}`}
                              className="text-navy/20 hover:text-red-400 transition-colors text-xs">🗑️</button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Total row */}
                    <div className="grid grid-cols-[1fr_80px_100px_40px] gap-2 items-center px-4 py-2.5 bg-cream/40 border-t-2 border-navy/10">
                      <div className="font-display font-bold text-navy text-sm">סה״כ</div>
                      <div className="font-display font-bold text-navy text-sm tabular-nums text-left" dir="ltr">{totalPortionQty}</div>
                      <div />
                      <div />
                    </div>
                  </>
                )}
              </div>

              {sortedPortions.length > 0 && (
                <button
                  onClick={handleAddPortion}
                  className="w-full py-2.5 border-2 border-dashed border-navy/20 rounded-2xl font-body text-navy/40 text-sm hover:border-gold/40 hover:text-navy/60 transition-colors"
                >
                  + הוסף מנה
                </button>
              )}

              {/* Notes */}
              <div className="bg-white rounded-2xl border-2 border-navy/10 p-4 space-y-3">
                <div className="font-display font-bold text-navy text-sm">הערות / Notes</div>
                <textarea
                  value={notesVal}
                  onChange={e => setNotesVal(e.target.value)}
                  rows={5}
                  placeholder="הערות לאירוע..."
                  dir="rtl"
                  className="w-full border-2 border-navy/15 rounded-xl px-4 py-3 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold resize-none"
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="px-5 py-2 bg-navy text-cream rounded-xl font-body font-semibold text-sm hover:bg-navy/80 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {savingNotes && <span className="w-3 h-3 border-2 border-cream/40 border-t-cream rounded-full animate-spin" />}
                  {savingNotes ? 'שומר...' : '💾 שמור הערות'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {/* Item edit modal */}
      <Modal
        open={!!itemEdit}
        onClose={() => setItemEdit(null)}
        title="עריכת פריט / Edit Item"
      >
        {itemEdit && (
          <div className="space-y-3" dir="rtl">
            <div>
              <label className="font-body text-sm text-navy/70 block mb-1">שם</label>
              <input
                autoFocus
                type="text"
                value={itemEdit.name}
                onChange={e => setItemEdit(s => s ? { ...s, name: e.target.value } : s)}
                className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
              />
            </div>

            {/* Determine kind from current items list */}
            {items.find(i => i.id === itemEdit.itemId)?.kind === 'shop' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="font-body text-sm text-navy/70 block mb-1">כמות</label>
                  <input
                    type="text"
                    value={itemEdit.qty}
                    onChange={e => setItemEdit(s => s ? { ...s, qty: e.target.value } : s)}
                    dir="ltr"
                    className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
                  />
                </div>
                <div className="flex-1">
                  <label className="font-body text-sm text-navy/70 block mb-1">יחידה</label>
                  <input
                    type="text"
                    value={itemEdit.unit}
                    onChange={e => setItemEdit(s => s ? { ...s, unit: e.target.value } : s)}
                    className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="font-body text-sm text-navy/70 block mb-1">הערה</label>
              <input
                type="text"
                value={itemEdit.note}
                onChange={e => setItemEdit(s => s ? { ...s, note: e.target.value } : s)}
                placeholder="הערה אופציונלית..."
                className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
              />
            </div>

            {/* Move to another group */}
            {items.find(i => i.id === itemEdit.itemId)?.kind === 'shop' && sortedGroups.length > 1 && (
              <div>
                <label className="font-body text-sm text-navy/70 block mb-1">קבוצה</label>
                <select
                  value={itemEdit.moveToGroupId}
                  onChange={e => setItemEdit(s => s ? { ...s, moveToGroupId: e.target.value } : s)}
                  className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
                >
                  {sortedGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>
            )}

            {items.find(i => i.id === itemEdit.itemId)?.kind === 'task' && sortedOwners.length > 1 && (
              <div>
                <label className="font-body text-sm text-navy/70 block mb-1">בעלים</label>
                <select
                  value={itemEdit.moveToGroupId}
                  onChange={e => setItemEdit(s => s ? { ...s, moveToGroupId: e.target.value } : s)}
                  className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
                >
                  {sortedOwners.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setItemEdit(null)}
                className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body hover:border-navy/40 transition-colors">
                ביטול
              </button>
              <button
                onClick={handleSaveItemEdit}
                disabled={itemSaving || !itemEdit.name.trim()}
                className="flex-1 py-2.5 bg-navy text-cream rounded-xl font-body font-semibold hover:bg-navy/80 transition-colors disabled:opacity-50"
              >
                {itemSaving ? '...' : 'שמור'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add group modal */}
      <Modal open={addGroupModal} onClose={() => { setAddGroupModal(false); setNewGroupTitle(''); setNewGroupSubtitle('') }} title="קבוצה חדשה / New Group">
        <div className="space-y-3" dir="rtl">
          <div>
            <label className="font-body text-sm text-navy/70 block mb-1">שם קבוצה *</label>
            <input autoFocus type="text" value={newGroupTitle} onChange={e => setNewGroupTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
              className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold" />
          </div>
          <div>
            <label className="font-body text-sm text-navy/70 block mb-1">כותרת משנה (אופציונלי)</label>
            <input type="text" value={newGroupSubtitle} onChange={e => setNewGroupSubtitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
              className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold" />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => { setAddGroupModal(false); setNewGroupTitle(''); setNewGroupSubtitle('') }}
              className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body hover:border-navy/40 transition-colors">ביטול</button>
            <button onClick={handleAddGroup} disabled={!newGroupTitle.trim()}
              className="flex-1 py-2.5 bg-navy text-cream rounded-xl font-body font-semibold hover:bg-navy/80 transition-colors disabled:opacity-50">הוסף</button>
          </div>
        </div>
      </Modal>

      {/* Add owner modal */}
      <Modal open={addOwnerModal} onClose={() => { setAddOwnerModal(false); setNewOwnerName('') }} title="בעלים חדש / New Owner">
        <div className="space-y-3" dir="rtl">
          <div>
            <label className="font-body text-sm text-navy/70 block mb-1">שם *</label>
            <input autoFocus type="text" value={newOwnerName} onChange={e => setNewOwnerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddOwner()}
              className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold" />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => { setAddOwnerModal(false); setNewOwnerName('') }}
              className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body hover:border-navy/40 transition-colors">ביטול</button>
            <button onClick={handleAddOwner} disabled={!newOwnerName.trim()}
              className="flex-1 py-2.5 bg-navy text-cream rounded-xl font-body font-semibold hover:bg-navy/80 transition-colors disabled:opacity-50">הוסף</button>
          </div>
        </div>
      </Modal>

      {/* Delete item confirm */}
      <Modal open={!!deleteItem} onClose={() => setDeleteItem(null)} title="מחיקת פריט / Delete Item">
        <div className="space-y-4" dir="rtl">
          <p className="font-body text-navy/70 text-sm">למחוק את <span className="font-semibold">"{deleteItem?.name}"</span>?</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteItem(null)} className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body hover:border-navy/40 transition-colors">ביטול</button>
            <button onClick={handleDeleteItem} disabled={deleting}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-body font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
              {deleting ? '...' : 'מחק'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete group confirm */}
      <Modal open={!!deleteGroup} onClose={() => setDeleteGroup(null)} title="מחיקת קבוצה / Delete Group">
        <div className="space-y-4" dir="rtl">
          <p className="font-body text-navy/70 text-sm">
            למחוק את הקבוצה <span className="font-semibold">"{deleteGroup?.name}"</span>?
            <br /><span className="text-red-500 text-xs">הפריטים בקבוצה לא יימחקו, אך יאבדו את השיוך.</span>
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteGroup(null)} className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body hover:border-navy/40 transition-colors">ביטול</button>
            <button onClick={handleDeleteGroup} disabled={deleting}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-body font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
              {deleting ? '...' : 'מחק'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete owner confirm */}
      <Modal open={!!deleteOwner} onClose={() => setDeleteOwner(null)} title="מחיקת בעלים / Delete Owner">
        <div className="space-y-4" dir="rtl">
          <p className="font-body text-navy/70 text-sm">
            למחוק את <span className="font-semibold">"{deleteOwner?.name}"</span>?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteOwner(null)} className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body hover:border-navy/40 transition-colors">ביטול</button>
            <button onClick={handleDeleteOwner} disabled={deleting}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-body font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">
              {deleting ? '...' : 'מחק'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
