// api/leer-lista.js — Claude Vision CARPICENTRO v9
// Medidas en MM tal cual. Proximidad al número = L1/A1.

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

═══ PASO 1: DISTINGUE ESTOS 4 ELEMENTOS ═══

1. LÍNEA RECTA (─ = ══): plana, sin ondas → indica canto DELGADO "D"
   Puede ser simple (─) o doble (══). Ambas = "D".

2. LÍNEA ONDULADA (≈ ~~~): con curvas/olas → indica canto GRUESO "G"

3. PUNTOS (• ° o,o oo): círculos pequeños debajo del número → indican PERFORACIÓN
   ⚠️ Los puntos NO son cantos. Son perforaciones.
   Cuenta cuántos puntos hay → eso es perf_cant
   El número junto al que están → eso es perf_lado

4. TEXTO ADICIONAL: "RAN", "R", "RA" = ranura. Texto descriptivo = observación.

═══ PASO 2: REGLA DE CANTOS ═══
Las líneas (rectas u onduladas) pueden estar arriba o abajo del número — NO importa la posición.
Lo que importa: CUÁNTAS líneas hay y cuál está MÁS CERCA del número.

• 0 líneas → sin canto: l1="", l2=""
• 1 línea (recta) → l1="D", l2=""
• 2 líneas (rectas) → l1="D", l2="D"
• 1 gusanito → l1="G", l2=""
• 2 gusanitos → l1="G", l2="G"
• gusanito MÁS CERCANO + recta MÁS LEJANA → l1="G", l2="D"
• recta MÁS CERCANA + gusanito MÁS LEJANO → l1="D", l2="G"
Misma lógica para ANCHO → a1, a2

═══ PASO 3: MEDIDAS ═══
Las medidas se copian TAL CUAL en MM. NO convertir.
1982 → largo=1982. 580 → ancho=580. 420 → largo=420.

═══ INSTRUCCIÓN ═══
Para CADA pieza describe:
PIEZA N | Cant×Largo×Ancho
  LARGO: [líneas que ves cerca del número - tipo y cantidad]
  ANCHO: [líneas que ves cerca del número]
  PUNTOS: [cuántos puntos y junto a qué número, o "ninguno"]
  TEXTO: [observaciones, ranura, o "ninguno"]

Al inicio: MATERIAL y COLUMNAS.`;

  const F2 = `Convierte tu descripción al JSON.

MEDIDAS: copiar el número exacto en MM, sin convertir.

CANTOS según tu descripción:
• 0 líneas → l1="", l2=""
• 1 recta → l1="D", l2=""
• 2 rectas → l1="D", l2="D"
• 1 gusanito → l1="G", l2=""
• 2 gusanitos → l1="G", l2="G"
• gusanito(cercano)+recta(lejana) → l1="G", l2="D"
• recta(cercana)+gusanito(lejano) → l1="D", l2="G"
(misma lógica para ancho → a1, a2)

PERFORACIÓN: si describiste puntos junto a un número:
• perf_cant = cantidad de puntos
• perf_lado = el número junto al que están (en MM)
• perf_det = "NPx/LADO" (ej: "2P/1982")
⚠️ Los puntos NO afectan los cantos. Son campos separados.

RANURA: "RAN","R","RA" sin números → obs="Indicar especificaciones de ranura"

SECCIÓN NUEVA: si ves un encabezado diferente (ej: "MDF Blanco") en mitad de la lista,
las piezas siguientes usan ese nuevo material.

═══ EJEMPLOS VERIFICADOS (lista MELA PELIKANO BLANCO) ═══

"2 de 1982×580" | 2 rectas bajo largo | 2 puntos bajo 1982 | 1 recta bajo ancho
→ qty=2, largo=1982, ancho=580, l1="D", l2="D", a1="D", a2="", perf_cant="2", perf_lado="1982", perf_det="2P/1982"

"1 de 1200×580" | 1 recta bajo largo | 2 puntos bajo 1200 | 1 recta bajo ancho
→ qty=1, largo=1200, ancho=580, l1="D", l2="", a1="D", a2="", perf_cant="2", perf_lado="1200", perf_det="2P/1200"

"1 de 1164×580" | 2 rectas bajo largo | 1 letra bajo 1164 (no punto) | 2 rectas bajo ancho
→ qty=1, largo=1164, ancho=580, l1="D", l2="D", a1="D", a2="D", perf_cant="", perf_lado="", perf_det=""

"3 de 1164×575" | 2 rectas largo | 2 rectas ancho
→ qty=3, largo=1164, ancho=575, l1="D", l2="D", a1="D", a2="D"

"2 de 1214×260" | 2 rectas largo | 0 líneas ancho
→ qty=2, largo=1214, ancho=260, l1="D", l2="D", a1="", a2=""

"2 de 314×260" | 1 recta largo | 0 líneas ancho
→ qty=2, largo=314, ancho=260, l1="D", l2="", a1="", a2=""

RESPONDE SOLO CON EL JSON:
{"piezas":[{"material":"MELA PELIKANO BLANCO","qty":2,"largo":1982,"ancho":580,"veta":"1-Longitud","l1":"D","l2":"D","a1":"D","a2":"","perf_cant":"2","perf_lado":"1982","perf_det":"2P/1982","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":""}]}`;

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
