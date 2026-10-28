import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import Modal from '../components/Modal'
import { useStore } from '../stores/useStore'
import { FIREBASE_ENABLED } from '../services/firebase'
import {
  subscribePrepEvents,
  createPrepEvent,
  updatePrepEvent,
  deletePrepEvent,
  duplicatePrepEvent,
  seedMexicanEvent,
} from '../services/prepFirebase'
import type { PrepEvent, PrepStatus } from '../types/prep'

const STATUS_INFO: Record<PrepStatus, { he: string; color: string }> = {
  planning: { he: 'בתכנון', color: 'bg-amber-100 text-amber-700' },
  active:   { he: 'פעיל',   color: 'bg-green-100 text-green-700' },
  done:     { he: 'הסתיים', color: 'bg-navy/10 text-navy/50' },
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PrepPage() {
  const navigate = useNavigate()
  const currentRole = useStore(s => s.currentRole)
  const showToast = useStore(s => s.showToast)

  const [events, setEvents] = useState<PrepEvent[]>([])
  const [loading, setLoading] = useState(true)

  // New event modal
  const [newModal, setNewModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newMode, setNewMode] = useState<'empty' | 'duplicate'>('empty')
  const [dupSource, setDupSource] = useState('')
  const [dupOldPortions, setDupOldPortions] = useState('')
  const [dupNewPortions, setDupNewPortions] = useState('')
  const [creating, setCreating] = useState(false)

  // Rename modal
  const [renameModal, setRenameModal] = useState<{ id: string; name: string } | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Seed
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    if (!FIREBASE_ENABLED) { setLoading(false); return }
    return subscribePrepEvents(evts => {
      setEvents(evts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setLoading(false)
    })
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const now = new Date().toISOString()
      const id = `prep_${Date.now()}`

      if (newMode === 'duplicate' && dupSource) {
        const oldP = parseFloat(dupOldPortions)
        const newP = parseFloat(dupNewPortions)
        const factor = (dupOldPortions && dupNewPortions && oldP > 0 && newP > 0) ? newP / oldP : 1
        await duplicatePrepEvent(
          dupSource,
          id,
          newName.trim(),
          newDate || null,
          factor,
          currentRole ?? 'admin',
        )
      } else {
        const event: PrepEvent = {
          id,
          name: newName.trim(),
          date: newDate || null,
          status: 'planning',
          notes: '',
          shoppingGroups: [],
          owners: [],
          portions: [],
          totalItems: 0,
          doneItems: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: currentRole ?? 'admin',
        }
        await createPrepEvent(event)
      }

      setNewModal(false)
      resetNewModal()
      navigate(`/prep/${id}`)
    } catch {
      showToast('שגיאה ביצירת אירוע / Create failed', 'error')
    } finally {
      setCreating(false)
    }
  }

  function resetNewModal() {
    setNewName('')
    setNewDate('')
    setNewMode('empty')
    setDupSource('')
    setDupOldPortions('')
    setDupNewPortions('')
  }

  async function handleRename() {
    if (!renameModal || !renameName.trim()) return
    setRenaming(true)
    try {
      await updatePrepEvent(renameModal.id, { name: renameName.trim() })
      setRenameModal(null)
      showToast('שם עודכן / Name updated')
    } catch {
      showToast('שגיאה בשינוי שם / Rename failed', 'error')
    } finally {
      setRenaming(false)
    }
  }

  async function handleStatusChange(id: string, status: PrepStatus) {
    try {
      await updatePrepEvent(id, { status })
    } catch {
      showToast('שגיאה בעדכון סטטוס / Status update failed', 'error')
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    setDeleting(true)
    try {
      await deletePrepEvent(deleteConfirm.id)
      setDeleteConfirm(null)
      showToast('האירוע נמחק / Event deleted')
    } catch {
      showToast('שגיאה במחיקה / Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSeed() {
    setSeeding(true)
    try {
      await seedMexicanEvent(currentRole ?? 'admin')
      showToast('האירוע המקסיקני יובא / Mexican event imported')
    } catch {
      showToast('שגיאה בייבוא / Import failed', 'error')
    } finally {
      setSeeding(false)
    }
  }

  async function handleDuplicate(event: PrepEvent) {
    setNewName(event.name + ' — עותק')
    setNewDate('')
    setNewMode('duplicate')
    setDupSource(event.id)
    setDupOldPortions('')
    setDupNewPortions('')
    setNewModal(true)
  }

  return (
    <div className="h-full flex flex-col bg-cream overflow-hidden" dir="rtl">
      <TopBar
        title="הכנות לאירוע"
        titleEn="Event Prep"
        actions={
          FIREBASE_ENABLED ? (
            <button
              onClick={() => { resetNewModal(); setNewModal(true) }}
              className="px-3 py-1.5 bg-gold text-navy rounded-xl font-body font-semibold text-sm hover:bg-gold/80 transition-colors"
            >
              + אירוע חדש
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-3">

          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="w-8 h-8 border-4 border-navy/20 border-t-navy rounded-full animate-spin" />
            </div>
          ) : !FIREBASE_ENABLED ? (
            <div className="py-20 text-center">
              <div className="text-4xl mb-3">☁️</div>
              <div className="font-display font-bold text-navy text-lg mb-1">Firebase לא מוגדר</div>
              <div className="font-body text-navy/40 text-sm">Event prep requires Firebase / הכנות לאירוע דורש Firebase</div>
            </div>
          ) : events.length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-5xl mb-4">📋</div>
              <div className="font-display font-bold text-navy text-xl mb-2">עדיין אין אירועים</div>
              <div className="font-body text-navy/50 text-sm mb-6">צור אירוע חדש כדי להתחיל לתכנן</div>
              <button
                onClick={() => { resetNewModal(); setNewModal(true) }}
                className="px-6 py-3 bg-navy text-cream rounded-xl font-body font-semibold hover:bg-navy/80 transition-colors"
              >
                + אירוע חדש
              </button>
            </div>
          ) : (
            <>
              {events.map(event => {
                const pct = event.totalItems > 0
                  ? Math.round((event.doneItems / event.totalItems) * 100)
                  : 0
                return (
                  <div
                    key={event.id}
                    className="bg-white rounded-2xl border-2 border-navy/10 hover:border-gold/40 transition-colors"
                  >
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => navigate(`/prep/${event.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-display font-bold text-navy text-base leading-tight">{event.name}</div>
                          <div className="font-body text-xs text-navy/40 mt-0.5">{fmtDate(event.date)}</div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-body font-medium shrink-0 ${STATUS_INFO[event.status].color}`}>
                          {STATUS_INFO[event.status].he}
                        </span>
                      </div>

                      {event.totalItems > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-body text-xs text-navy/50">
                              {event.doneItems}/{event.totalItems} בוצעו
                            </div>
                            <div className="font-body text-xs text-navy/40">{pct}%</div>
                          </div>
                          <div className="h-1.5 bg-navy/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gold rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Row actions */}
                    <div className="px-4 pb-3 flex items-center gap-2 flex-wrap border-t border-navy/5 pt-3">
                      <select
                        value={event.status}
                        onChange={e => handleStatusChange(event.id, e.target.value as PrepStatus)}
                        onClick={e => e.stopPropagation()}
                        className="text-xs border border-navy/15 rounded-lg px-2 py-1 font-body text-navy bg-cream focus:outline-none focus:border-gold"
                      >
                        <option value="planning">בתכנון</option>
                        <option value="active">פעיל</option>
                        <option value="done">הסתיים</option>
                      </select>

                      <button
                        onClick={() => { setRenameModal({ id: event.id, name: event.name }); setRenameName(event.name) }}
                        className="text-xs font-body text-navy/50 hover:text-navy border border-navy/15 rounded-lg px-2 py-1 hover:border-navy/30 transition-colors"
                      >
                        ✏️ שנה שם
                      </button>

                      <button
                        onClick={() => handleDuplicate(event)}
                        className="text-xs font-body text-navy/50 hover:text-navy border border-navy/15 rounded-lg px-2 py-1 hover:border-navy/30 transition-colors"
                      >
                        📋 שכפל
                      </button>

                      <button
                        onClick={() => setDeleteConfirm({ id: event.id, name: event.name })}
                        className="text-xs font-body text-navy/25 hover:text-red-500 border border-transparent hover:border-red-200 rounded-lg px-2 py-1 transition-colors mr-auto"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* Seed button */}
              <div className="pt-2 text-center">
                <button
                  onClick={handleSeed}
                  disabled={seeding}
                  className="text-xs font-body text-navy/30 hover:text-navy/60 transition-colors disabled:opacity-50"
                >
                  {seeding ? '...' : '🌮 ייבוא אירוע מקסיקני'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New event modal */}
      <Modal
        open={newModal}
        onClose={() => { setNewModal(false); resetNewModal() }}
        title="אירוע חדש / New Event"
      >
        <div className="space-y-4" dir="rtl">
          <div>
            <label className="font-body text-sm text-navy/70 block mb-1">שם האירוע *</label>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="פופ-אפ מקסיקני"
              className="w-full border-2 border-navy/15 rounded-xl px-4 py-2.5 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="font-body text-sm text-navy/70 block mb-1">תאריך (אופציונלי)</label>
            <input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              dir="ltr"
              className="w-full border-2 border-navy/15 rounded-xl px-4 py-2.5 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
            />
          </div>

          <div>
            <label className="font-body text-sm text-navy/70 block mb-2">אופן פתיחה</label>
            <div className="flex gap-2">
              {([['empty', 'ריק'], ['duplicate', 'שכפול מאירוע קודם']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setNewMode(val)}
                  className={`flex-1 py-2 rounded-xl border-2 font-body text-sm transition-colors
                    ${newMode === val ? 'border-gold bg-gold/10 text-navy font-semibold' : 'border-navy/15 text-navy/60 hover:border-navy/30'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {newMode === 'duplicate' && (
            <div className="space-y-3 bg-cream rounded-xl p-3 border border-navy/10">
              <div>
                <label className="font-body text-sm text-navy/70 block mb-1">בחר אירוע מקור</label>
                <select
                  value={dupSource}
                  onChange={e => setDupSource(e.target.value)}
                  className="w-full border-2 border-navy/15 rounded-xl px-3 py-2 font-body text-sm text-navy bg-white focus:outline-none focus:border-gold"
                >
                  <option value="">— בחר אירוע —</option>
                  {events.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-body text-xs text-navy/50 block mb-1.5">שינוי כמויות (אופציונלי)</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="font-body text-xs text-navy/40 mb-0.5">מנות קודמות</div>
                    <input
                      type="number"
                      min="1"
                      value={dupOldPortions}
                      onChange={e => setDupOldPortions(e.target.value)}
                      placeholder="350"
                      dir="ltr"
                      className="w-full border border-navy/15 rounded-lg px-3 py-1.5 font-body text-sm text-navy bg-white focus:outline-none focus:border-gold"
                    />
                  </div>
                  <span className="text-navy/30 font-body text-sm mt-4">→</span>
                  <div className="flex-1">
                    <div className="font-body text-xs text-navy/40 mb-0.5">מנות חדשות</div>
                    <input
                      type="number"
                      min="1"
                      value={dupNewPortions}
                      onChange={e => setDupNewPortions(e.target.value)}
                      placeholder="280"
                      dir="ltr"
                      className="w-full border border-navy/15 rounded-lg px-3 py-1.5 font-body text-sm text-navy bg-white focus:outline-none focus:border-gold"
                    />
                  </div>
                </div>
                {dupOldPortions && dupNewPortions && parseFloat(dupOldPortions) > 0 && parseFloat(dupNewPortions) > 0 && (
                  <div className="font-body text-xs text-gold mt-1.5">
                    מקדם: ×{(parseFloat(dupNewPortions) / parseFloat(dupOldPortions)).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { setNewModal(false); resetNewModal() }}
              className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body font-medium hover:border-navy/40 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || (newMode === 'duplicate' && !dupSource)}
              className="flex-1 py-2.5 bg-navy text-cream rounded-xl font-body font-semibold hover:bg-navy/80 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating && <span className="w-4 h-4 border-2 border-cream/40 border-t-cream rounded-full animate-spin" />}
              {creating ? 'יוצר...' : 'צור אירוע'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Rename modal */}
      <Modal
        open={!!renameModal}
        onClose={() => setRenameModal(null)}
        title="שנה שם / Rename"
      >
        <div className="space-y-4" dir="rtl">
          <input
            autoFocus
            type="text"
            value={renameName}
            onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
            className="w-full border-2 border-navy/15 rounded-xl px-4 py-2.5 font-body text-sm text-navy bg-cream focus:outline-none focus:border-gold"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setRenameModal(null)}
              className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body hover:border-navy/40 transition-colors"
            >ביטול</button>
            <button
              onClick={handleRename}
              disabled={renaming || !renameName.trim()}
              className="flex-1 py-2.5 bg-navy text-cream rounded-xl font-body font-semibold hover:bg-navy/80 transition-colors disabled:opacity-50"
            >
              {renaming ? '...' : 'שמור'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="מחיקת אירוע / Delete Event"
      >
        <div className="space-y-4" dir="rtl">
          <p className="font-body text-navy/70 text-sm">
            האם למחוק את <span className="font-semibold text-navy">"{deleteConfirm?.name}"</span>?
            <br />פעולה זו אינה ניתנת לביטול.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="flex-1 py-2.5 border-2 border-navy/20 text-navy/60 rounded-xl font-body hover:border-navy/40 transition-colors"
            >ביטול</button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-body font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {deleting ? '...' : 'מחק'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
