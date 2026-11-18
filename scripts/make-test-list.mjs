import writeExcelFile from 'write-excel-file/node'
const S = ['Pérez','Mamani','Quispe','Rojas','Vaca','Suárez','Cuéllar','Áñez','Roca','Melgar','Justiniano','Antelo']
const N = ['Ana Lucía','Carlos','María José','Luis Fernando','Daniela','Jorge','Sofía','Miguel Ángel','Valeria','Diego','Camila','Rodrigo']
const head = ['codigo_universitario','ci','apellidos','nombres','correo','carrera'].map(v => ({ value: v, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#1F3864' }))
const rows = [head]
for (let i = 1; i <= 40; i++) rows.push([
  `2024-${String(i).padStart(4,'0')}`, String(7000000 + i * 37), `${S[i % 12]} ${S[(i + 5) % 12]}`,
  i === 7 ? null : N[i % 12], i === 20 ? 'correo-malo@' : `estudiante${i}@gmail.com`, 'Turismo Sostenible'])
await writeExcelFile(rows, { columns: [{width:20},{width:12},{width:26},{width:22},{width:28},{width:22}] }).toFile(process.argv[2])
