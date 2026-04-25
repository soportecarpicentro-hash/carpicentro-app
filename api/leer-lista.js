// api/leer-lista.js — Claude Vision CARPICENTRO v10
// Ejemplos verificados con correcciones de perforación y cantos

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

═══ LOS 4 ELEMENTOS QUE DEBES IDENTIFICAR ═══

1. LÍNEA RECTA (─ = ══): raya plana horizontal, sin ondas → canto DELGADO "D"
   Una línea recta = 1 canto. Dos líneas rectas = 2 cantos.

2. LÍNEA ONDULADA (≈ ~~~): raya con curvas/olas → canto GRUESO "G"
   Una ondulada = 1 canto. Dos onduladas = 2 cantos.

3. PUNTOS (° • oo): círculos pequeños junto a un número → PERFORACIÓN (NO es canto)
   Cuenta los puntos → perf_cant. El número junto al que están → perf_lado.

4. TEXTO: "RAN"/"R"/"RA" = ranura. Palabras descriptivas = observación.

═══ REGLA DE CANTOS ═══
Las líneas están CERCA del número (arriba o abajo — la posición no importa).
• 0 líneas → sin canto
• 1 línea → L1 = ese tipo, L2 = vacío
• 2 líneas → L1 = más cercana al número, L2 = más lejana al número
Misma lógica para ANCHO → A1, A2

IMPORTANTE: Cuenta las líneas con cuidado. Si ves 2 líneas rectas → L1="D" Y L2="D". No dejes L2 vacío si hay 2 líneas.

═══ MEDIDAS ═══
Copiar TAL CUAL en MM. No convertir. 1982→1982, 414→414, 420→420.

═══ INSTRUCCIÓN ═══
Para CADA pieza:
PIEZA N | Cant×Largo×Ancho
  LARGO: [N líneas, tipo, posición si aplica]
  ANCHO: [N líneas, tipo]
  PUNTOS: [N puntos junto a cuál número, o ninguno]
  TEXTO: [obs o ninguno]

Al inicio: MATERIAL y COLUMNAS.`;

  const F2 = `Convierte la descripción al JSON con estas reglas:

MEDIDAS: número exacto en MM sin convertir.

CANTOS:
• 0 líneas cerca del número → l1="", l2=""
• 1 recta → l1="D", l2=""
• 2 rectas → l1="D", l2="D"    ← AMBAS si hay 2
• 1 gusanito → l1="G", l2=""
• 2 gusanitos → l1="G", l2="G"
• gusanito(cercano)+recta(lejana) → l1="G", l2="D"
• recta(cercana)+gusanito(lejano) → l1="D", l2="G"
(misma lógica para ancho → a1, a2)

PERFORACIÓN (puntos):
• perf_cant = número de puntos
• perf_lado = la medida junto a la que están (en MM)
• perf_det = "NP/medida" (ej: "2P/1982")
Los puntos NO afectan l1/l2/a1/a2.

RANURA: sin números → obs="Indicar especificaciones de ranura"

Si hay un encabezado nuevo en mitad de la lista (ej: "MDF Blanco") → cambiar material.

═══ EJEMPLOS VERIFICADOS (lista MELA PELIKANO BLANCO) ═══

"2 de 1982×580" — 2 rectas+2puntos bajo 1982, 1 recta bajo 580
→ qty=2, largo=1982, ancho=580, l1="D", l2="D", a1="D", a2="", perf_cant="2", perf_lado="1982", perf_det="2P/1982", obs=""

"1 de 1200×580" — 1 recta+2puntos bajo 1200, 1 recta bajo 580
→ qty=1, largo=1200, ancho=580, l1="D", l2="", a1="D", a2="", perf_cant="2", perf_lado="1200", perf_det="2P/1200", obs=""

"1 de 1164×580" — 2 rectas bajo 1164, 2 rectas bajo 580
→ qty=1, largo=1164, ancho=580, l1="D", l2="D", a1="D", a2="D", perf_cant="", obs=""

"3 de 1164×575" — 2 rectas bajo 1164, 2 rectas bajo 575
→ qty=3, largo=1164, ancho=575, l1="D", l2="D", a1="D", a2="D", perf_cant="", obs=""

"1 de 1964×580" — 2 rectas bajo 1964, 1 recta bajo 580
→ qty=1, largo=1964, ancho=580, l1="D", l2="D", a1="D", a2="", perf_cant="", obs=""

"2 de 1996×596" — 2 rectas bajo 1996, 2 rectas bajo 596
→ qty=2, largo=1996, ancho=596, l1="D", l2="D", a1="D", a2="D", perf_cant="", obs=""

"2 de 1214×260" — 2 rectas bajo 1214, 0 líneas bajo 260
→ qty=2, largo=1214, ancho=260, l1="D", l2="D", a1="", a2="", perf_cant="", obs=""

"2 de 350×260" — 1 recta bajo 350, 1 recta bajo 260
→ qty=2, largo=350, ancho=260, l1="D", l2="", a1="D", a2="", perf_cant="", obs=""

"2 de 314×260" — 1 recta bajo 314, 0 líneas bajo 260
→ qty=2, largo=314, ancho=260, l1="D", l2="", a1="", a2="", perf_cant="", obs=""

"2 de 414×346" — 2 rectas bajo 414, 2 rectas bajo 346
→ qty=2, largo=414, ancho=346, l1="D", l2="D", a1="D", a2="D", perf_cant="", obs=""

"1 de 408×346" — 1 recta bajo 408, 1 recta bajo 346
→ qty=1, largo=408, ancho=346, l1="D", l2="", a1="D", a2="", perf_cant="", obs=""

"20 de 805×453" — 2 rectas bajo 805, 2 rectas bajo 453
→ qty=20, largo=805, ancho=453, l1="D", l2="D", a1="D", a2="D", perf_cant="", obs=""

"12 de 605×353" — 2 rectas bajo 605, 2 rectas bajo 353
→ qty=12, largo=605, ancho=353, l1="D", l2="D", a1="D", a2="D", perf_cant="", obs=""

"MDF Blanco — 2 de 1996×598" — (nuevo material)
→ qty=2, largo=1996, ancho=598, material="MDF Blanco", l1="", l2="", a1="", a2="", obs=""

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
