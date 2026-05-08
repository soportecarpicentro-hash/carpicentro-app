// api/leer-lista.js — CARPICENTRO v24
// Prioridad absoluta: CANTIDADES sin fallo. Cantos: perfección. Medidas: cero errores.
// v23: Opus 4.7 + pre-escaneo de cantidades + resolución 1800px

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { imagen_b64, media_type } = req.body || {};
  if (!imagen_b64) return res.status(400).json({ error: 'Se requiere imagen_b64' });
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });
  const mt = media_type || 'image/jpeg';

  async function callAnthropic(msgs, maxTok = 8192) {
    const ctrl = new AbortController();
    const tmo = setTimeout(() => ctrl.abort(), 55000);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: maxTok, messages: msgs }),
        signal: ctrl.signal,
      });
      clearTimeout(tmo);
      const raw = await resp.text();
      let data;
      try { data = JSON.parse(raw); } catch (_) { throw new Error('API no-JSON: ' + raw.slice(0, 100)); }
      if (!resp.ok) throw new Error(`API ${resp.status}: ${data.error?.message || raw.slice(0, 100)}`);
      return (data.content || []).map(c => c.text || '').join('');
    } catch (e) { clearTimeout(tmo); if (e.name === 'AbortError') throw new Error('Timeout >50s'); throw e; }
  }

  function extraerJSON(txt) {
    if (!txt) return null;
    const c = txt.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const a = c.indexOf('{'), z = c.lastIndexOf('}');
    if (a < 0 || z <= a) return null;
    const js = c.slice(a, z + 1);
    try { const p = JSON.parse(js); if (p?.piezas?.length) return p; } catch (_) {}
    for (const r of [
      js.slice(0, js.lastIndexOf('},') + 1) + ']}',
      js.slice(0, js.lastIndexOf('}') + 1) + ']}',
    ]) { try { const p = JSON.parse(r); if (p?.piezas?.length) return p; } catch (_) {} }
    return null;
  }

  function parsearTexto(txt) {
    const piezas = [];
    const lineas = txt.split('\n').map(l => l.trim()).filter(Boolean);
    let material = 'MELA PELIKANO BLANCO';
    let cur = null;
    const flush = () => {
      if (cur && (cur.largo || cur.ancho || cur.qty > 1)) piezas.push({ ...cur });
      cur = null;
    };
    const limpia = v => { v = String(v || '').trim(); return ['', '-', '–', '—', '--'].includes(v) ? '' : v; };
    const num = v => Math.round(parseFloat(String(v || '').replace(',', '.')) || 0);

    for (const l of lineas) {
      if (/^material[:\s]/i.test(l)) {
        flush();
        material = l.replace(/^material[:\s]*/i, '').trim() || material;
        continue;
      }
      if (/^cant[:\s]/i.test(l)) {
        flush();
        cur = {
          material, qty: parseInt(l.replace(/^cant[:\s]*/i, '')) || 1,
          largo: 0, ancho: 0, veta: '1-Longitud',
          l1: '', l2: '', a1: '', a2: '',
          perf_cant: '', perf_lado: '', perf_det: '',
          ran_libre: '', ran_espe: '', ran_prof: '', ran_lado: '', ran_det: '',
          obs: '',
        };
        continue;
      }
      if (!cur) continue;
      if (/^largo[^:]*:/i.test(l)) { cur.largo = num(l.replace(/^largo[^:]*:/i, '')); continue; }
      if (/^ancho[^:]*:/i.test(l)) { cur.ancho = num(l.replace(/^ancho[^:]*:/i, '')); continue; }
      if (/\b(?:l[12]|a[12])\s*[:=\s]/i.test(l)) {
        ['l1','l2','a1','a2'].forEach(k => {
          const m = l.match(new RegExp('\\b' + k + '\\s*[:=\\s]+([^\\s,;:]+)', 'i'));
          if (m) cur[k] = limpia(m[1]);
        });
        continue;
      }
      if (/^veta[:\s]/i.test(l)) { cur.veta = limpia(l.replace(/^veta[:\s]*/i, '')) || '1-Longitud'; continue; }
      if (/^ranura[:\s]/i.test(l)) {
        const r = l.replace(/^ranura[:\s]*/i, '');
        const lm = r.match(/libre[=:\s]*(\d+)/i); if (lm) cur.ran_libre = lm[1];
        const em = r.match(/espe[=:\s]*(\d+)/i); if (em) cur.ran_espe = em[1];
        const pm = r.match(/prof[=:\s]*(\d+)/i); if (pm) cur.ran_prof = pm[1];
        const ldm = r.match(/lado[=:\s]*(\S+)/i); if (ldm) cur.ran_lado = ldm[1];
        const dm = r.match(/det[=:\s]*(.+)/i); if (dm) cur.ran_det = dm[1].trim();
        continue;
      }
      if (/^perf[:\s]/i.test(l)) {
        const r = l.replace(/^perf[:\s]*/i, '');
        const cm = r.match(/cant[=:\s]*(\d+)/i); if (cm) cur.perf_cant = cm[1];
        const ldm = r.match(/lado[=:\s]*(\S+)/i); if (ldm) cur.perf_lado = ldm[1];
        const dm = r.match(/det[=:\s]*(.+)/i); if (dm) cur.perf_det = dm[1].trim();
        continue;
      }
      if (/^obs[:\s]/i.test(l)) { cur.obs = l.replace(/^obs[:\s]*/i, '').trim(); continue; }
    }
    flush();
    return piezas.length ? { piezas } : null;
  }

  function norm(p) {
    const s = v => String(v ?? '').trim();
    const n = v => Math.round(parseFloat(String(v ?? '').replace(',', '.')) || 0);
    const c = v => {
      const raw = s(v).toUpperCase().replace(/^[-–—\s]+$/, '');
      if (!raw) return '';
      const first = raw.split(/[\s(,/]/)[0];
      if (first === 'D') return 'D';
      if (first === 'G' || first === 'X') return 'G';
      if (/^DEL|^FIN|^DELG|^FINO/i.test(raw)) return 'D';
      if (/^GRU|^GRUE|^GORDO/i.test(raw)) return 'G';
      return '';
    };
    const rs = v => { const x = s(v); return /^\d+$/.test(x) && parseInt(x) > 0 ? x : ''; };
    const qty = Math.max(1, parseInt(p.qty) || 1);
    const material = s(p.material) || 'MELA PELIKANO BLANCO';
    const esMadera = /NOGAL|CEREZO|HAYA|WENGUE|ROBLE|ABEDUL|ACACIA|ARCE|BOSCO|BOSQUE|BARDOLINO|BELLOTA|ANTALYA|ARTIKO|ARUPO|AMARETO|MADERA|PAMELA|CASTAÑO|TEKA|PINO|CEDRO|EUCALIPTO/i.test(material);
    const veta = esMadera ? '1-Longitud' : 'Sin veta';
    return {
      material,
      qty,
      largo: n(p.largo), ancho: n(p.ancho),
      veta,
      l1: c(p.l1), l2: c(p.l2), a1: c(p.a1), a2: c(p.a2),
      perf_cant: rs(p.perf_cant), perf_lado: s(p.perf_lado), perf_det: s(p.perf_det),
      ran_libre: rs(p.ran_libre), ran_espe: rs(p.ran_espe), ran_prof: rs(p.ran_prof),
      ran_lado: s(p.ran_lado), ran_det: s(p.ran_det),
      obs: s(p.obs),
    };
  }

  const COLORES_CANTO = [
    'BLANCO','CARAMELO','PAMELA','ONIX','CAPRI','MADERA','TRIGO','CENIZA',
    'NOGAL OSCURO','WENGUE','GRIS PERLA','ARENA','NEGRO','ROBLE GRIS','HAYA',
    'CEREZO','ALMENDRA','NOGAL','GRAFITO','CARBON','ABEDUL','ACACIA','AGAVE',
    'ALUMINIO','AMARETO','AMARETTO','AMARILLO','AMBAR','ANTALYA','ANTRACITA',
    'ARCE','ARTIKO','ARUPO','AVELLANA','AZUL ACERO','AZUL COBALTO','AZUL CORAL',
    'AZUL MARINO','BARDOLINO','BELLOTA','BLANCO HIGH GLOSS','BOSCO','BOSQUE',
    'BURDEOS','CACAO','CARAMEL',
  ].join(', ');

  const img = { type: 'image', source: { type: 'base64', media_type: mt, data: imagen_b64 } };

  const F1 = `Eres el operario jefe de corte de CARPICENTRO con 20 años de experiencia. Lees listas de corte de melamina con precisión absoluta. Un error en la CANTIDAD de piezas arruina la producción completa.

━━━ ANÁLISIS PREVIO (hacer ANTES de leer pieza por pieza) ━━━

Observa la imagen completa y responde estas preguntas internamente:

① ¿CÓMO SE INDICA LA CANTIDAD en este documento?
   Opción A: número pequeño ANTES del × (ej: "3 × 840 × 420")
   Opción B: número en CÍRCULO o entre paréntesis junto a la pieza (ej: ③ o (3))
   Opción C: columna separada "Cant" / "N" / "Pzs" a la izquierda
   Opción D: número DESPUÉS de las medidas (ej: "840×420 ×3" o "840×420 /3")
   Opción E: número en línea aparte encima o debajo de las medidas
   Opción F: NO se indica cantidad → todas son qty=1
   ⚠ IMPORTANTE: Si ves números 1,2,3,4... consecutivos al margen, son NÚMEROS DE FILA, no cantidades

② ¿CÓMO SE INDICAN LOS CANTOS?
   Formato A: trazos/ondas dibujados sobre las medidas
   Formato B: columnas L1/L2/A1/A2 con letras D o G
   Formato C: código de letras al costado (DDDD, GG--, etc.)
   Formato D: subrayado bajo la pieza
   Formato E: texto descriptivo (c/grueso, c/delgado, etc.)
   Formato F: no hay cantos indicados en la lista

③ ¿EN QUÉ UNIDADES ESTÁN LAS MEDIDAS?
   MM: números ≥ 200 sin decimal (420, 840, 1830)
   CM: números con decimal (57.4, 116.9) o enteros pequeños (84, 42)

━━━ PRE-ESCANEO GLOBAL (obligatorio antes de leer fila a fila) ━━━

Ahora recorre toda la imagen de arriba a abajo y anota:
• Total de piezas/filas visibles: <N>
• Secuencia de cantidades detectadas: <q1, q2, q3, ...> (una por cada pieza, en orden)

Este pre-escaneo es tu referencia. Al leer fila a fila confirmarás que coincide.
Si una cantidad no coincide con tu pre-escaneo → revisarla antes de escribirla.

⚠ TÓMATE EL TIEMPO NECESARIO: escanea la imagen DOS VECES. Primero de corrido para contar piezas y cantidades. Luego pieza por pieza para verificar medidas y cantos. Más vale lento y correcto que rápido e incorrecto. Duplicados de medidas y cantidades erróneas son el peor error.

━━━ CANTIDADES — ERROR AQUÍ = PEDIDO INCORRECTO = PÉRDIDA TOTAL ━━━

La cantidad es el número de piezas idénticas. Sigue este proceso EXACTO:

PASO A — Localiza la cantidad usando el método identificado en el análisis previo.

PASO B — Valida que sea una cantidad real:
  ✓ La cantidad es SIEMPRE un entero entre 1 y 99
  ✓ Un número ≥ 100 NUNCA es una cantidad — es una medida
  ✓ Decimales NUNCA son cantidades — son medidas en CM
  ✓ Si no hay cantidad explícita → qty = 1
  ✓ Si hay duda entre cantidad y número de fila → analizar si se repite el mismo número en varias filas (sí = cantidad) o si los números son únicos y consecutivos (no = número de fila, qty=1)

PASO C — Ejemplos de lectura correcta:
  "3 × 840 × 420"       → qty=3, largo=840, ancho=420  ✓
  "③ 840×420"           → qty=3, largo=840, ancho=420  ✓
  "(5) 1200×600"        → qty=5, largo=1200, ancho=600 ✓
  "840×420"             → qty=1, largo=840, ancho=420  ✓
  "840×420×3"           → qty=3, largo=840, ancho=420  ✓
  "300×840"             → qty=1, largo=300, ancho=840   ✓ (el cliente lo escribió así — respetar orden)
  "1. 840×420 DDDD"     → si "1." es número de fila: qty=1, largo=840, ancho=420  ✓
  "2 pzs 600×400"       → qty=2, largo=600, ancho=400  ✓
  "10 → 1830×60"        → qty=10, largo=1830, ancho=60 ✓

PASO D — Errores fatales a evitar:
  ✗ NUNCA leer la medida como cantidad
  ✗ NUNCA leer el número de fila como cantidad
  ✗ NUNCA inventar una cantidad que no está escrita
  ✗ NUNCA omitir una cantidad que sí está escrita

━━━ MEDIDAS — CERO ERRORES ━━━

LARGO y ANCHO (separados por x, ×, X, /, "por"):
• El PRIMER número escrito es LARGO, el SEGUNDO es ANCHO — respetar SIEMPRE el orden del documento
• NUNCA invertir largo y ancho aunque el largo sea menor que el ancho

CONVERSIÓN DE UNIDADES — UNA SOLA REGLA:
  ✓ Número CON decimal (punto o coma) → CM → ×10 → MM   (57.4→574  84,5→845  78,1→781)
  ✓ Número entero SIN decimal → MM DIRECTO, sin importar si es pequeño  (40→40  60→60  840→840)
  ✓ Con "cm" explícito → ×10 siempre | con "mm" explícito → directo siempre
  ✓ Punto de miles (1.304) → 1304 MM directo
  ✗ NUNCA multiplicar ×10 un entero aunque sea pequeño — si no tiene decimal, ya está en MM

VERIFICACIÓN PIEZA A PIEZA (obligatoria):
  □ ¿El número tenía decimal (punto/coma)? → confirmar ×10 aplicado. ¿Era entero? → dejar exacto.
  □ ¿Respetaste el orden original del documento (primer número = largo, segundo = ancho)?

LÍNEAS TACHADAS → IGNORAR completamente.

VETA — REGLA POR TIPO DE MATERIAL:
• Materiales tipo MADERA (contienen en su nombre: NOGAL, CEREZO, HAYA, WENGUE, ROBLE, ABEDUL, ACACIA, ARCE, BOSCO, BOSQUE, BARDOLINO, BELLOTA, ANTALYA, ARTIKO, ARUPO, AMARETO, MADERA, PAMELA, CASTAÑO, TEKA, PINO, CEDRO, EUCALIPTO): veta = "1-Longitud" siempre
• Materiales ENTEROS/LISOS (BLANCO, NEGRO, GRAFITO, GRIS, CARBON, ARENA, TRIGO, ALMENDRA, CAPRI, ONIX, CENIZA, HUESO, CREMA y similares colores planos): veta = "Sin veta" siempre
• Si hay marca ↕ = "1-Longitud" | ↔ = "2-Ancho" | "SV"/"sin veta" explícito = "Sin veta"

━━━ CANTOS ━━━

Dos valores válidos: D (delgado/fino) o G (grueso/gordo). Guión - = sin canto.
⚠ OBLIGATORIO: escribe SIEMPRE las 4 líneas L1: L2: A1: A2: para cada pieza (usa - si no hay).

IDENTIFICACIÓN RÁPIDA DE D vs G:
  D (delgado)  ← letra D, guión recto "─", subrayado "_", línea recta sobre/bajo la medida, "/" o "\"
  G (grueso)   ← letra G, letra X, línea ondulada "∿" o "~", zigzag, línea que parece un gusano/wave
  Sin canto    ← guión "-", vacío, punto, cero, "S/C", "SC", "PL", "liso", "sin canto"

FORMATO A — Trazos/marcas DIBUJADOS sobre o junto a los números de medida:
  • Trazo RECTO (─ — _ / \) = D | Trazo ONDULADO (∿ ~ ≈ zigzag, gusano, wave) = G | X junto a medida = G
  • La marca está SOBRE/BAJO el número LARGO → L1=X L2=X
  • La marca está SOBRE/BAJO el número ANCHO → A1=X A2=X
  • Marca sobre AMBOS números → L1=X L2=X A1=X A2=X
  • Pequeño guión o tick al lado del número = D
  • Sin marca sobre ese número → - en esos lados
  EJEMPLO: "─840─ × 420" → L1=D L2=D A1=- A2=-
  EJEMPLO: "840 × ∿420∿" → L1=- L2=- A1=G A2=G
  EJEMPLO: "_840_ × ~420~" → L1=D L2=D A1=G A2=G
  EJEMPLO: "840×420 X" (X junto a la pieza) → L1=G L2=G A1=G A2=G

FORMATO B — Columnas L1/L2/A1/A2 en tabla:
  • Leer la celda: D o d→D | G o g o X o x→G | vacío/guión/punto/0→-
  • Columna única "CANTO" con "D" → L1=D L2=D A1=D A2=D
  • Columna única "CANTO" con "G" o "X" → L1=G L2=G A1=G A2=G
  • Columna única con código multi-letra → ver FORMATO C

FORMATO C — Código de letras junto/después de las medidas:
  • 4 posiciones = L1 L2 A1 A2 (siempre en ese orden)
  • DDDD→todos D | GGGG→todos G | XXXX→todos G | DDGG→L1=D L2=D A1=G A2=G
  • D---→L1=D | -D--→L2=D | --D-→A1=D | ---D→A2=D
  • DD--→L1=D L2=D | -DD-→L2=D A1=D | GG--→L1=G L2=G
  • 3 letras DDD→L1=D L2=D A1=D | 2 letras DD→L1=D L2=D | GG→L1=G L2=G
  • 1 letra sola: D→todos D | G→todos G | X→todos G
  • "c/D" "c/d" "CD" "c/delgado" "canto delgado" "fino" → todos D
  • "c/G" "c/g" "CG" "c/grueso" "canto grueso" "grueso" → todos G
  • "S/C" "s/c" "SC" "PL" "sin canto" "liso" → todos -

FORMATO D — Subrayado / sobrerayado dibujado:
  • Línea RECTA bajo/sobre la medida = D | Línea ONDULADA o en zigzag = G
  • Aplica a los lados de la dimensión marcada (si subraya el largo → L1=X L2=X)

FORMATO E — Texto descriptivo libre:
  • "todos c/D" "4 lados D" "4D" → L1=D L2=D A1=D A2=D
  • "largo c/G" "2 largos G" "L:G" → L1=G L2=G
  • "ancho c/D" "A:D" → A1=D A2=D
  • "3 lados D" "3D" → L1=D L2=D A1=D A2=-
  • "2 lados G" → L1=G L2=G A1=- A2=-

REGLAS DEFINITIVAS:
  ✓ Si ves CUALQUIER marca de canto → léela y escríbela. NUNCA la omitas.
  ✓ D y _ y línea recta y "/" = SIEMPRE delgado
  ✓ G y X y línea ondulada y gusano y zigzag = SIEMPRE grueso
  ✓ Ambiguo entre D y G → usa D (es el más común en Perú)
  ✓ SIEMPRE escribe L1: L2: A1: A2: para cada pieza, aunque sean todos -
  ✗ Pon - solo cuando NO existe ninguna marca visible para ese lado
  ✗ No copies cantos de la pieza anterior si esta no tiene marca propia

━━━ RANURA ━━━

Buscar: R, RAN, RANURA, o símbolo de canal/muesca seguido de números.
Formatos reconocidos:
  R18/4/7       → libre=18 espe=4 prof=7
  R18-4-7       → libre=18 espe=4 prof=7
  R(18)(4)(7)   → libre=18 espe=4 prof=7
  18/4/7 L      → libre=18 espe=4 prof=7 lado=L
  RAN 18 4 7 A2 → libre=18 espe=4 prof=7 lado=A2
Orden SIEMPRE: libre (distancia al borde) / espesor (ancho del canal) / profundidad
Lado: L=largo, A=ancho, L1, L2, A1, A2, ambos, todos.
Si NO hay ranura → omitir línea Ranura completamente.

━━━ PERFORACIÓN ━━━

Buscar: ° ○ • punto con número, "perf", "perf.", "P°", "perforaciones", círculos dibujados.
Formatos reconocidos:
  4° L1         → cant=4 lado=L1
  3 perf A      → cant=3 lado=A
  °°° L         → contar círculos (3) lado=L
  P4            → cant=4
  Ø5 x4 L      → cant=4 lado=L (diámetro 5mm)
  (4) perf L2   → cant=4 lado=L2
Detalle: incluir posición y diámetro si se indica.
Si NO hay perforación → omitir línea Perf completamente.

━━━ MATERIAL ━━━

Capturar el encabezado de material completo con su color.
Colores del sistema: ${COLORES_CANTO}
Si cambia → "Material: <nombre>" antes del nuevo bloque.
Default: MELA PELIKANO BLANCO

━━━ FORMATO DE SALIDA — UN BLOQUE POR PIEZA ━━━

Material: <nombre>
Cant: <entero 1-99>
largo(veta): <mm entero>
ancho: <mm entero>
L1: <D|G|-> ← OBLIGATORIO siempre
L2: <D|G|-> ← OBLIGATORIO siempre
A1: <D|G|-> ← OBLIGATORIO siempre
A2: <D|G|-> ← OBLIGATORIO siempre
Ranura: libre=<n> espe=<n> prof=<n> lado=<lado> det=<texto>
Perf: cant=<n> lado=<lado> det=<texto>
Obs: <vacío o nota si hubo duda>

REGLAS DE SALIDA:
• L1/L2/A1/A2 son OBLIGATORIAS en cada pieza — nunca las omitas
• Omitir líneas Ranura/Perf solo cuando no existan
• Lee TODAS las piezas de la imagen, sin saltarte ninguna
• Si hubo alguna duda en qty o medidas, anotarlo en Obs de esa pieza`;

  const F2 = `Convierte al JSON del sistema CARPICENTRO.

REGLAS ESTRICTAS:
• L1/L2/A1/A2 — copiar exactamente del texto: "D"→"D" | "G"→"G" | guión/vacío→"" — NUNCA dejar vacío si el texto dice D o G
• Medidas decimales: si no están en MM, multiplicar ×10 ahora
• qty: entero ≥ 1 (si dice 0 o negativo → 1)
• ran_libre/espe/prof y perf_cant → enteros positivos como string ("4", "18") o ""
• Si no hay ranura → todos los ran_* = ""
• Si no hay perforación → todos los perf_* = ""

RESPONDE SOLO CON EL JSON (sin markdown):
{"piezas":[{
  "material":"string","qty":1,"largo":0,"ancho":0,"veta":"1-Longitud",
  "l1":"","l2":"","a1":"","a2":"",
  "perf_cant":"","perf_lado":"","perf_det":"",
  "ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"",
  "obs":""
}]}`;

  let lastError = '';
  for (let i = 1; i <= 3; i++) {
    try {
      let resultado;
      if (i <= 2) {
        const textoOperario = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] }
        ], 6000);
        const parseado = parsearTexto(textoOperario);
        if (parseado?.piezas?.length) {
          return res.status(200).json({ piezas: parseado.piezas.map(norm), _intentos: i, _via: 'parser' });
        }
        resultado = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] },
          { role: 'assistant', content: textoOperario },
          { role: 'user', content: F2 }
        ], 8192);
      } else {
        resultado = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 + '\n\n' + F2 }] }
        ], 5000);
      }
      const parsed = extraerJSON(resultado);
      if (parsed?.piezas?.length) {
        return res.status(200).json({ piezas: parsed.piezas.map(norm), _intentos: i });
      }
      lastError = `Intento ${i}: sin piezas. "${resultado?.slice(0, 120)}"`;
    } catch (e) {
      lastError = `Intento ${i}: ${e.message}`;
      if (i < 3) await new Promise(r => setTimeout(r, i * 3000));
    }
  }
  return res.status(422).json({ error: 'No se pudo leer. ' + lastError });
}
