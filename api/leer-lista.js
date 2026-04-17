// api/leer-lista.js — Proxy Claude Vision (Anthropic)
// Lee listas de corte manuscritas y devuelve JSON estructurado

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imagen_b64, media_type } = req.body;
  if (!imagen_b64) return res.status(400).json({ error: 'Se requiere imagen_b64' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  const prompt = `Eres experto en listas de corte de melamina para carpintería en Perú (empresa CARPICENTRO).
Tu tarea: leer esta imagen y extraer TODAS las piezas en formato JSON.

=== SÍMBOLOS Y CONVENCIONES ===

CANTOS (enchape de bordes):
  — (línea simple, guion)  = D  (canto delgado)
  ≈ o ~~~ (línea doble/ondulada) = G  (canto grueso)
  La línea DEBAJO de la medida indica canto en ese lado
  Si la línea está ARRIBA → L1 (largo superior)
  Si está ABAJO → L2 (largo inferior)  
  Si está a la IZQUIERDA → A1 (ancho izquierdo)
  Si está a la DERECHA → A2 (ancho derecho)
  Ejemplo: "420 x 330" con línea simple debajo y doble arriba → L1=G, L2=D
  Ejemplo: "420 x 330" con líneas en todos los lados → L1=D o G según tipo de línea

PERFORACIÓN (puntos o "o,o" o "R" con "P"):
  Se indica con puntos sobre la pieza o notación "P" o "Perf"
  Formato: PERF CANT = número de perforaciones, PERF LADO = medida (ej: "1982"), PERF DETALLE = descripción
  Ejemplo: "o,o" con "2P/1982" → perf_cant=2, perf_lado=1982, perf_det="2P/1982"

RANURA (indicada con "R" o línea interna):
  Formato R/LIBRE/ESPE/PROF → ran_libre=LIBRE, ran_espe=ESPE, ran_prof=PROF
  El LADO de ranura va en ran_lado
  Ejemplo: "R/18/3/8" con lado=580 → ran_libre=18, ran_espe=3, ran_prof=8, ran_lado=580

FORMATOS DE MEDIDAS:
  "420 x 330" → Largo=420mm, Ancho=330mm (siempre en mm)
  "4→ 420x330" o "4= 420x330" → 4 piezas, Largo=420, Ancho=330
  Si las medidas parecen estar en cm (valores < 30), multiplica x 10

MATERIAL por defecto si no se indica: "MELA PELIKANO BLANCO"
Secciones separadas por color/material: aplicar ese material a todas sus piezas.
IGNORA completamente dibujos, bocetos, flechas decorativas y esquemas de muebles.

=== RESPUESTA ===
SOLO JSON, sin texto adicional, sin bloques markdown:

{"piezas":[
  {"material":"MELA PELIKANO BLANCO","qty":1,"largo":420,"ancho":330,"veta":"1-Longitud",
   "l1":"G","l2":"D","a1":"D","a2":"D",
   "perf_cant":"","perf_lado":"","perf_det":"",
   "ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"",
   "obs":""}
]}

Campos:
- material: string
- qty: entero
- largo, ancho: enteros en mm
- veta: "1-Longitud" | "2-Ancho" | "Sin veta"
- l1,l2,a1,a2: "D"|"G"|"Dx"|"Dy"|"Dz"|"Gx"|"Gy"|"Gz"|""
- perf_cant,perf_lado,perf_det: strings (vacío si no hay)
- ran_libre,ran_espe,ran_prof,ran_lado,ran_det: strings (vacío si no hay)
- obs: "" o "REVISAR: xxx" si hay duda

SOLO EL JSON.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: imagen_b64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'Error API Claude', status: response.status, detalle: err.slice(0,200) });
    }

    const data = await response.json();
    const texto = (data.content || []).map(c => c.text || '').join('');
    const clean = texto.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.status(422).json({ error: 'Sin JSON en respuesta', raw: texto.slice(0,300) });

    let parsed;
    try { parsed = JSON.parse(match[0]); }
    catch(e) { return res.status(422).json({ error: 'JSON inválido', raw: match[0].slice(0,300) }); }

    if (!parsed.piezas || !Array.isArray(parsed.piezas))
      return res.status(422).json({ error: 'Sin campo piezas', parsed });

    parsed.piezas = parsed.piezas.map(p => ({
      material: p.material || 'MELA PELIKANO BLANCO',
      qty: Math.max(1, parseInt(p.qty) || 1),
      largo: Math.round(parseFloat(String(p.largo).replace(',','.')) || 0),
      ancho: Math.round(parseFloat(String(p.ancho).replace(',','.')) || 0),
      veta: p.veta || '1-Longitud',
      l1: p.l1 || '', l2: p.l2 || '', a1: p.a1 || '', a2: p.a2 || '',
      perf_cant: String(p.perf_cant || ''), perf_lado: String(p.perf_lado || ''), perf_det: String(p.perf_det || ''),
      ran_libre: String(p.ran_libre || ''), ran_espe: String(p.ran_espe || ''), ran_prof: String(p.ran_prof || ''),
      ran_lado: String(p.ran_lado || ''), ran_det: String(p.ran_det || ''),
      obs: p.obs || ''
    }));

    return res.status(200).json(parsed);

  } catch(err) {
    return res.status(500).json({ error: 'Error interno', detalle: err.message });
  }
}
