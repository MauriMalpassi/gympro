import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

export default function ProgressionTeacher() {
  const [searchParams] = useSearchParams()
  const [students, setStudents]   = useState([])
  const [selStu,   setSelStu]     = useState(searchParams.get('student') || '')
  const [exercises, setExercises] = useState([])
  const [selEx,    setSelEx]      = useState('')
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'student').order('full_name')
      .then(({ data }) => {
        setStudents(data || [])
        if (!selStu && data?.length) setSelStu(data[0].id)
      })
    supabase.from('exercises').select('*').order('name')
      .then(({ data }) => {
        setExercises(data || [])
        if (!selEx && data?.length) setSelEx(data[0].id)
      })
  }, [])

  useEffect(() => {
    if (selStu && selEx) loadChart()
  }, [selStu, selEx])

  async function loadChart() {
    setLoading(true)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*, routine_items!inner(exercise_id, day_of_week, suggested_kg)')
      .eq('student_id', selStu)
      .eq('routine_items.exercise_id', selEx)
      .order('week_number')
      .order('logged_at')

    if (!sessions?.length) { setChartData(null); setLoading(false); return }

    const labels = sessions.map(s => `${s.routine_items.day_of_week} S${s.week_number}`)
    const actual  = sessions.map(s => s.actual_kg)
    const suggested = sessions.map(s => s.routine_items.suggested_kg)

    setChartData({
      labels,
      datasets: [
        {
          label: 'Peso utilizado',
          data: actual,
          borderColor: '#1DB97A',
          backgroundColor: 'rgba(29,185,122,.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#1DB97A',
          pointRadius: 5,
          tension: .3,
          fill: true,
        },
        {
          label: 'Peso sugerido',
          data: suggested,
          borderColor: '#EF9F27',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
        }
      ]
    })
    setLoading(false)
  }

  const selectedExName = exercises.find(e => e.id === selEx)?.name || ''
  const selectedStuName = students.find(s => s.id === selStu)?.full_name || ''

  return (
    <div className="space-y-6 fade-up">
      <div>
        <h1 className="text-xl font-semibold text-iron-900">Progresión por ejercicio</h1>
        <p className="text-sm text-iron-400 mt-0.5">Evolución de pesos a lo largo de las semanas</p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 card p-4">
        <div>
          <label className="label">Alumno</label>
          <select className="input" value={selStu} onChange={e => setSelStu(e.target.value)}>
            {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Ejercicio</label>
          <select className="input" value={selEx} onChange={e => setSelEx(e.target.value)}>
            {exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium text-iron-800">{selectedExName}</h2>
            <p className="text-xs text-iron-400 mt-0.5">{selectedStuName}</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-iron-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-gym-500 inline-block rounded" />Utilizado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-400 inline-block rounded border-t border-dashed border-amber-400" />Sugerido
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 rounded-full border-2 border-gym-200 border-t-gym-500 animate-spin" />
          </div>
        ) : !chartData ? (
          <div className="text-center py-12 text-iron-300">
            <i className="ti ti-chart-line text-4xl block mb-2" />
            <p className="text-sm">Sin sesiones registradas para este ejercicio</p>
          </div>
        ) : (
          <div style={{ height: 260 }}>
            <Line
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                  y: { ticks: { callback: v => v + ' kg', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.05)' } },
                  x: { grid: { display: false }, ticks: { font: { size: 11 } } }
                }
              }}
            />
          </div>
        )}
      </div>

      {/* All exercises summary for student */}
      {selStu && (
        <AllExercisesSummary studentId={selStu} studentName={selectedStuName} />
      )}
    </div>
  )
}

function AllExercisesSummary({ studentId, studentName }) {
  const [data, setData] = useState([])

  useEffect(() => {
    supabase
      .from('sessions')
      .select('actual_kg, week_number, routine_items(exercises(name), day_of_week)')
      .eq('student_id', studentId)
      .order('logged_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setData(data || []))
  }, [studentId])

  // Group by exercise, get max
  const summary = {}
  data.forEach(s => {
    const name = s.routine_items?.exercises?.name
    if (!name) return
    if (!summary[name] || s.actual_kg > summary[name]) summary[name] = s.actual_kg
  })
  const entries = Object.entries(summary).slice(0, 8)
  if (!entries.length) return null

  return (
    <div className="card p-4">
      <h2 className="text-sm font-medium text-iron-800 mb-3">Mejores marcas — {studentName}</h2>
      <div className="space-y-2">
        {entries.map(([name, kg]) => (
          <div key={name} className="flex items-center gap-3">
            <span className="flex-1 text-sm text-iron-700 truncate">{name}</span>
            <div className="flex-1 bg-iron-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gym-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, (kg / 120) * 100)}%` }}
              />
            </div>
            <span className="text-sm font-semibold text-gym-700 w-16 text-right">{kg} kg</span>
          </div>
        ))}
      </div>
    </div>
  )
}
