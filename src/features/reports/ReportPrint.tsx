import { Loader2, Printer } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { DIFFICULT_PCT, fmtSecs, MODE_LABEL, questionPct, stats, topDistractor, useSessionReport, type SessionReport } from '../../lib/api/reports'
import { BRAND } from '../../lib/brand'
import { fmtDateTime } from '../../lib/dates'
import { useAuth } from '../auth/AuthProvider'
import { TERM_LABEL } from '../academic/gradingDefaults'

/** Reporte de sesión en formato A4 para imprimir o "Guardar como PDF". */
export function ReportPrint() {
  const { loading, session } = useAuth()
  if (loading) return <Loader2 className="m-10 size-8 animate-spin" />
  if (!session) return <Navigate to="/admin/login" replace />
  return <PrintBody />
}

function PrintBody() {
  const { id = '' } = useParams()
  const rep = useSessionReport(id)
  const { teacher } = useAuth()
  useEffect(() => {
    if (!rep.data) return
    document.title = `Reporte ${rep.data.session.subject.code} ${rep.data.session.quiz_title}`
    const t = setTimeout(() => window.print(), 700)
    return () => clearTimeout(t)
  }, [rep.data])
  if (!rep.data) return <Loader2 className="m-10 size-8 animate-spin" />
  return <Doc rep={rep.data} teacher={teacher?.full_name ?? ''} />
}

function Doc({ rep, teacher }: { rep: SessionReport; teacher: string }) {
  const s = rep.session
  const st = useMemo(() => stats(rep), [rep])
  const roster = s.identification === 'roster'
  const students = [...rep.students].filter((x) => !x.kicked).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const difficult = rep.questions.filter((q) => {
    const p = questionPct(q)
    return p !== null && p < DIFFICULT_PCT
  })
  return (
    <div className="print-doc mx-auto max-w-[210mm] bg-white p-8 text-[11pt] text-black">
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print { .no-print { display: none !important } body { background: #fff !important } .print-doc { padding: 0 !important; max-width: none !important } }
        .print-doc table { border-collapse: collapse; width: 100% }
        .print-doc th, .print-doc td { border: 1px solid #BFBFBF; padding: 3px 6px; }
        .print-doc th { background: #1F3864; color: #fff; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .print-doc tr { break-inside: avoid; }
      `}</style>
      <button onClick={() => window.print()} className="no-print fixed right-4 top-4 flex items-center gap-2 rounded-xl bg-uap-blue px-4 py-2 font-bold text-white shadow-lg">
        <Printer className="size-4" /> Imprimir / Guardar PDF
      </button>

      {/* Encabezado institucional */}
      <header className="flex items-center gap-4 border-b-4 pb-3" style={{ borderColor: '#8B1A1A' }}>
        <img src={BRAND.logoColor} alt="Escudo UAP" className="size-20 object-contain" />
        <div className="flex-1 text-center">
          <p className="text-[15pt] font-black tracking-wide" style={{ color: '#1F3864' }}>
            UNIVERSIDAD AMAZÓNICA DE PANDO
          </p>
          <p className="text-[10pt] font-semibold" style={{ color: '#4D4D4D' }}>
            {s.subject.career ? `Carrera de ${s.subject.career} · ` : ''}Cobija – Pando – Bolivia
          </p>
          <p className="mt-1 text-[13pt] font-bold" style={{ color: '#8B1A1A' }}>
            REPORTE DE EVALUACIÓN
          </p>
        </div>
        <div className="w-20" />
      </header>

      <table className="mt-3 text-[10pt]">
        <tbody>
          <Row a="Asignatura" b={`${s.subject.code} – ${s.subject.name}`} c="Paralelo" d={s.subject.parallel} />
          <Row a="Evaluación" b={s.quiz_title} c="Modalidad" d={MODE_LABEL[s.mode]} />
          <Row a="Periodo" b={`${s.period} (${s.year})`} c="Fecha" d={fmtDateTime(s.opens_at ?? s.created_at)} />
          <Row a="Docente" b={teacher} c="Categoría" d={s.grading_item ? `${TERM_LABEL(s.grading_item.term)} · ${s.grading_item.category}` : 'Sin nota'} />
        </tbody>
      </table>

      <h2 className="mb-1 mt-4 text-[12pt] font-bold" style={{ color: '#1F3864' }}>
        Resumen
      </h2>
      <table className="text-center text-[10pt]">
        <thead>
          <tr>
            <th>Participaron</th>
            <th>Promedio</th>
            <th>Mediana</th>
            <th>Máxima</th>
            <th>Mínima</th>
            <th>Aprobados (≥{s.pass_mark})</th>
            <th>Tiempo prom.</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{st.enrolled !== null ? `${st.participants} de ${st.enrolled}` : st.participants}</td>
            <td>{st.avg ?? '—'}</td>
            <td>{st.median ?? '—'}</td>
            <td>{st.max === null ? '—' : Math.round(st.max)}</td>
            <td>{st.min === null ? '—' : Math.round(st.min)}</td>
            <td>
              {st.pass} ({st.passPct ?? 0} %)
            </td>
            <td>{fmtSecs(st.avgTimeMs)}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-1 mt-4 text-[12pt] font-bold" style={{ color: '#1F3864' }}>
        Calificaciones
      </h2>
      <table className="text-[9.5pt]">
        <thead>
          <tr>
            <th style={{ width: '6%' }}>N°</th>
            {roster && <th style={{ width: '14%' }}>RU</th>}
            <th>{roster ? 'Apellidos y nombres' : 'Apodo'}</th>
            <th style={{ width: '10%' }}>Aciertos</th>
            <th style={{ width: '10%' }}>Nota</th>
            <th style={{ width: '14%' }}>Observación</th>
          </tr>
        </thead>
        <tbody>
          {students.map((r, i) => {
            const g = r.grade === null ? null : Number(r.grade)
            return (
              <tr key={r.participant_id}>
                <td className="text-center">{i + 1}</td>
                {roster && <td>{r.code}</td>}
                <td>{r.name}</td>
                <td className="text-center">
                  {r.correct ?? 0}/{s.question_count}
                </td>
                <td className="text-center font-bold" style={{ color: g !== null && g < s.pass_mark ? '#8B1A1A' : '#1B7339' }}>
                  {g === null ? '—' : Math.round(g)}
                </td>
                <td className="text-[8.5pt]">
                  {r.adjusted !== null ? 'Nota ajustada' : ''}
                  {r.tab_switches ? `${r.adjusted !== null ? '; ' : ''}${r.tab_switches} salida(s)` : ''}
                </td>
              </tr>
            )
          })}
          {roster &&
            rep.absent.map((a, i) => (
              <tr key={a.student_id} style={{ color: '#767676' }}>
                <td className="text-center">{students.length + i + 1}</td>
                <td>{a.code}</td>
                <td>{a.name}</td>
                <td className="text-center">—</td>
                <td className="text-center">—</td>
                <td>Ausente</td>
              </tr>
            ))}
        </tbody>
      </table>

      <h2 className="mb-1 mt-4 text-[12pt] font-bold" style={{ color: '#1F3864' }}>
        Análisis por pregunta
      </h2>
      <table className="text-[9pt]">
        <thead>
          <tr>
            <th style={{ width: '6%' }}>N°</th>
            <th>Pregunta</th>
            <th style={{ width: '11%' }}>% acierto</th>
            <th style={{ width: '26%' }}>Respuesta incorrecta más elegida</th>
          </tr>
        </thead>
        <tbody>
          {rep.questions.map((q) => {
            const p = questionPct(q)
            const hard = p !== null && p < DIFFICULT_PCT
            return (
              <tr key={q.id} style={hard ? { background: '#FBE9E9', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } : undefined}>
                <td className="text-center">{q.index}</td>
                <td>{q.prompt}</td>
                <td className="text-center font-bold">{p === null ? '—' : `${p} %`}</td>
                <td>{topDistractor(q) ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {difficult.length > 0 && (
        <p className="mt-2 text-[9.5pt]">
          <strong>Preguntas para reforzar en clase</strong> (menos del {DIFFICULT_PCT} % de acierto, resaltadas): {difficult.map((q) => q.index).join(', ')}.
        </p>
      )}

      <footer className="mt-10 flex items-end justify-between text-[9pt]" style={{ color: '#4D4D4D' }}>
        <span>
          Generado con YaguarQuiz UAP el {fmtDateTime(new Date().toISOString())}. La nota (0–100) se calcula solo con los aciertos.
        </span>
        <span className="w-56 border-t border-black pt-1 text-center text-black">
          {teacher}
          <br />
          Docente
        </span>
      </footer>
    </div>
  )
}

function Row({ a, b, c, d }: { a: string; b: string; c: string; d: string }) {
  return (
    <tr>
      <td className="font-bold" style={{ width: '14%', background: '#F2F2F2' }}>
        {a}
      </td>
      <td>{b}</td>
      <td className="font-bold" style={{ width: '13%', background: '#F2F2F2' }}>
        {c}
      </td>
      <td style={{ width: '24%' }}>{d}</td>
    </tr>
  )
}
