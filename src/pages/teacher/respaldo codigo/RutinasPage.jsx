import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const BLOCK_CLASSES = { 'Bloque 1': 'badge-block1', 'Bloque 2': 'badge-block2', 'Bloque 3': 'badge-block3' }

export default function RutinasPage() {
  const [routines, setRoutines] = useState([])
  const [days, setDays] = useState([])
  const [activeRoutine, setActiveRoutine] = useState(null)
  const [exercises, setExercises] = useState([])
  const [activeDay, setActiveDay] = useState(null)
  const [showNewRoutine, setShowNewRoutine] = useState(false)
  const [showNewExercise, setShowNewExercise] = useState(false)
  const [editingEx, setEditingEx] = useState(null)
  const [form, setForm] = useState({ name: '', series: 4, reps: 12, block_name: 'Bloque 1', muscle_group: '', video_url: '' })
  const [monthYear, setMonthYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  // FIX: estado para renombrar rutina
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (activeRoutine && activeDay) loadExercises() }, [activeRoutine, activeDay])

  async function loadData() {
    const [{ data: ruts }, { data: ds }] = await Promise.all([
      supabase.from('monthly_routines').select('*').order('month_year', { ascending: false }),
      supabase.from('training_days').select('*').order('order_index'),
    ])
    setRoutines(ruts || [])
    setDays(ds || [])
    if (ruts?.length) setActiveRoutine(ruts[0].id)
    if (ds?.length) setActiveDay(ds[0].id)
  }

  async function loadExercises() {
    const { data } = await supabase
      .from('monthly_exercises')
      .select('*')
      .eq('monthly_routine_id', activeRoutine)
      .eq('training_day_id', activeDay)
      .order('order_index')
    setExercises(data || [])
  }

  async function createRoutine() {
    if (!monthYear) { alert('Elegí un mes'); return }
    setLoading(true)
    try {
      const { data: currentExs } = await supabase
        .from('exercises')
        .select('*')
        .order('order_index')

      const { data: newRoutine } = await supabase
        .from('monthly_routines')
        .insert({ month_year: monthYear, name: `Rutina ${monthYear}`, is_active: false })
        .select().single()

      if (currentExs?.length) {
        await supabase.from('monthly_exercises').insert(
          currentExs.map(ex => ({
            monthly_routine_id: newRoutine.id,
            training_day_id: ex.training_day_id,
            block_name: ex.block_name,
            block_order: ex.block_order,
            name: ex.name,
            series: ex.series,
            reps: ex.reps,
            order_index: ex.order_index,
            muscle_group: ex.muscle_group,
            video_url: ex.video_url,
          }))
        )
      }

      setShowNewRoutine(false)
      setMonthYear('')
      loadData()
      showToast('Rutina creada — ya podés editarla')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function activateRoutine(id) {
    if (!confirm('¿Activar esta rutina? Los alumnos verán estos ejercicios desde ahora.')) return
    await supabase.from('monthly_routines').update({ is_active: false }).neq('id', id)
    await supabase.from('monthly_routines').update({ is_active: true }).eq('id', id)

    const { data: monthlyExs } = await supabase
      .from('monthly_exercises')
      .select('*')
      .eq('monthly_routine_id', id)

    if (monthlyExs?.length) {
      await supabase.from('exercises').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('exercises').insert(
        monthlyExs.map(ex => ({
          training_day_id: ex.training_day_id,
          block_name: ex.block_name,
          block_order: ex.block_order,
          name: ex.name,
          series: ex.series,
          reps: ex.reps,
          order_index: ex.order_index,
          muscle_group: ex.muscle_group,
          video_url: ex.video_url,
          description: ex.description,
        }))
      )
    }

    loadData()
    showToast('¡Rutina activada! Los alumnos ya ven los nuevos ejercicios')
  }

  // FIX: renombrar el mes de una rutina
  function openRename(routine) {
    setRenameValue(routine.month_year)
    setShowRenameModal(true)
  }

  async function saveRename(e) {
    e.preventDefault()
    if (!renameValue) return
    await supabase.from('monthly_routines')
      .update({ month_year: renameValue, name: `Rutina ${renameValue}` })
      .eq('id', activeRoutine)
    setShowRenameModal(false)
    loadData()
    showToast('Rutina renombrada')
  }

  async function saveExercise(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (editingEx) {
        await supabase.from('monthly_exercises').update({
          name: form.name, series: Number(form.series), reps: Number(form.reps),
          block_name: form.block_name, muscle_group: form.muscle_group, video_url: form.video_url,
        }).eq('id', editingEx.id)
        showToast('Ejercicio actualizado')
      } else {
        const maxOrder = exercises.length ? Math.max(...exercises.map(e => e.order_index)) + 1 : 1
        await supabase.from('monthly_exercises').insert({
          monthly_routine_id: activeRoutine,
          training_day_id: activeDay,
          name: form.name, series: Number(form.series), reps: Number(form.reps),
          block_name: form.block_name,
          block_order: form.block_name === 'Bloque 1' ? 1 : form.block_name === 'Bloque 2' ? 2 : 3,
          muscle_group: form.muscle_group, video_url: form.video_url,
          order_index: maxOrder,
        })
        showToast('Ejercicio agregado')
      }
      setShowNewExercise(false)
      setEditingEx(null)
      setForm({ name: '', series: 4, reps: 12, block_name: 'Bloque 1', muscle_group: '', video_url: '' })
      loadExercises()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteExercise(id) {
    if (!confirm('¿Eliminar este ejercicio de la rutina?')) return
    await supabase.from('monthly_exercises').delete().eq('id', id)
    loadExercises()
    showToast('Ejercicio eliminado')
  }

  function openEdit(ex) {
    setEditingEx(ex)
    setForm({ name: ex.name, series: ex.series, reps: ex.reps, block_name: ex.block_name, muscle_group: ex.muscle_group || '', video_url: ex.video_url || '' })
    setShowNewExercise(true)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const currentRoutine = routines.find(r => r.id === activeRoutine)

  return (
    <div className="py-4 space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-primary-400 text-white px-4 py-2 rounded-xl text-sm flex items-center gap-2 shadow-lg">
          <i className="ti ti-check" /> {toast}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-medium text-gray-800 flex items-center gap-2">
          <i className="ti ti-calendar-month text-primary-400" /> Rutinas mensuales
        </h2>
        <button onClick={() => setShowNewRoutine(true)} className="btn-primary flex items-center gap-2 text-sm">
          <i className="ti ti-plus" /> Nueva rutina
        </button>
      </div>

      {/* Selector de rutinas */}
      <div className="flex gap-2 flex-wrap">
        {routines.map(r => (
          <button key={r.id} onClick={() => setActiveRoutine(r.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all
              ${activeRoutine === r.id ? 'border-primary-400 bg-primary-50 text-primary-800 font-medium' : 'border-gray-200 bg-white text-gray-600'}`}>
            {r.month_year}
            {r.is_active && <span className="w-2 h-2 rounded-full bg-primary-400 inline-block" />}
          </button>
        ))}
        {!routines.length && <p className="text-sm text-gray-400">No hay rutinas creadas todavía</p>}
      </div>

      {currentRoutine && (
        <>
          {/* Info de la rutina activa */}
          <div className={`card p-4 flex items-center justify-between gap-3 ${currentRoutine.is_active ? 'border-primary-400' : ''}`}>
            <div>
              <p className="font-medium text-gray-900">{currentRoutine.month_year}</p>
              <p className="text-xs mt-0.5">
                {currentRoutine.is_active
                  ? <span className="text-primary-600 font-medium">✓ Activa — los alumnos ven esta rutina</span>
                  : <span className="text-gray-400">En preparación — los alumnos aún no la ven</span>}
              </p>
            </div>
            <div className="flex gap-2">
              {/* FIX: botón para cambiar el mes de la rutina */}
              <button onClick={() => openRename(currentRoutine)}
                className="btn-secondary text-sm flex items-center gap-1.5">
                <i className="ti ti-pencil text-xs" /> Cambiar mes
              </button>
              {!currentRoutine.is_active && (
                <button onClick={() => activateRoutine(currentRoutine.id)}
                  className="btn-primary text-sm flex items-center gap-2">
                  <i className="ti ti-player-play" /> Activar
                </button>
              )}
            </div>
          </div>

          {/* Selector de día */}
          <div className="flex gap-2 flex-wrap">
            {days.map(d => (
              <button key={d.id} onClick={() => setActiveDay(d.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all
                  ${activeDay === d.id ? 'bg-primary-400 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {d.name}
              </button>
            ))}
          </div>

          {/* Botón agregar ejercicio */}
          <div className="flex justify-end">
            <button onClick={() => { setEditingEx(null); setForm({ name: '', series: 4, reps: 12, block_name: 'Bloque 1', muscle_group: '', video_url: '' }); setShowNewExercise(true) }}
              className="btn-secondary flex items-center gap-2 text-sm">
              <i className="ti ti-plus" /> Agregar ejercicio
            </button>
          </div>

          {/* Lista de ejercicios */}
          <div className="space-y-2">
            {exercises.map(ex => (
              <div key={ex.id} className="card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={BLOCK_CLASSES[ex.block_name] || 'badge-block1'}>{ex.block_name}</span>
                    {ex.muscle_group && <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-500">{ex.muscle_group}</span>}
                    {ex.video_url && ex.video_url !== 'EMPTY' && ex.video_url.trim() !== '' && (
                      <span className="text-xs px-2 py-0.5 bg-red-50 rounded-full text-red-400 flex items-center gap-1">
                        <i className="ti ti-player-play text-xs" /> video
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-gray-900">{ex.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ex.series} series × {ex.reps} reps</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(ex)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                    <i className="ti ti-edit text-base" />
                  </button>
                  <button onClick={() => deleteExercise(ex.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                    <i className="ti ti-trash text-base" />
                  </button>
                </div>
              </div>
            ))}
            {!exercises.length && (
              <div className="text-center py-8 text-gray-400">
                <i className="ti ti-barbell text-3xl block mb-2" />
                <p className="text-sm">Sin ejercicios para este día</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal nueva rutina */}
      {showNewRoutine && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
              <i className="ti ti-calendar-month text-primary-400" /> Nueva rutina mensual
            </h3>
            <p className="text-sm text-gray-500 mb-4">Se va a crear con los ejercicios actuales como base para que puedas editarlos.</p>
            <div>
              <label className="label">Mes</label>
              <input type="month" className="input" value={monthYear} onChange={e => setMonthYear(e.target.value)} />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowNewRoutine(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={createRoutine} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={loading}>
                {loading ? <i className="ti ti-loader animate-spin" /> : null} Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX: Modal renombrar rutina */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
              <i className="ti ti-pencil text-primary-400" /> Cambiar mes de la rutina
            </h3>
            <form onSubmit={saveRename} className="space-y-4">
              <div>
                <label className="label">Mes</label>
                <input type="month" className="input" value={renameValue} onChange={e => setRenameValue(e.target.value)} required />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowRenameModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ejercicio */}
      {showNewExercise && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-medium text-gray-900 mb-4 flex items-center gap-2">
              <i className="ti ti-barbell text-primary-400" />
              {editingEx ? 'Editar ejercicio' : 'Agregar ejercicio'}
            </h3>
            <form onSubmit={saveExercise} className="space-y-3">
              <div>
                <label className="label">Nombre</label>
                <input className="input" placeholder="Ej: Press de banca"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Bloque</label>
                  <select className="input" value={form.block_name} onChange={e => setForm(p => ({ ...p, block_name: e.target.value }))}>
                    <option>Bloque 1</option>
                    <option>Bloque 2</option>
                    <option>Bloque 3</option>
                  </select>
                </div>
                <div>
                  <label className="label">Grupo muscular</label>
                  <input className="input" placeholder="Ej: Pecho"
                    value={form.muscle_group} onChange={e => setForm(p => ({ ...p, muscle_group: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Series</label>
                  <input className="input" type="number" min="1" max="10"
                    value={form.series} onChange={e => setForm(p => ({ ...p, series: e.target.value }))} required />
                </div>
                <div>
                  <label className="label">Repeticiones</label>
                  <input className="input" type="number" min="1" max="100"
                    value={form.reps} onChange={e => setForm(p => ({ ...p, reps: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="label">Video YouTube (opcional)</label>
                <input className="input" placeholder="https://youtube.com/watch?v=..."
                  value={form.video_url} onChange={e => setForm(p => ({ ...p, video_url: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowNewExercise(false); setEditingEx(null) }} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={loading}>
                  {loading ? <i className="ti ti-loader animate-spin" /> : null}
                  {editingEx ? 'Guardar' : 'Agregar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
