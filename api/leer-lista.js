// api/leer-lista.js — CARPICENTRO v19
// Optimizado para leer MEDIDAS con máxima precisión
// Los cantos son secundarios y se pueden corregir manualmente

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
    const flush = () => { if (cur?.largo && cur?.ancho) piezas.push({...cur}); cur = null; };
    const limpia = v => { v = String(v||'').trim(); return ['','-','–','—'].includes(v) ? '' : v; };
    const num = v => Math.round(parseFloat(String(v||'').replace(',','.'))||0);
    for (const l of lineas) {
      if (/^material[:\s]/i.test(l)) { flush(); material=l.replace(/^material[:\s]*/i,'').trim()||material; continue; }
      if (/^cant[:\s]/i.test(l)) { flush(); cur={material,qty:parseInt(l.replace(/^cant[:\s]*/i,''))||1,largo:0,ancho:0,veta:'1-Longitud',l1:'',l2:'',a1:'',a2:'',perf_cant:'',perf_lado:'',perf_det:'',ran_libre:'',ran_espe:'',ran_prof:'',ran_lado:'',ran_det:'',obs:''}; continue; }
      if (!cur) continue;
      if (/^largo[^:]*:/i.test(l)) { cur.largo=num(l.replace(/^largo[^:]*:/i,'')); continue; }
      if (/^ancho[^:]*:/i.test(l)) { cur.ancho=num(l.replace(/^ancho[^:]*:/i,'')); continue; }
      if (/^l1[:\s]/i.test(l)) { cur.l1=limpia(l.replace(/^l1[:\s]*/i,'')); continue; }
      if (/^l2[:\s]/i.test(l)) { cur.l2=limpia(l.replace(/^l2[:\s]*/i,'')); continue; }
      if (/^a1[:\s]/i.test(l)) { cur.a1=limpia(l.replace(/^a1[:\s]*/i,'')); continue; }
      if (/^a2[:\s]/i.test(l)) { cur.a2=limpia(l.replace(/^a2[:\s]*/i,'')); continue; }
      if (/^obs[:\s]/i.test(l)) { cur.obs=l.replace(/^obs[:\s]*/i,'').trim(); continue; }
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

  // ══════════════════════════════════════════════════════════════════
  // FASE 1 — PRIORIDAD: leer medidas con máxima precisión
  // Los cantos son secundarios (se pueden corregir manualmente)
  // ══════════════════════════════════════════════════════════════════
  const F1 = `Eres un operario experto en listas de corte de melamina.
TU PRIORIDAD ABSOLUTA: leer las MEDIDAS (cantidad, largo, ancho) con máxima precisión.
Los cantos son secundarios — si tienes duda, deja el campo vacío.

━━━ PASO 1: IDENTIFICA EL FORMATO ━━━

La lista puede tener varios formatos. Detecta cuál es antes de leer:

FORMATO A — Símbolos gráficos sobre el número:
  Patrón: (cant) LARGO×ANCHO con líneas/gusanitos dibujados encima de cada número
  Unidades: decimales con punto (57.4, 116.9) → son CM → convertir ×10 a MM

FORMATO B — Tabla con columnas L1 L2 A1 A2:
  Patrón: tabla impresa o dibujada con columnas explícitas de canto
  Lee las letras D/G directamente de cada columna

FORMATO C — Letras D/G/GGGG al costado:
  Patrón: cant → LARGOxANCHO   DDDD o GGGG o DD- etc.
  Las letras juntas representan los 4 cantos en orden L1 L2 A1 A2
  Ejemplos:
    DDDD = L1=D L2=D A1=D A2=D
    GGGG = L1=G L2=G A1=G A2=G  
    DD   = L1=D L2=D A1=- A2=-
    DDD- = L1=D L2=D A1=D A2=-
    -D-- = L1=- L2=D A1=- A2=-

FORMATO D — Texto descriptivo al costado:
  Patrón: cant pzs → LARGO×ANCHO → texto
  "c/grueso" o "c/G" → todos los cantos visibles = G
  "c/delgado" o "c/D" → todos los cantos visibles = D
  "sin canto" → sin cantos
  "largo c/grueso, largo c/delgado" → L1=G L2=D
  "RL" o "PL" → sin canto (pieza lisa)

FORMATO E — Subrayado bajo las medidas:
  Subrayado simple (—) bajo el número → D
  Subrayado doble (══) → D, D
  Subrayado ondulado (≈) → G

━━━ PASO 2: REGLAS DE MEDIDAS (MÁXIMA PRIORIDAD) ━━━

1. CANTIDAD: número al inicio de línea, encerrado en círculo, o "N de", "N →", "N pzs"
2. LARGO × ANCHO: los dos números separados por "x", "×", "X"
3. UNIDADES:
   - Entero ≥ 200: MM directo (420, 980, 1982)
   - Decimal con punto (57.4, 116.9, 38.4): CM → ×10 → MM (574, 1169, 384)
   - Decimal con coma: ídem
   - Con punto de miles (1.304,0): es 1304 MM
4. LÍNEAS TACHADAS: ignorar completamente (son correcciones del cliente)
5. TEXTO DESPUÉS DE FLECHA (→ ⟹): son observaciones, no medidas

━━━ PASO 3: CANTOS (secundarios — mejor dejar vacío que equivocarse) ━━━

Según el formato detectado:
- Formato A: trazos cerca del número (≈=G, —=D)
- Formato B: leer columnas L1/L2/A1/A2 directamente
- Formato C: interpretar secuencia de letras DDDD/GGGG/DD-/etc.
- Formato D: interpretar texto descriptivo
- Formato E: subrayado simple=D, doble=D,D

Si no ves claramente el canto → dejar vacío, NO inventar.
El usuario puede corregir los cantos manualmente en la app.

━━━ PASO 4: RANURA Y PERFORACIÓN ━━━
Ranura: R seguido de números (R18-4-7 o R/18/4/7) → libre=18, espe=4, prof=7
Perforación: puntos °° junto a número → perf_cant=N, perf_lado=esa_medida

━━━ PASO 5: CAMBIO DE MATERIAL ━━━
Si aparece un nuevo encabezado de material (ej: "Blanco", "MDF Blanco", "Melamina Onix")
→ ese material aplica a todas las piezas siguientes hasta el próximo encabezado.

━━━ SALIDA ━━━
Material: <nombre completo>
Cant:<n>
largo(veta):<mm exactos>
ancho:<mm exactos>
L1:<G|D|DM|GM|->
L2:<G|D|DM|GM|->
A1:<G|D|DM|GM|->
A2:<G|D|DM|GM|->
Obs:<texto o vacío>

Un bloque por pieza. Si el material cambia, nueva línea "Material:".
Lee TODAS las piezas. Ignora líneas tachadas.`;

  const F2 = `Convierte al JSON del sistema CARPICENTRO.
"-" o vacío en cantos → "" en JSON.
Decimales en medidas → ya deberían estar en MM (si no los convirtiste, hazlo ahora: ×10).

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
