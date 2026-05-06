// api/leer-lista.js — CARPICENTRO v20
// Medidas: CERO ERRORES. Cantos: MÁXIMO ESFUERZO. Ranuras y perforaciones: captura completa.

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
    const tmo = setTimeout(() => ctrl.abort(), 50000);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTok, messages: msgs }),
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
    const c = v => {
      const x = s(v).toUpperCase().replace(/^-+$/, '');
      if (['D', 'G', 'DM', 'GM'].includes(x)) return x;
      return '';
    };
    const rs = v => { const x = s(v); return /^\d+$/.test(x) && parseInt(x) > 0 ? x : ''; };
    return {
      material: s(p.material) || 'MELA PELIKANO BLANCO',
      qty: Math.max(1, parseInt(p.qty) || 1),
      largo: n(p.largo), ancho: n(p.ancho),
      veta: s(p.veta) || '1-Longitud',
      l1: c(p.l1), l2: c(p.l2), a1: c(p.a1), a2: c(p.a2),
      perf_cant: rs(p.perf_cant), perf_lado: s(p.perf_lado), perf_det: s(p.perf_det),
      ran_libre: rs(p.ran_libre), ran_espe: rs(p.ran_espe), ran_prof: rs(p.ran_prof),
      ran_lado: s(p.ran_lado), ran_det: s(p.ran_det),
      obs: s(p.obs),
    };
  }

  // Lista completa de colores del sistema para que la IA los identifique en la imagen
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

  // ══════════════════════════════════════════════════════════════════
  // FASE 1 — Lectura experta: medidas + cantos + ranuras + perforaciones
  // ══════════════════════════════════════════════════════════════════
  const F1 = `Eres el operario jefe de corte de CARPICENTRO, con 20 años leyendo listas de corte de melamina. Tu trabajo es extraer todos los datos de la imagen con precisión absoluta.

PRIORIDADES (todas importantes):
① Medidas (largo/ancho): CERO ERRORES — son el corazón del trabajo
② Cantos (L1/L2/A1/A2): MÁXIMO ESFUERZO — estudia cada símbolo
③ Ranuras y perforaciones: CAPTURA COMPLETA — datos de producción críticos
④ Material y cantidad: EXACTOS — afectan el presupuesto

━━━ PASO 1 — DETECTA EL FORMATO DE CANTOS ━━━

Antes de leer nada, identifica qué formato usa la lista:

FORMATO A — Trazos/gusanitos sobre las medidas (listas manuales):
  • Trazos ONDULADOS (≈ ∿ ~) sobre o bajo un número = canto GRUESO G
  • Línea RECTA simple (─ —) sobre o bajo un número = canto DELGADO D
  • Doble línea recta = DM (doble melamina)
  • El símbolo está SOBRE la medida de LARGO → aplica a L1 y L2
  • El símbolo está SOBRE la medida de ANCHO → aplica a A1 y A2
  • Símbolo sobre AMBAS medidas → cantos en los 4 lados
  • Símbolo solo sobre LARGO y no sobre ANCHO → solo L1=X L2=X, A1="" A2=""
  • Mezcla (recta bajo largo, onda bajo ancho) → L1=D L2=D A1=G A2=G

FORMATO B — Tabla con columnas L1/L2/A1/A2 (listas impresas/Excel):
  • Leer directamente la letra de cada celda: D, G, DM, GM
  • Guión o vacío → sin canto ("")

FORMATO C — Código de letras al costado de cada pieza:
  • 4 letras = L1 L2 A1 A2 en ese orden estricto
  • DDDD=todos D | GGGG=todos G | DD--=L1:D L2:D | D-D-=L1:D A1:D
  • 3 letras: DDD=L1:D L2:D A1:D | GGG=L1:G L2:G A1:G
  • 2 letras: DD=L1:D L2:D | GG=L1:G L2:G
  • "c/G" o "CG" o "c/grueso" o solo "G" = todos los lados = G
  • "c/D" o "CD" o "c/delgado" o solo "D" = todos los lados = D
  • "PL" / "RL" / "S/C" / "liso" = sin cantos (todos vacíos)
  • "DM" solo = L1=DM L2=DM A1=DM A2=DM

FORMATO D — Subrayado:
  • Una línea recta bajo la pieza = D en esos lados
  • Doble línea = DM | Ondulado = G

FORMATO E — Texto descriptivo:
  • "largo c/grueso" → L1=G L2=G | "ancho c/delgado" → A1=D A2=D
  • "un lado largo grueso" → L1=G (solo uno)
  • "3 lados" → los 3 lados con canto, el 4to sin

━━━ PASO 2 — MEDIDAS: CERO ERRORES ━━━

CANTIDAD (qty):
• Número al inicio de línea, en círculo ○, con punto •, "N pzs", "N de", "N →"
• Si hay ambigüedad: qty=1

LARGO y ANCHO:
• Separados por: x · × · X · / · "por"
• El número MAYOR es siempre el LARGO

CONVERSIÓN DE UNIDADES — APLICAR ANTES DE ESCRIBIR:
  ✓ Entero ≥ 200: ya es MM → copiar directo (840 → 840)
  ✓ Decimal con PUNTO (57.4): es CM → ×10 → MM (57.4 → 574)
  ✓ Decimal con COMA (57,4): es CM → ×10 → MM (57,4 → 574)
  ✓ Entero < 200 sin decimal y sin unidad: probablemente CM → ×10
  ✓ Punto separador de miles (1.304): es 1304 MM → usar directo
  ✓ Unidad "cm" explícita → ×10 | unidad "mm" explícita → directo
  ✓ Números con 1 decimal como 85.0 o 60.5: SON CM → ×10 (850, 605)

VERIFICACIÓN OBLIGATORIA POR PIEZA:
  □ ¿El número mayor es el largo? Si no, intercambiar.
  □ ¿Ambos valores entre 40 y 2800? Si no, revisar la conversión.
  □ ¿Había decimal? → confirmar que se multiplicó ×10.
  □ ¿La proporción es razonable para melamina? (largo ÷ ancho generalmente entre 1 y 6)

IGNORA COMPLETAMENTE: líneas tachadas (con raya horizontal encima)

VETA:
• Flecha vertical ↕ o sin indicación → "1-Longitud"
• Flecha horizontal ↔ o "T" rotada → "2-Ancho"
• "SV" / "sin veta" → "Sin veta"

━━━ PASO 3 — CANTOS: MÁXIMO ESFUERZO ━━━

Aplica el formato detectado en el Paso 1.
Estudia cada símbolo gráfico con atención — pueden ser muy pequeños.

REGLAS GENERALES:
• L1 y L2 son los dos bordes del lado LARGO de la pieza
• A1 y A2 son los dos bordes del lado ANCHO (corto)
• Si ves un canto igual en L1 y L2, escríbelo en ambos
• Si solo hay canto en un lado → el otro queda ""
• Si ves el mismo símbolo en todos los lados → copiar en L1 L2 A1 A2
• DM = canto de melamina doble (dos capas) — más grueso que D
• GM = canto grueso de melamina
• SI NO PUEDES DETERMINAR CON CERTEZA → dejar "" (JAMÁS inventar)

━━━ PASO 4 — RANURA: CAPTURA COMPLETA ━━━

Buscar: "R", "RAN", "RANURA", "Rura" seguido de números o separadores
Formatos habituales:
• R18/4/7 → libre=18, espe=4, prof=7
• R 18-4-7 → libre=18, espe=4, prof=7
• R(18)(4)(7) → libre=18, espe=4, prof=7
• Solo "R18" → puede ser libre=18, espe y prof pueden estar en contexto
Orden SIEMPRE: libre (distancia al borde) / espe (ancho ranura) / prof (profundidad)
Lado: L=largo, A=ancho, L1/L2/A1/A2, "ambos lados L", "todos"
Detalle extra: posición especial, centrada, etc.
Si NO hay ranura → omitir completamente la línea "Ranura:".

━━━ PASO 5 — PERFORACIÓN: CAPTURA COMPLETA ━━━

Buscar: círculos ○, puntos °, "perf", "P°", número de agujeros
Formatos habituales:
• °° junto a largo → cant=2, lado=L
• "4° L1" → cant=4, lado=L1
• "3 perf A" → cant=3, lado=A
• "P4" o "4P" → cant=4
• Diámetro: "Ø5" o "5mm" → va en det
Detalle: posición, diámetro, distribución
Si NO hay perforación → omitir completamente la línea "Perf:".

━━━ PASO 6 — MATERIAL ━━━

Si hay encabezado de material antes de un grupo de piezas, capturarlo completo.
Colores disponibles (usar nombre exacto si lo reconoces en la imagen):
${COLORES_CANTO}
Si el material cambia → nueva línea "Material: <nombre completo>" antes del siguiente bloque.
Si no se indica: usar "MELA PELIKANO BLANCO"

━━━ FORMATO DE SALIDA (un bloque por pieza) ━━━

Material: <nombre completo>
Cant: <número>
largo(veta): <mm entero>
ancho: <mm entero>
L1: <D|G|DM|GM|->
L2: <D|G|DM|GM|->
A1: <D|G|DM|GM|->
A2: <D|G|DM|GM|->
Ranura: libre=<n> espe=<n> prof=<n> lado=<lado> det=<texto>
Perf: cant=<n> lado=<lado> det=<texto>
Obs: <observación o vacío>

REGLAS DE SALIDA:
• Omitir líneas Ranura/Perf si no existen en esa pieza
• Lee ABSOLUTAMENTE TODAS las piezas visibles (no omitir ninguna)
• Ignora líneas tachadas
• Si hay dudas en medidas → anotar en Obs
• Si hay dudas en cantos → dejar "" (no inventar)`;

  // ══════════════════════════════════════════════════════════════════
  // FASE 2 — Conversión a JSON limpio
  // ══════════════════════════════════════════════════════════════════
  const F2 = `Convierte la lectura al JSON del sistema CARPICENTRO.

REGLAS:
• "-" o vacío en L1/L2/A1/A2 → "" en JSON
• Medidas decimales → si no se convirtieron a MM, hacerlo ahora (×10)
• perf_cant, ran_libre, ran_espe, ran_prof → números enteros como string ("4", "18")
• Si no hay ranura → ran_libre/espe/prof/lado/det = ""
• Si no hay perforación → perf_cant/lado/det = ""

RESPONDE SOLO CON EL JSON (sin markdown, sin texto adicional):
{"piezas":[{
  "material":"string",
  "qty":1,
  "largo":0,
  "ancho":0,
  "veta":"1-Longitud",
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
        ], 5000);
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
