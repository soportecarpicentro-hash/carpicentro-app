// api/leer-lista.js — CARPICENTRO v23
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
      if (/^l1[:\s]/i.test(l)) { cur.l1 = limpia(l.replace(/^l1[:\s]*/i, '')); continue; }
      if (/^l2[:\s]/i.test(l)) { cur.l2 = limpia(l.replace(/^l2[:\s]*/i, '')); continue; }
      if (/^a1[:\s]/i.test(l)) { cur.a1 = limpia(l.replace(/^a1[:\s]*/i, '')); continue; }
      if (/^a2[:\s]/i.test(l)) { cur.a2 = limpia(l.replace(/^a2[:\s]*/i, '')); continue; }
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
    const c = v => { const x = s(v).toUpperCase().replace(/^-+$/, ''); return (x === 'D' || x === 'G') ? x : ''; };
    const rs = v => { const x = s(v); return /^\d+$/.test(x) && parseInt(x) > 0 ? x : ''; };
    const qty = Math.max(1, parseInt(p.qty) || 1);
    return {
      material: s(p.material) || 'MELA PELIKANO BLANCO',
      qty,
      largo: n(p.largo), ancho: n(p.ancho),
      veta: s(p.veta) || '1-Longitud',
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
• El número MAYOR es siempre el LARGO

CONVERSIÓN DE UNIDADES:
  ✓ Entero ≥ 200 → MM directo (840 → 840)
  ✓ Decimal con punto (57.4) → CM → ×10 → MM (574)
  ✓ Decimal con coma (57,4) → CM → ×10 → MM (574)
  ✓ Entero 40–199 sin decimal ni unidad → probablemente CM → ×10
  ✓ Con "cm" explícito → ×10 | con "mm" explícito → directo
  ✓ Punto de miles (1.304) → 1304 MM
  ✓ Número < 40 sin contexto → probable CM → ×10

VERIFICACIÓN PIEZA A PIEZA (obligatoria):
  □ ¿Largo > Ancho? Si no, intercambiar.
  □ ¿Ambos entre 40 mm y 2800 mm? Si no, revisar conversión.
  □ ¿Había decimal? → confirmar ×10 aplicado.

LÍNEAS TACHADAS → IGNORAR completamente.

VETA:
  ↕ o sin indicación → "1-Longitud" | ↔ → "2-Ancho" | "SV"/"sin veta" → "Sin veta"

━━━ CANTOS — PERFECCIÓN ABSOLUTA ━━━

Solo dos valores posibles: D (delgado) o G (grueso).
Aplica el formato detectado en el análisis previo.

FORMATO A — Trazos/gusanitos sobre las medidas:
  • Trazos ONDULADOS (≈ ∿ ~) = G | Línea RECTA simple (─) = D
  • El símbolo está sobre el LARGO → L1=X L2=X (ambos bordes largos)
  • El símbolo está sobre el ANCHO → A1=X A2=X (ambos bordes cortos)
  • Símbolo sobre ambas medidas → L1 L2 A1 A2 todos con ese canto
  • Símbolo solo sobre LARGO → L1=X L2=X, A1="" A2=""
  • Sin símbolo sobre ANCHO → A1="" A2=""
  • Mezcla: recta sobre largo + onda sobre ancho → L1=D L2=D A1=G A2=G

FORMATO B — Columnas L1/L2/A1/A2:
  • Leer la celda de cada columna: D o G | guión o vacío → ""

FORMATO C — Código de letras al costado:
  • 4 posiciones fijas = L1 L2 A1 A2 (en ese orden)
  • DDDD→todos D | GGGG→todos G | D---→solo L1=D | -D--→solo L2=D
  • DD--→L1=D L2=D | DG--→L1=D L2=G | D-D-→L1=D A1=D
  • 3 letras: DDD→L1=D L2=D A1=D | GGD→L1=G L2=G A1=D
  • 2 letras: DD→L1=D L2=D | GG→L1=G L2=G
  • 1 letra: D→todos D | G→todos G
  • "c/G" "CG" "c/grueso"→todos G | "c/D" "CD" "c/delgado"→todos D
  • "PL" "RL" "S/C" "liso"→sin cantos

FORMATO D — Subrayado:
  • Línea recta bajo la pieza = D | Línea ondulada = G
  • El subrayado aplica a los lados de la dimensión que subraya

FORMATO E — Texto descriptivo:
  • "largo c/grueso" → L1=G L2=G | "ancho c/delgado" → A1=D A2=D
  • "un lado largo" → solo L1=X | "3 lados" → los 3 con canto, el 4to sin

FORMATO F — Sin cantos:
  • Todos los campos L1 L2 A1 A2 = ""

REGLAS DE ORO PARA CANTOS:
  ✗ NUNCA copiar los cantos de la pieza anterior si esta no tiene marca propia
  ✗ NUNCA inventar un canto si el símbolo no es claro
  ✗ NUNCA asumir "todos llevan canto" sin marca explícita
  ✓ Cada pieza tiene sus propios cantos independientes
  ✓ Si el símbolo es ambiguo → ""
  ✓ Mejor vacío que incorrecto

━━━ RANURA ━━━

Buscar: R, RAN, RANURA seguido de números.
Formatos: R18/4/7 | R18-4-7 | R(18)(4)(7)
Orden: libre=distancia al borde / espe=ancho ranura / prof=profundidad
Lado: L, A, L1, L2, A1, A2, ambos, todos.
Si NO hay ranura → omitir línea Ranura.

━━━ PERFORACIÓN ━━━

Buscar: ° ○ "perf" "P°" con número de agujeros.
Formatos: "4° L1" | "3 perf A" | "°°° L" | "P4"
Detalle: posición, diámetro (Ø5mm).
Si NO hay perforación → omitir línea Perf.

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
L1: <D|G|->
L2: <D|G|->
A1: <D|G|->
A2: <D|G|->
Ranura: libre=<n> espe=<n> prof=<n> lado=<lado> det=<texto>
Perf: cant=<n> lado=<lado> det=<texto>
Obs: <vacío o nota si hubo duda>

REGLAS DE SALIDA:
• Omitir líneas Ranura/Perf cuando no existan
• Lee TODAS las piezas de la imagen, sin saltarte ninguna
• Si hubo alguna duda en qty o medidas, anotarlo en Obs de esa pieza`;

  const F2 = `Convierte al JSON del sistema CARPICENTRO.

REGLAS ESTRICTAS:
• "-" o vacío en L1/L2/A1/A2 → "" en JSON
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
