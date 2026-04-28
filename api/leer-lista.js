// api/leer-lista.js — Claude Vision CARPICENTRO v13
// Prompt experto en órdenes de corte manuscritas

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
  // FASE 1: Experto analiza la imagen
  // ══════════════════════════════════════════════════════
  const F1 = `Actúa como un sistema experto en interpretación de órdenes de corte de melamina escritas a mano.
Tu tarea es leer esta imagen y extraer todas las piezas con alta precisión.

═══ REGLA 1: UNIDADES ═══
Las medidas pueden venir en mm, cm o metros. Convierte TODO a milímetros:
  1.20 m → 1200 mm | 60 cm → 600 mm | 420 cm → 4200 mm
  Si el número es entero sin unidad indicada: dejarlo tal cual (asume mm).
  Si tiene decimal con coma o punto (ej: 116.9): probablemente cm → 1169 mm.
  Corrige números mal escritos si el contexto lo sugiere (ej: "116.9" probablemente es 1169 mm).

═══ REGLA 2: FORMATO DE PIEZAS ═══
Cada línea sigue el patrón: [cantidad] de [largo] x [ancho]  o  [cantidad]([largo]x[ancho])
Extrae: cantidad, largo_mm, ancho_mm.

═══ REGLA 3: ENCHAPE DE CANTOS ═══
Detecta símbolos escritos A MANO cerca de los números (pueden ser de cualquier color):
  Línea recta (─ == ══) → canto DELGADO = "D"
  Línea ondulada (≈ ~~~) → canto GRUESO = "G"
  Palo vertical (|) → "D"
  Letra X encima del número → "G"
  Letra D encima → "D"
  Letra G encima → "G"
  Letra DM → "DM" (delgado distinto color)
  Letra GM → "GM" (grueso distinto color)
  Puntos (° oo) → PERFORACIÓN (no es canto)

═══ REGLA 4: POSICIÓN Y CONTEO ═══
La posición de los símbolos respecto al número determina el canto:
  Símbolo más CERCANO al número → L1 (o A1 para el ancho)
  Símbolo más LEJANO → L2 (o A2)
  1 símbolo → L1=tipo, L2=""
  2 símbolos → L1=tipo_cercano, L2=tipo_lejano  ← AMBOS, no dejar vacío

PATRÓN: Detecta si los símbolos van arriba o abajo en la primera pieza y mantén ese patrón.
Aprende el estilo del cliente y aplícalo de forma consistente en toda la hoja.

═══ REGLA 5: CONTEXTO Y MATERIAL ═══
Si hay un título (ej: "Melamina Pelikano Blanco", "MDF Blanco") → agrupa piezas por material.
Nuevo encabezado en mitad de lista → cambia el material desde esa pieza.

═══ REGLA 6: ERRORES HUMANOS ═══
Ignora tachones y zonas ilegibles.
Si algo es ambiguo, márcalo con obs="REVISAR: [descripción]".
No inventes datos — si no ves canto, deja vacío "".

═══ REGLA 7: RANURA Y PERFORACIÓN ═══
Ranura: "RAN", "R", "RA" + números → ran_libre / ran_espe / ran_prof / ran_lado.
  Sin números → obs="Indicar especificaciones de ranura".
Perforación: puntos junto a un número → perf_cant=N, perf_lado=número, perf_det="NP/número".

Describe ahora CADA pieza de la imagen:
PIEZA [N]: [cant]×[largo_mm]×[ancho_mm]
  LARGO símbolos: [describe trazos manuales y cantidad]
  ANCHO símbolos: [describe trazos manuales y cantidad]
  PUNTOS: [si hay, junto a cuál número]
  EXTRA: [texto, ranura, obs]

Al inicio: MATERIAL, COLUMNAS, PATRÓN DETECTADO (arriba/abajo/inline).`;

  // ══════════════════════════════════════════════════════
  // FASE 2: Convertir a JSON del sistema CARPICENTRO
  // ══════════════════════════════════════════════════════
  const F2 = `Convierte tu análisis al JSON del sistema CARPICENTRO.

CAMPOS REQUERIDOS por pieza:
  material, qty, largo (mm), ancho (mm), veta ("1-Longitud"|"2-Ancho"|"Sin veta")
  l1, l2  → cantos del LARGO  ("D"|"G"|"DM"|"GM"|"Dx"|"Dz"|"Gx"|"Gz"|"")
  a1, a2  → cantos del ANCHO  (mismos valores)
  perf_cant, perf_lado, perf_det  → perforación ("" si no hay)
  ran_libre, ran_espe, ran_prof, ran_lado, ran_det  → ranura ("" si no hay)
  obs  → observaciones o ""

CANTOS — basado en tu descripción:
  0 símbolos → l1="", l2=""
  1 recta/D/|  → l1="D", l2=""
  2 rectas    → l1="D", l2="D"
  1 gusanito/G/X → l1="G", l2=""
  2 gusanitos → l1="G", l2="G"
  gusanito(cercano)+recta(lejana) → l1="G", l2="D"
  recta(cercana)+gusanito(lejana) → l1="D", l2="G"
  (misma lógica para a1, a2)

CONFIANZA: Si detectas más del 80% de las piezas con certeza, genera el JSON completo.
Para piezas dudosas usa obs="REVISAR: motivo".

RESPONDE SOLO CON EL JSON — sin texto antes ni después:
{"piezas":[{
  "material":"MELA PELIKANO BLANCO",
  "qty":2,"largo":1982,"ancho":580,"veta":"1-Longitud",
  "l1":"D","l2":"D","a1":"D","a2":"",
  "perf_cant":"2","perf_lado":"1982","perf_det":"2P/1982",
  "ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"",
  "obs":""
}]}`;

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
