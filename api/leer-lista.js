// api/leer-lista.js — Claude Vision CARPICENTRO v8
// REGLA FINAL: proximidad al número define L1/L2, cantidad define cuántos lados

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

  const F1 = `Analiza esta lista de corte de carpintería. Para cada pieza hay líneas decorativas CERCA de los números que indican cantos (enchape).

HAY DOS TIPOS DE LÍNEA:
• LÍNEA RECTA (─ o = o ──): plana, sin ondas → significa canto DELGADO = "D"
• LÍNEA ONDULADA (≈ o ~~~): con curvas u olas → significa canto GRUESO = "G"

REGLA PARA CONTAR CANTOS (no importa si la línea va arriba o abajo del número):
• 0 líneas cerca del número → sin canto: ""
• 1 línea recta → 1 solo lado D: L1="D", L2=""
• 2 líneas rectas → ambos lados D: L1="D", L2="D"
• 1 gusanito → 1 solo lado G: L1="G", L2=""
• 2 gusanitos → ambos lados G: L1="G", L2="G"
• 1 gusanito + 1 recta → L1="G", L2="D" (el más CERCANO al número = L1, el más LEJANO = L2)
• 1 recta + 1 gusanito → L1="D", L2="G" (más cercano = L1)

APLICA LA MISMA LÓGICA AL ANCHO → A1, A2

Describe CADA pieza en este formato:
PIEZA N | Cant×Largo×Ancho | Líneas_LARGO: [cuenta y tipo] | Líneas_ANCHO: [cuenta y tipo] | Obs: [texto o nada]

Al inicio responde:
MATERIAL: [encabezado]
UNIDAD: CM o MM
COLUMNAS: N`;

  const F2 = `Convierte tu descripción al JSON siguiendo estas reglas:

UNIDAD:
• Número entero < 500: CM → ×10 → MM (420→4200, 330→3300, 864→8640, 372→3720)
• Número con decimal (57.4, 116.9): CM → ×10 → MM
• Número ≥ 500: ya es MM, no convertir

CANTOS — asignar según lo que describiste:
• 0 líneas sobre LARGO → l1="", l2=""
• 1 recta sobre LARGO → l1="D", l2=""
• 2 rectas sobre LARGO → l1="D", l2="D"
• 1 gusanito sobre LARGO → l1="G", l2=""
• 2 gusanitos sobre LARGO → l1="G", l2="G"
• gusanito + recta sobre LARGO → l1="G", l2="D"
• recta + gusanito sobre LARGO → l1="D", l2="G"
(misma lógica para ANCHO → a1, a2)

RANURA: "RAN", "R", "RA" sin números → obs="Indicar especificaciones de ranura"
Si hay texto legible → copiarlo en obs

═══ EJEMPLOS VERIFICADOS DE ESTA MISMA LISTA ═══

② 420×330 | 1 gusanito + 1 recta sobre largo | 2 rectas sobre ancho | R. Costados
→ l1="G", l2="D", a1="D", a2="D", obs="R. Costados"

② 864×330 | 1 gusanito + 1 recta sobre largo | 2 rectas sobre ancho | R Techo Pso
→ l1="G", l2="D", a1="D", a2="D", obs="R Techo Pso"

② 864×80 | 2 rectas sobre largo | 2 rectas sobre ancho | Lazo
→ l1="D", l2="D", a1="D", a2="D", obs="Lazo"

② 372×422 | 2 gusanitos sobre largo | 2 gusanitos sobre ancho | Puertas
→ l1="G", l2="G", a1="G", a2="G", obs="Puertas"

② 900×330 | 1 gusanito + 1 recta sobre largo | 2 rectas sobre ancho | Costados
→ l1="G", l2="D", a1="D", a2="D", obs="Costados"

② 414×330 | 1 gusanito + 1 recta sobre largo | 2 rectas sobre ancho | Techo Pso
→ l1="G", l2="D", a1="D", a2="D", obs="Techo Pso"

① 414×312 | 1 gusanito + 1 recta sobre largo | 2 rectas sobre ancho | Division
→ l1="G", l2="D", a1="D", a2="D", obs="Division"

① 414×863 | 0 líneas sobre largo | 0 líneas sobre ancho | Respaldo
→ l1="", l2="", a1="", a2="", obs="Respaldo"

═══════════════════════════════════════════════

RESPONDE SOLO CON EL JSON:
{"piezas":[{"material":"ROBLE GRIS","qty":2,"largo":4200,"ancho":3300,"veta":"1-Longitud","l1":"G","l2":"D","a1":"D","a2":"D","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":"R. Costados"}]}`;

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
