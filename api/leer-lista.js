// api/leer-lista.js — CARPICENTRO v18
// Detecta: símbolos cerca del número (arriba/abajo), letras D/G en tabla, subrayado rojo

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

  function parsearTexto(txt) {
    const piezas = [];
    const lineas = txt.split('\n').map(l => l.trim()).filter(Boolean);
    let material = 'MELA PELIKANO BLANCO';
    let cur = null;
    const flush = () => { if (cur?.largo && cur?.ancho) piezas.push({...cur}); cur = null; };
    const limpia = v => { v = String(v||'').trim(); return ['','-','–','—'].includes(v) ? '' : v; };
    const num = v => Math.round(parseFloat(String(v||'').replace(',','.'))||0);
    for (const l of lineas) {
      if (/^material[:\s]/i.test(l)) { flush(); material = l.replace(/^material[:\s]*/i,'').trim()||material; continue; }
      if (/^cant[:\s]/i.test(l)) { flush(); cur = {material,qty:parseInt(l.replace(/^cant[:\s]*/i,''))||1,largo:0,ancho:0,veta:'1-Longitud',l1:'',l2:'',a1:'',a2:'',perf_cant:'',perf_lado:'',perf_det:'',ran_libre:'',ran_espe:'',ran_prof:'',ran_lado:'',ran_det:'',obs:''}; continue; }
      if (!cur) continue;
      if (/^largo[^:]*:/i.test(l)) { cur.largo = num(l.replace(/^largo[^:]*:/i,'')); continue; }
      if (/^ancho[^:]*:/i.test(l)) { cur.ancho = num(l.replace(/^ancho[^:]*:/i,'')); continue; }
      if (/^l1[:\s]/i.test(l)) { cur.l1 = limpia(l.replace(/^l1[:\s]*/i,'')); continue; }
      if (/^l2[:\s]/i.test(l)) { cur.l2 = limpia(l.replace(/^l2[:\s]*/i,'')); continue; }
      if (/^a1[:\s]/i.test(l)) { cur.a1 = limpia(l.replace(/^a1[:\s]*/i,'')); continue; }
      if (/^a2[:\s]/i.test(l)) { cur.a2 = limpia(l.replace(/^a2[:\s]*/i,'')); continue; }
      if (/^obs[:\s]/i.test(l)) { cur.obs = l.replace(/^obs[:\s]*/i,'').trim(); continue; }
    }
    flush();
    return piezas.length ? {piezas} : null;
  }

  function norm(p) {
    const s = v => String(v ?? '').trim();
    const n = v => Math.round(parseFloat(String(v ?? '').replace(',', '.')) || 0);
    const c = v => { const x = s(v).toUpperCase(); return ['D','G','DM','GM'].includes(x) ? x : ''; };
    return {
      material: s(p.material) || 'MELA PELIKANO BLANCO',
      qty: Math.max(1, parseInt(p.qty) || 1),
      largo: n(p.largo), ancho: n(p.ancho),
      veta: s(p.veta) || '1-Longitud',
      l1: c(p.l1), l2: c(p.l2), a1: c(p.a1), a2: c(p.a2),
      perf_cant: s(p.perf_cant), perf_lado: s(p.perf_lado), perf_det: s(p.perf_det),
      ran_libre: s(p.ran_libre), ran_espe: s(p.ran_espe), ran_prof: s(p.ran_prof),
      ran_lado: s(p.ran_lado), ran_det: s(p.ran_det),
      obs: s(p.obs),
    };
  }

  const img = { type: 'image', source: { type: 'base64', media_type: mt, data: imagen_b64 } };

  const F1 = `Eres un operario experto en lectura de órdenes de corte de melamina.
Interpreta EXACTAMENTE como lo haría un humano del taller.

━━━ PASO 1: IDENTIFICA EL FORMATO DE LA HOJA ━━━
Antes de leer, determina qué formato usa esta lista:

FORMATO A — SÍMBOLOS CERCA DEL NÚMERO (más común):
  El cliente dibuja líneas o gusanitos directamente sobre/bajo el número.
  Ejemplo: número 420 con ≈≈ encima y == debajo.

FORMATO B — TABLA CON COLUMNAS DE CANTO:
  La hoja tiene columnas explícitas: L1 | L2 | A1 | A2
  El cliente escribe la letra D, G, o deja vacío en cada columna.
  Ejemplo: cantidad | largo | ancho | L1=D | L2=G | A1=D | A2=
  Si ves columnas L1/L2/A1/A2 con letras escritas → LEER ESAS COLUMNAS DIRECTAMENTE.

FORMATO C — SUBRAYADO BAJO LA MEDIDA:
  El cliente subraya (una o dos veces) el número con lápiz o bolígrafo.
  El subrayado puede ser de cualquier color.
  1 subrayado simple = 1 canto D
  2 subrayados = 2 cantos D,D
  Subrayado ondulado = G

━━━ PASO 2: SÍMBOLOS Y SU SIGNIFICADO ━━━
  ~ ≈ ~~~ (ondulado/gusanito)   → G (grueso)
  — = ══ (recta/plana)          → D (delgado)
  | (palo vertical)              → D
  X encima del número            → G
  Letra D escrita                → D
  Letra G escrita                → G
  DM / Dm                        → DM
  GM / Gm                        → GM
  Puntos °° junto al número      → PERFORACIÓN (no canto)

━━━ PASO 3: ASIGNACIÓN (MÁXIMA PRIORIDAD) ━━━
Para cada número (LARGO y ANCHO POR SEPARADO):

  El símbolo/trazo MÁS CERCANO al número → L1 (o A1)
  El símbolo/trazo MÁS LEJANO → L2 (o A2)

  0 trazos → L1=- L2=-
  1 trazo  → L1=tipo, L2=-
  2 trazos → L1=tipo_cercano, L2=tipo_lejano

  ⚠️ Si hay 2 trazos: AMBOS deben aparecer. No dejar L2 vacío si hay 2 trazos.
  ⚠️ Los trazos del LARGO no se copian al ANCHO ni viceversa.
  ⚠️ No copiar cantos de otras filas.

━━━ PASO 4: UNIDADES ━━━
  Número entero (420, 864, 1982) → MM tal cual
  Número con decimal (42.0, 58.5, 116.9) → CM → ×10 → MM
  Con "cm" explícito → ×10 | Con "m" → ×1000

━━━ PASO 5: EXTRAS ━━━
  Ranura "RAN/R/RA" + números → ran_libre, ran_espe, ran_prof, ran_lado
  Ranura sin números → obs="Indicar especificaciones de ranura"
  Perforación (puntos) → perf_cant=N, perf_lado=medida_mm

━━━ REGLAS ESTRICTAS ━━━
  ✗ No duplicar cantos automáticamente
  ✗ No copiar de otras filas
  ✗ No inventar trazos
  ✗ Si no hay trazo → campo vacío "-"

━━━ VALIDACIÓN ANTES DE RESPONDER ━━━
  1. ¿Analicé LARGO y ANCHO por separado?
  2. ¿Si hay 1 trazo, L2 queda "-"?
  3. ¿Si hay 2 trazos, ambos aparecen?
  4. ¿No copié de otras filas?

━━━ SALIDA ━━━
Material: <nombre>
Cant:<n>
largo(veta):<mm>
ancho:<mm>
L1:<G|D|DM|GM|->
L2:<G|D|DM|GM|->
A1:<G|D|DM|GM|->
A2:<G|D|DM|GM|->
Obs:<texto o vacío>`;

  const F2 = `Convierte la lectura al JSON del sistema CARPICENTRO.
"-" en cantos → "" (vacío). Obs vacío → "".

RESPONDE SOLO CON EL JSON:
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
        ], 4000);

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
