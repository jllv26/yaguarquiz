import Papa from 'papaparse'
import readExcelFile from 'read-excel-file/universal'
import writeExcelFile from 'write-excel-file/universal'

type Cell = string | number | boolean | Date | null | { value: unknown; [k: string]: unknown }
export type SheetSpec = { sheet: string; data: Cell[][]; columns?: { width?: number }[]; stickyRowsCount?: number }

const HEADER_STYLE = { fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#1F3864', align: 'center' } as const
const NOTE_STYLE = { textColor: '#4D4D4D', wrap: true } as const

export const headerCell = (value: string) => ({ value, ...HEADER_STYLE })
export const noteCell = (value: string) => ({ value, ...NOTE_STYLE })
export const titleCell = (value: string) => ({ value, fontWeight: 'bold', fontSize: 14, textColor: '#1F3864' })

/** Crea un .xlsx (una o varias hojas) y devuelve el Blob. */
export async function buildWorkbook(sheets: SheetSpec[]): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return writeExcelFile(sheets as any, { fontFamily: 'Calibri', fontSize: 11 }).toBlob()
}

/** Descarga un Blob como archivo. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Lee la primera hoja de un .xlsx o un .csv como matriz de celdas. */
export async function readTable(file: Blob & { name?: string }): Promise<unknown[][]> {
  const name = (file.name ?? '').toLowerCase()
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text()
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false, delimitersToGuess: [',', ';', '\t', '|'] })
    return parsed.data
  }
  if (name.endsWith('.xls')) {
    throw new Error('El formato .xls (Excel 97-2003) no es compatible. Ábrelo en Excel y guárdalo como .xlsx.')
  }
  const buffer = await file.arrayBuffer()
  const sheets = (await readExcelFile(buffer)) as { sheet: string; data: unknown[][] }[]
  // Usa la primera hoja que tenga datos (la plantilla trae una hoja de instrucciones al final)
  const firstWithData = sheets.find((s) => s.data.some((row) => row.some((c) => c !== null && c !== '')))
  return firstWithData?.data ?? []
}
