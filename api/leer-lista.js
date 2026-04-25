// api/leer-lista.js — Claude Vision CARPICENTRO v6
// FIX: detección explícita de líneas rectas (D) que la IA ignoraba

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
      try { data = JSON.parse(raw); } catch (_) { throw new Error('API texto no-JSON: ' + raw.slice(0, 100)); }
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
    for (const rep of [js.slice(0, js.lastIndexOf('},') + 1) + ']}', js.slice(0, js.lastIndexOf('}') + 1) + ']}']) {
      try { const p = JSON.parse(rep); if (p?.piezas?.length) return p; } catch (_) {}
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

  // ══════════════════════════════════════════════════════════════════════
  // FASE 1 — Descripción visual MUY explícita sobre los dos tipos de líneas
  // ══════════════════════════════════════════════════════════════════════
  const F1 = `Analiza esta lista de corte de carpintería. Es CRÍTICO que distingas dos tipos de líneas:

═══ LOS DOS TIPOS DE LÍNEA ═══

LÍNEA CONTINUA RECTA (——): Una raya horizontal plana, sin curvas, como un guion largo.
→ Esta significa CANTO DELGADO = "D"
→ Puede parecer el subrayado de un texto o una raya simple debajo/encima del número

LÍNEA ONDULADA GUSANITO (≈≈≈): Una raya con ondas o curvas, como el símbolo de "aproximado" ≈
→ Esta significa CANTO GRUESO = "G"
→ Se parece a una ola del mar o a una serpiente

═══ REGLA FUNDAMENTAL ═══
Si hay UNA línea sobre un número → ese lado lleva canto, el otro no
Si hay DOS líneas sobre un número → ambos lados llevan canto

═══ INSTRUCCIÓN ═══
Para CADA pieza de la lista, responde en este formato EXACTO:

PIEZA N: [cantidad] [LARGO]×[ANCHO]
  Sobre/bajo LARGO: [describe exactamente lo que ves - ¿recta? ¿ondulada? ¿cuántas? ¿ninguna?]
  Sobre/bajo ANCHO: [describe exactamente lo que ves]
  Texto adicional: [observación, ranura, etc. o "ninguno"]

ANTES de las piezas, responde:
- Material del encabezado: 
- Las marcas están: [ARRIBA o ABAJO de los números]
- Unidad: [CM si números pequeños con decimales, o MM si son grandes >500]
- Columnas: [cuántas]

Lee TODAS las piezas de TODAS las columnas, de izquierda a derecha.`;

  // ══════════════════════════════════════════════════════════════════════
  // FASE 2 — Conversión a JSON con reglas precisas
  // ══════════════════════════════════════════════════════════════════════
  const F2 = `Ahora convierte tu descripción al JSON. Sigue estas reglas:

UNIDAD:
- Números con decimal (57.4, 116.9) → CM → ×10 → MM
- Números enteros entre 50 y 500 (420, 864, 330, 372) → CM → ×10 → MM  
- Números enteros >500 (1960, 580, 1200) → ya MM, no convertir

CANTOS — usa exactamente lo que describiste:
Si describiste "línea recta" sobre un número → ese lado = "D"
Si describiste "línea ondulada/gusanito" → ese lado = "G"
Si describiste "ninguna" → ese lado = ""

El PATRÓN (arriba o abajo) de la primera pieza aplica a todas.
Para el LARGO: marca arriba=L1, abajo=L2 (o invertido según patrón)
Para el ANCHO: marca arriba=A1, abajo=A2 (o invertido según patrón)

1 marca sobre LARGO → L1=tipo, L2=""
2 marcas sobre LARGO → L1=tipo1, L2=tipo2
0 marcas sobre LARGO → L1="", L2=""
(misma lógica para ANCHO → A1, A2)

RANURA: "RAN", "R", "RA" + números → ran_libre/espe/prof/lado. Sin números → obs="Indicar especificaciones de ranura"

EJEMPLO VERIFICADO (Roble Gris, CM, marcas arriba):
Pieza "② 420×330": sobre 420 hay gusanito+gusanito, sobre 330 hay recta+recta
→ {"material":"ROBLE GRIS","qty":2,"largo":4200,"ancho":3300,"veta":"1-Longitud","l1":"G","l2":"G","a1":"D","a2":"D","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":"R. Costados"}

Pieza "② 864×80": sobre 864 hay gusanito, sobre 80 no hay nada
→ {"material":"ROBLE GRIS","qty":2,"largo":8640,"ancho":800,"veta":"1-Longitud","l1":"G","l2":"","a1":"","a2":"","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":"Lazo"}

RESPONDE SOLO CON EL JSON:
{"piezas":[{...}]}`;

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
      lastError = `Intento ${i}: sin piezas. Inicio: "${texto.slice(0, 120)}"`;
    } catch (e) {
      lastError = `Intento ${i}: ${e.message}`;
      if (i < 3) await new Promise(r => setTimeout(r, i * 3000));
    }
  }
  return res.status(422).json({ error: 'No se pudo leer. ' + lastError });
}
