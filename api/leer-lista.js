// api/leer-lista.js — Claude Vision CARPICENTRO v9
// MEDIDAS: siempre MM tal cual. CANTOS: más cercano al número = L1/A1

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
      if (!resp.ok) throw new Error(`API ${resp.status}: ${data.error?.message || raw.slice(0,100)}`);
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
    for (const r of [js.slice(0, js.lastIndexOf('},') + 1) + ']}', js.slice(0, js.lastIndexOf('}') + 1) + ']}']) {
      try { const p = JSON.parse(r); if (p?.piezas?.length) return p; } catch (_) {}
    }
    return null;
  }

  function norm(p) {
    const s = v => String(v ?? '').trim();
    const n = v => Math.round(parseFloat(String(v ?? '').replace(',', '.')) || 0);
    return {
      material: s(p.material) || 'MELA PELIKANO BLANCO',
      qty: Math.max(1, parseInt(p.qty) || 1),
      largo: n(p.largo), ancho: n(p.ancho),
      veta: s(p.veta) || '1-Longitud',
      l1: s(p.l1), l2: s(p.l2), a1: s(p.a1), a2: s(p.a2),
      perf_cant: s(p.perf_cant), perf_lado: s(p.perf_lado), perf_det: s(p.perf_det),
      ran_libre: s(p.ran_libre), ran_espe: s(p.ran_espe), ran_prof: s(p.ran_prof),
      ran_lado: s(p.ran_lado), ran_det: s(p.ran_det),
      obs: s(p.obs),
    };
  }

  const img = { type: 'image', source: { type: 'base64', media_type: mt, data: imagen_b64 } };

  const F1 = `Analiza esta lista de corte de carpintería (CARPICENTRO, Lima).

═══ TIPOS DE LÍNEA ═══
• LÍNEA RECTA (─ = ──): plana, sin ondas → canto DELGADO = "D"
• LÍNEA ONDULADA (≈ ~~~): con curvas/olas → canto GRUESO = "G"

═══ REGLA DE CANTOS (LA MÁS IMPORTANTE) ═══
Las líneas están CERCA del número (arriba o abajo, no importa la posición).
Lo que importa es CUÁNTAS líneas hay y CUÁL está más CERCA del número:

• 0 líneas cerca del número → sin canto
• 1 línea → L1 = tipo de esa línea, L2 = vacío
• 2 líneas → la MÁS CERCANA al número = L1, la MÁS LEJANA = L2
  Ejemplo: número 420 con gusanito pegado al número y recta más lejos → L1=G, L2=D
  Ejemplo: número 420 con recta pegada al número y gusanito más lejos → L1=D, L2=G

MISMA LÓGICA para el ANCHO → A1 (más cercana), A2 (más lejana)

═══ MEDIDAS ═══
Las medidas están en MILÍMETROS tal como se escriben. NO convertir.
Si el cliente escribe 420 → largo=420. Si escribe 1960 → largo=1960.
Si escribe con decimal (420.5) → largo=420 (redondear).

Para CADA pieza describe:
PIEZA N | Cant×Largo×Ancho | Líneas_LARGO: [cuántas y tipo, cuál más cerca] | Líneas_ANCHO: [ídem] | Obs: [texto]

Al inicio:
MATERIAL: [encabezado]
COLUMNAS: [cuántas]`;

  const F2 = `Convierte tu descripción al JSON:

MEDIDAS: usar el número exacto que el cliente escribió, en MM tal cual. Sin convertir.

CANTOS según tu descripción:
• 0 líneas → l1="", l2=""
• 1 recta → l1="D", l2=""
• 2 rectas → l1="D", l2="D"
• 1 gusanito → l1="G", l2=""
• 2 gusanitos → l1="G", l2="G"
• gusanito(cercano) + recta(lejana) → l1="G", l2="D"
• recta(cercana) + gusanito(lejano) → l1="D", l2="G"
(misma lógica para ANCHO → a1, a2)

RANURA: "RAN", "R", "RA" sin números → obs="Indicar especificaciones de ranura"

═══ EJEMPLOS VERIFICADOS ═══
② 420×330 | gusanito(cercano)+recta(lejana) largo | 2 rectas ancho | R. Costados
→ qty=2, largo=420, ancho=330, l1="G", l2="D", a1="D", a2="D", obs="R. Costados"

② 864×80 | 2 rectas largo | 2 rectas ancho | Lazo
→ qty=2, largo=864, ancho=80, l1="D", l2="D", a1="D", a2="D", obs="Lazo"

② 372×422 | 2 gusanitos largo | 2 gusanitos ancho | Puertas
→ qty=2, largo=372, ancho=422, l1="G", l2="G", a1="G", a2="G", obs="Puertas"

② 900×330 | gusanito(cercano)+recta(lejana) largo | 2 rectas ancho | Costados
→ qty=2, largo=900, ancho=330, l1="G", l2="D", a1="D", a2="D", obs="Costados"

① 414×863 | 0 líneas largo | 0 líneas ancho | Respaldo
→ qty=1, largo=414, ancho=863, l1="", l2="", a1="", a2="", obs="Respaldo"

RESPONDE SOLO CON EL JSON:
{"piezas":[{"material":"ROBLE GRIS","qty":2,"largo":420,"ancho":330,"veta":"1-Longitud","l1":"G","l2":"D","a1":"D","a2":"D","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":"R. Costados"}]}`;

  let lastError = '';
  for (let i = 1; i <= 3; i++) {
    try {
      let texto;
      if (i <= 2) {
        const desc = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] }
        ], 2500);
        texto = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] },
          { role: 'assistant', content: desc },
          { role: 'user', content: F2 }
        ], 8192);
      } else {
        texto = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 + '\n\n' + F2 }] }
        ], 4096);
      }
      const parsed = extraerJSON(texto);
      if (parsed?.piezas?.length) {
        return res.status(200).json({ piezas: parsed.piezas.map(norm), _intentos: i });
      }
      lastError = `Intento ${i}: sin piezas. "${texto.slice(0, 120)}"`;
    } catch (e) {
      lastError = `Intento ${i}: ${e.message}`;
      if (i < 3) await new Promise(r => setTimeout(r, i * 3000));
    }
  }
  return res.status(422).json({ error: 'No se pudo leer. ' + lastError });
}
