// api/leer-lista.js — Claude Vision para listas de corte CARPICENTRO
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { imagen_b64, media_type } = req.body;
  if (!imagen_b64) return res.status(400).json({ error: 'Se requiere imagen_b64' });
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  // ── PARÁMETROS DE INTERPRETACIÓN (según formato CARPICENTRO) ──
  const prompt = `Eres el sistema de lectura de listas de corte de CARPICENTRO (Lima, Perú).
Lee la imagen y extrae TODAS las piezas de corte siguiendo EXACTAMENTE estos parámetros:

═══ REGLAS DE CANTO (enchape) ═══
— (línea simple, guion) debajo o encima de la medida = canto DELGADO = "D"
≈ o ~~~ (línea doble/ondulada) debajo o encima de la medida = canto GRUESO = "G"
La posición de la línea indica el lado:
  Línea sobre el número LARGO → L1 = canto lado largo superior
  Línea bajo el número LARGO  → L2 = canto lado largo inferior
  Línea sobre el número ANCHO → A1 = canto lado ancho izquierdo  
  Línea bajo el número ANCHO  → A2 = canto lado ancho derecho

EJEMPLO CONCRETO (de los parámetros reales):
  420 x 330 con línea simple encima y doble debajo del largo, simple en los anchos:
  → largo=420, ancho=330, L1="D", L2="G", A1="D", A2="D"
  El mismo ejemplo con la línea abajo también es válido — interpretar según posición real.

También pueden escribir el canto CON LETRAS debajo del diagrama:
  D = delgado en ese lado, G = grueso en ese lado
  "D G D D" debajo de la pieza → L1=D, L2=G, A1=D, A2=D

═══ REGLAS DE PERFORACIÓN ═══
Se indica con: puntos (o,o) sobre la pieza, letra "P" o "Perf", o notación "2P/1982"
  perf_cant = número de perforaciones (ej: "2")
  perf_lado = medida del lado donde va la perforación (ej: "1982")  
  perf_det  = descripción completa (ej: "2P/1982" o "o,o S0")

EJEMPLO: pieza 1982 x 580 con "o,o" y "2P/1982":
  → perf_cant="2", perf_lado="1982", perf_det="2P/1982"

═══ REGLAS DE RANURA ═══
Se indica con "R" o ranura, formato R/LIBRE/ESPE/PROF con lado indicado aparte
  ran_libre = medida libre (ej: "18")
  ran_espe  = espesor (ej: "3")
  ran_prof  = profundidad (ej: "8")
  ran_lado  = lado donde va la ranura (ej: "580")
  ran_det   = descripción adicional

EJEMPLO: "R/18/3/8" con lado D=580:
  → ran_libre="18", ran_espe="3", ran_prof="8", ran_lado="580", ran_det=""

═══ MEDIDAS ═══
Siempre en milímetros. "420 x 330" → largo=420, ancho=330.
Formato "4= 420x330" o "4→ 420x330" → qty=4, largo=420, ancho=330.
Secciones por material: aplicar ese material a todas sus piezas.
Material por defecto: "MELA PELIKANO BLANCO"
IGNORAR dibujos de muebles, bocetos y flechas decorativas.

═══ RESPUESTA ═══
SOLO JSON válido, sin texto adicional ni bloques de código:

{"piezas":[{"material":"MELA PELIKANO BLANCO","qty":2,"largo":420,"ancho":330,"veta":"1-Longitud","l1":"D","l2":"G","a1":"D","a2":"D","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":""}]}

Campos obligatorios:
- material: string
- qty: entero positivo
- largo, ancho: enteros en mm
- veta: "1-Longitud" | "2-Ancho" | "Sin veta"  
- l1,l2,a1,a2: "D"|"G"|"Dx"|"Dy"|"Dz"|"Gx"|"Gy"|"Gz"|""
- perf_cant,perf_lado,perf_det: string (vacío si no hay perforación)
- ran_libre,ran_espe,ran_prof,ran_lado,ran_det: string (vacío si no hay ranura)
- obs: "" o "REVISAR: [descripción]" si algo es ilegible o ambiguo

SOLO EL JSON.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 4096,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: media_type||'image/jpeg', data: imagen_b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    if (!r.ok) { const e=await r.text(); return res.status(502).json({ error:'Error API', detalle:e.slice(0,200) }); }
    const data = await r.json();
    const texto = (data.content||[]).map(c=>c.text||'').join('');
    const clean = texto.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.status(422).json({ error:'Sin JSON', raw:texto.slice(0,300) });
    let parsed;
    try { parsed=JSON.parse(match[0]); } catch(e) { return res.status(422).json({ error:'JSON inválido', raw:match[0].slice(0,300) }); }
    if (!parsed.piezas||!Array.isArray(parsed.piezas)) return res.status(422).json({ error:'Sin piezas', parsed });
    parsed.piezas = parsed.piezas.map(p => ({
      material: p.material||'MELA PELIKANO BLANCO',
      qty: Math.max(1, parseInt(p.qty)||1),
      largo: Math.round(parseFloat(String(p.largo).replace(',','.'))||0),
      ancho: Math.round(parseFloat(String(p.ancho).replace(',','.'))||0),
      veta: p.veta||'1-Longitud',
      l1:p.l1||'', l2:p.l2||'', a1:p.a1||'', a2:p.a2||'',
      perf_cant:String(p.perf_cant||''), perf_lado:String(p.perf_lado||''), perf_det:String(p.perf_det||''),
      ran_libre:String(p.ran_libre||''), ran_espe:String(p.ran_espe||''), ran_prof:String(p.ran_prof||''),
      ran_lado:String(p.ran_lado||''), ran_det:String(p.ran_det||''),
      obs: p.obs||''
    }));
    return res.status(200).json(parsed);
  } catch(err) {
    return res.status(500).json({ error:'Error interno', detalle:err.message });
  }
}
