// api/leer-lista.js — CARPICENTRO v15
// Fase 1: operario experto genera texto plano
// Fase 2: convertir ese texto al JSON del sistema

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
    ]) {
      try { const p = JSON.parse(r); if (p?.piezas?.length) return p; } catch (_) {}
    }
    return null;
  }

  // Parsear texto plano del operario a objetos
  function parsearTextoOperario(txt) {
    const piezas = [];
    const bloques = txt.split(/(?=Material:|material:)/i).filter(b => b.trim());

    // Si no hay bloques por Material, intentar parsear líneas directamente
    const lineas = txt.split('\n').map(l => l.trim()).filter(Boolean);
    let material = 'MELA PELIKANO BLANCO';
    let actual = null;

    const flush = () => { if (actual && actual.largo && actual.ancho) { piezas.push({ ...actual }); } actual = null; };
    const val = (v) => {
      v = String(v || '').trim().replace(/^[-–—]+$/, '').trim();
      return ['', '-', '–', '—'].includes(v) ? '' : v;
    };
    const num = (v) => Math.round(parseFloat(String(v || '').replace(',', '.')) || 0);

    for (const linea of lineas) {
      const lc = linea.toLowerCase();
      if (/^material[:\s]/i.test(linea)) {
        flush();
        material = linea.replace(/^material[:\s]*/i, '').trim() || material;
        continue;
      }
      if (/^cant[:\s]/i.test(linea)) {
        flush();
        actual = { material, qty: parseInt(linea.replace(/^cant[:\s]*/i, '')) || 1, largo: 0, ancho: 0, veta: '1-Longitud', l1: '', l2: '', a1: '', a2: '', perf_cant: '', perf_lado: '', perf_det: '', ran_libre: '', ran_espe: '', ran_prof: '', ran_lado: '', ran_det: '', obs: '' };
        continue;
      }
      if (!actual) continue;
      if (/^largo[^:]*:/i.test(linea)) { actual.largo = num(linea.replace(/^largo[^:]*:/i, '')); continue; }
      if (/^ancho[^:]*:/i.test(linea)) { actual.ancho = num(linea.replace(/^ancho[^:]*:/i, '')); continue; }
      if (/^l1[:\s]/i.test(linea)) { actual.l1 = val(linea.replace(/^l1[:\s]*/i, '')); continue; }
      if (/^l2[:\s]/i.test(linea)) { actual.l2 = val(linea.replace(/^l2[:\s]*/i, '')); continue; }
      if (/^a1[:\s]/i.test(linea)) { actual.a1 = val(linea.replace(/^a1[:\s]*/i, '')); continue; }
      if (/^a2[:\s]/i.test(linea)) { actual.a2 = val(linea.replace(/^a2[:\s]*/i, '')); continue; }
      if (/^obs[:\s]/i.test(linea)) { actual.obs = linea.replace(/^obs[:\s]*/i, '').trim(); continue; }
    }
    flush();
    return piezas.length ? { piezas } : null;
  }

  function norm(p) {
    const s = v => String(v ?? '').trim();
    const n = v => Math.round(parseFloat(String(v ?? '').replace(',', '.')) || 0);
    const canto = v => { v = s(v); return ['D','G','DM','GM','Dx','Dz','Gx','Gz'].includes(v) ? v : ''; };
    return {
      material: s(p.material) || 'MELA PELIKANO BLANCO',
      qty: Math.max(1, parseInt(p.qty) || 1),
      largo: n(p.largo), ancho: n(p.ancho),
      veta: s(p.veta) || '1-Longitud',
      l1: canto(p.l1), l2: canto(p.l2), a1: canto(p.a1), a2: canto(p.a2),
      perf_cant: s(p.perf_cant), perf_lado: s(p.perf_lado), perf_det: s(p.perf_det),
      ran_libre: s(p.ran_libre), ran_espe: s(p.ran_espe), ran_prof: s(p.ran_prof),
      ran_lado: s(p.ran_lado), ran_det: s(p.ran_det),
      obs: s(p.obs),
    };
  }

  const img = { type: 'image', source: { type: 'base64', media_type: mt, data: imagen_b64 } };

  // ══════════════════════════════════════════════════════
  // FASE 1 — Operario experto lee y escribe en texto plano
  // ══════════════════════════════════════════════════════
  const F1 = `Actúa como un operario experto en lectura de órdenes de corte de melamina.
Debes interpretar EXACTAMENTE como lo haría un humano del taller.

-----------------------------------
REGLA PRINCIPAL
-----------------------------------
Los símbolos de canto se interpretan por su posición respecto a cada número (largo o ancho), NO por fila completa.

-----------------------------------
SÍMBOLOS
-----------------------------------
- ~  o línea ondulada  → G (grueso)
- —  o línea recta     → D (delgado)
- |  (palo)            → D
- X  encima del número → G
- Letra D              → D
- Letra G              → G
- DM o Dm              → DM
- GM o Gm              → GM
- Puntos (°°)          → PERFORACIÓN, no canto

-----------------------------------
COMBINACIONES (orden: símbolo más cercano al número primero)
-----------------------------------
- 1 solo ~       → G, -
- 1 solo —       → D, -
- ~ + ~          → G, G
- — + —          → D, D
- — + ~          → D, G   (recta más cercana, gusanito más lejano)
- ~ + —          → G, D   (gusanito más cercano, recta más lejana)

IMPORTANTE:
- El símbolo MÁS CERCANO al número define L1 (o A1)
- El símbolo MÁS LEJANO define L2 (o A2)
- Si solo hay 1 símbolo → solo L1 (o A1), el otro queda "-"

-----------------------------------
ASIGNACIÓN
-----------------------------------
- Símbolos cerca del número LARGO → L1, L2
- Símbolos cerca del número ANCHO → A1, A2

-----------------------------------
SIN SÍMBOLOS
-----------------------------------
Si no hay símbolo visible → L1=- L2=- (o A1=- A2=-)

-----------------------------------
UNIDADES
-----------------------------------
Convertir todo a MM:
- Número entero sin unidad → MM tal cual
- Número con decimal (60.3, 116.9) → probablemente CM → ×10
- Con "cm" explícito → ×10
- Con "m" explícito → ×1000

-----------------------------------
OBSERVACIONES
-----------------------------------
Texto a la derecha de la pieza → Obs
Ranura ("RAN", "R", "RA") sin números → Obs: Indicar especificaciones de ranura
Perforación (puntos °°) → registrar separado como perf

-----------------------------------
PROHIBIDO
-----------------------------------
- No duplicar símbolos automáticamente
- No asumir cantos globales
- No copiar de otras filas
- No inventar símbolos

-----------------------------------
VALIDACIÓN FINAL (hacer antes de responder)
-----------------------------------
1. ¿Si hay 1 símbolo dejé el segundo como "-"?
2. ¿Si hay 2 símbolos respeté el orden vertical (más cercano=L1)?
3. ¿Separé largo y ancho correctamente?
4. ¿Evité duplicar automáticamente?
Si algo falla, corrige antes de responder.

-----------------------------------
SALIDA EXACTA (una pieza por bloque)
-----------------------------------
Material: <nombre>
Cant:<n>
largo(veta):<valor mm>
ancho:<valor mm>
L1:<G|D|DM|GM|->
L2:<G|D|DM|GM|->
A1:<G|D|DM|GM|->
A2:<G|D|DM|GM|->
Obs:<texto o vacío>

Repite el bloque para CADA pieza. Si el material cambia, escribe la nueva línea Material.`;

  // ══════════════════════════════════════════════════════
  // FASE 2 — Convertir texto plano a JSON
  // ══════════════════════════════════════════════════════
  const F2 = `El texto anterior es la lectura de un operario de taller.
Conviértelo al JSON del sistema CARPICENTRO.

FORMATO EXACTO — responde SOLO con el JSON:
{"piezas":[{
  "material":"string",
  "qty":número,
  "largo":número_mm,
  "ancho":número_mm,
  "veta":"1-Longitud",
  "l1":"D|G|DM|GM|",
  "l2":"D|G|DM|GM|",
  "a1":"D|G|DM|GM|",
  "a2":"D|G|DM|GM|",
  "perf_cant":"",
  "perf_lado":"",
  "perf_det":"",
  "ran_libre":"",
  "ran_espe":"",
  "ran_prof":"",
  "ran_lado":"",
  "ran_det":"",
  "obs":""
}]}

REGLAS DE CONVERSIÓN:
- "-" en L1/L2/A1/A2 → "" en JSON (campo vacío)
- Obs vacío → ""
- Si hay perforación mencionada → llenar perf_cant, perf_lado, perf_det
- Si hay ranura con números → llenar ran_*
- Mantener el material correcto por pieza

RESPONDE SOLO CON EL JSON.`;

  let lastError = '';
  for (let i = 1; i <= 3; i++) {
    try {
      let resultado;

      if (i <= 2) {
        // Fase 1: operario genera texto plano
        const textoOperario = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] }
        ], 3000);

        // Intentar parsear el texto directamente primero
        const parseado = parsearTextoOperario(textoOperario);
        if (parseado?.piezas?.length) {
          return res.status(200).json({ piezas: parseado.piezas.map(norm), _intentos: i, _via: 'parser' });
        }

        // Si no, pedir a la IA que convierta a JSON
        const textoJSON = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] },
          { role: 'assistant', content: textoOperario },
          { role: 'user', content: F2 }
        ], 8192);
        resultado = textoJSON;
      } else {
        // Intento 3: directo
        resultado = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 + '\n\n' + F2 }] }
        ], 4096);
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
