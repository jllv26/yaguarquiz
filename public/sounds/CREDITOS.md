# Créditos de sonido

YaguarQuiz no usa archivos de audio: toda la música y los efectos se **generan en el navegador**
con la Web Audio API (`src/lib/sound.ts`). Son composiciones propias, sin derechos de terceros.

| Sonido | Cómo se genera |
|---|---|
| Música de sala de espera | Marimba (ondas seno) en escala pentatónica, shaker y tambor de ruido filtrado, 104 BPM |
| Música de pregunta | Bajo en diente de sierra, bombo y hi-hat de ruido filtrado, 128 BPM |
| Cuenta 3-2-1, "¡Ya!", enviado, acierto, error, revelación, subida en ranking | Tonos cortos (triangular / seno) |
| Tic-tac de los últimos 5 s | Golpes cuadrados que se aceleran (1 → 4 por segundo) |
| Redoble, aplausos | Ruido filtrado en ráfagas |
| Fanfarria de podio | Tonos triangulares |
| Rugido del jaguar | Ruido grave con vibración (LFO 28 Hz) y tono que cae |

Ventaja en el laboratorio: no hay nada que descargar y suena igual en todas las PC.
