// Genera preguntas_prueba_30.xlsx: 30 preguntas (5 de cada tipo MVP) que usan imágenes del ZIP de prueba.
import writeExcelFile from 'write-excel-file/node'
const H = ['tipo','pregunta','imagen','opcion_1','opcion_2','opcion_3','opcion_4','opcion_5','opcion_6','correcta','tiempo_seg','puntos','explicacion','dificultad','etiquetas']
  .map(v => ({ value: v, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#1F3864' }))
const rows = [H]
const caps = [['Pando','Cobija','Riberalta','Trinidad','Guayaramerín'],['Beni','Trinidad','Cobija','Riberalta','Rurrenabaque'],['La Paz','La Paz','El Alto','Oruro','Viacha'],['Santa Cruz','Santa Cruz de la Sierra','Montero','Warnes','Cotoca'],['Tarija','Tarija','Yacuiba','Bermejo','Villamontes']]
const sc = [['Excel','Word','Google Sheets','PowerPoint'],['LibreOffice Calc','Paint','Numbers','Notepad'],['Zoho Sheet','Gmail','Excel','Chrome'],['Google Sheets','Canva','Calc','TikTok'],['Numbers','Excel','WhatsApp','Teams']]
const scOk = ['1,3','1,3','1,3','1,3','1,2']
const vf = [['Cobija está en el departamento de Pando.','V'],['La castaña crece en el altiplano.','F'],['Un byte tiene 8 bits.','V'],['HTML es un lenguaje de programación de bases de datos.','F'],['Ctrl+C copia el texto seleccionado.','V']]
const st = [['¿Capital de Pando?','Cobija'],['¿Qué fruto amazónico exporta Pando?','castaña|almendra|nuez de brasil'],['¿Atajo para pegar en Windows?','Ctrl+V|control v'],['¿Qué significa la U de UAP?','Universidad'],['¿Río que separa Cobija de Brasil?','Acre|río Acre']]
const ord = [['Ordena de menor a mayor','KB','MB','GB','TB'],['Pasos para guardar como PDF','Abrir archivo','Archivo > Guardar como','Elegir PDF','Guardar'],['Ordena de norte a sur','Pando','La Paz','Oruro','Potosí'],['Ciclo de un correo','Redactar','Adjuntar','Revisar','Enviar'],['Ordena por año','1938 Pando departamento','1993 fundación UAP','2006','2026']]
for (let i = 0; i < 5; i++) {
  const c = caps[i]
  rows.push(['single', `¿Cuál es la capital de ${c[0]}?`, i === 0 ? 'mapa_pando.png' : null, c[1], c[2], c[3], c[4], null, null, 1, 20, 1000, `${c[1]} es la capital de ${c[0]}.`, 'fácil', 'bolivia, geografía'])
  rows.push(['multiple', '¿Cuáles son hojas de cálculo?', null, ...sc[i], null, null, scOk[i], 30, 2000, null, 'media', 'ofimática'])
  rows.push(['true_false', vf[i][0], null, null, null, null, null, null, null, vf[i][1], 10, 1000, null, null, 'vf'])
  rows.push(['short_text', st[i][0], null, null, null, null, null, null, null, st[i][1], 30, 1000, null, 'difícil', null])
  rows.push(['ordering', ord[i][0], null, ...ord[i].slice(1), null, null, null, 45, 1000, null, 'media', null])
  rows.push(['image_choice', '¿Cuál de estas figuras es un TRIÁNGULO?', null, 'circulo.png', 'triangulo.png', 'cuadrado.png', 'rombo.png', null, null, 2, 20, 1000, 'El triángulo tiene 3 lados.', 'fácil', 'figuras'])
}
await writeExcelFile(rows, { columns: [{width:14},{width:48},{width:16},...Array(6).fill({width:22}),{width:20},{width:11},{width:9},{width:34},{width:11},{width:20}], stickyRowsCount: 1 }).toFile(process.argv[2])
