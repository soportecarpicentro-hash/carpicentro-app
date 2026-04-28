// api/leer-lista.js — Claude Vision CARPICENTRO v14

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

  // ══════════════════════════════════════════════════════
  // FASE 1 — Análisis espacial número por número
  // ══════════════════════════════════════════════════════
  const F1 = `Analiza esta imagen como una lista de piezas de melamina.

╔═══════════════════════════════════════════════════════╗
║  REGLA CRÍTICA: Los símbolos de canto NO son globales ║
║  Cada número tiene su propio símbolo visual asociado  ║
╚═══════════════════════════════════════════════════════╝

INTERPRETACIÓN ESPACIAL — por cada pieza:
  Cada línea tiene: [cantidad] + [número LARGO] + [número ANCHO]
  Encima o debajo de CADA número puede haber un símbolo independiente.
  Debes mapear VISUALMENTE qué símbolo está más cerca de qué número.

  Símbolos cerca del LARGO  → afectan L1 y L2
  Símbolos cerca del ANCHO  → afectan A1 y A2

TRADUCCIÓN DE SÍMBOLOS:
  ~~~ o gusanito ondulado  → G (grueso)
  === o líneas rectas      → D (delgado)
  | (palo vertical)        → D
  X encima del número      → G
  Letra D escrita          → D
  Letra G escrita          → G
  DM o Dm                  → DM (delgado distinto color)
  GM o Gm                  → GM (grueso distinto color)
  Punto/s (° oo)           → PERFORACIÓN (no es canto)

CONTEO POR NÚMERO:
  0 símbolos cerca del número → L1="", L2=""
  1 símbolo                   → L1=tipo, L2=""
  2 símbolos (apilados)       → L1=tipo_cercano, L2=tipo_lejano
  (misma lógica para ANCHO → A1, A2)

UNIDADES: Convierte todo a MM.
  Número con decimal (420.5, 116.9) → probablemente CM → ×10
  Número entero sin unidad → MM tal cual
  Con "m" explícito → ×1000 | con "cm" explícito → ×10

VALIDACIÓN ANTES DE RESPONDER:
  ✓ Cada símbolo está asignado al número más cercano (largo o ancho)
  ✓ No asumo cantos donde no veo símbolo
  ✓ Solo asigno canto si hay símbolo visible

Para CADA pieza escribe:
PIEZA [N]: cant=[X] largo=[Y] ancho=[Z]
  Símbolos junto al LARGO: [describe exactamente lo que ves]
  Símbolos junto al ANCHO: [describe exactamente lo que ves]
  Puntos: [si hay y junto a qué número]
  Texto adicional: [obs, ranura, etc.]

Al inicio:
MATERIAL: [encabezado]
COLUMNAS: [N]`;

  // ══════════════════════════════════════════════════════
  // FASE 2 — JSON del sistema CARPICENTRO
  // ══════════════════════════════════════════════════════
  const F2 = `Convierte tu análisis al JSON del sistema CARPICENTRO.

CAMPOS POR PIEZA:
  material, qty, largo (mm), ancho (mm), veta ("1-Longitud")
  l1, l2 → cantos del LARGO  ("D"|"G"|"DM"|"GM"|"")
  a1, a2 → cantos del ANCHO  ("D"|"G"|"DM"|"GM"|"")
  perf_cant, perf_lado, perf_det → perforación ("" si no hay)
  ran_libre, ran_espe, ran_prof, ran_lado, ran_det → ranura ("" si no hay)
  obs → texto adicional o ""

REGLAS DE ASIGNACIÓN (basado en tu descripción visual):
  0 símbolos → l1="", l2=""
  1 recta/D/| → l1="D", l2=""
  2 rectas    → l1="D", l2="D"
  1 gusanito/G/X → l1="G", l2=""
  2 gusanitos → l1="G", l2="G"
  gusanito(más cercano al número) + recta(más lejana) → l1="G", l2="D"
  recta(más cercana) + gusanito(más lejano) → l1="D", l2="G"
  (misma lógica para a1, a2)

Si algo no es claro → obs="REVISAR: [motivo]"
Texto descriptivo (costados, puertas, etc.) → obs
Ranura sin números → obs="Indicar especificaciones de ranura"
Perforación: perf_cant=N, perf_lado=medida_mm, perf_det="NP/medida"

═══ EJEMPLO VERIFICADO (Roble Gris) ═══
Pieza ②420×330:
  Junto al 420: gusanito+gusanito (2 símbolos) → l1="G", l2="G"
  Junto al 330: recta+recta (2 símbolos) → a1="D", a2="D"
  → qty=2, largo=420, ancho=330, l1="G", l2="G", a1="D", a2="D", obs="R. Costados"

Pieza ①414×863:
  Junto al 414: ningún símbolo → l1="", l2=""
  Junto al 863: ningún símbolo → a1="", a2=""
  → qty=1, largo=414, ancho=863, l1="", l2="", a1="", a2="", obs="Respaldo"

RESPONDE SOLO CON EL JSON:
{"piezas":[{"material":"ROBLE GRIS","qty":2,"largo":420,"ancho":330,"veta":"1-Longitud","l1":"G","l2":"G","a1":"D","a2":"D","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":"R. Costados"}]}`;

  let lastError = '';
  for (let i = 1; i <= 3; i++) {
    try {
      let texto;
      if (i <= 2) {
        const desc = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] }
        ], 3000);
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
