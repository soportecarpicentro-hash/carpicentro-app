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

  const prompt = `Eres el lector de listas de corte de CARPICENTRO (Lima, Perú). Tómate el tiempo necesario para leer la imagen con precisión.

════════════════════════════════
PASO 1 — IDENTIFICAR MATERIAL
════════════════════════════════
Busca el nombre escrito en la parte superior de la lista.
Ejemplos: "ROBLE GRIS", "BLANCO", "CARAMELO PELIKANO", "MDF TRUPAN 18mm"
Ese material aplica a TODAS las piezas de esa sección.
Si no hay nombre de material → "MELA PELIKANO BLANCO"

════════════════════════════════
PASO 2 — IDENTIFICAR EL PATRÓN DE POSICIÓN (¡CRÍTICO!)
════════════════════════════════
Mira SOLO la primera pieza de la lista.
Observa si las líneas decorativas están ENCIMA o DEBAJO de los números.
Ese patrón (encima o debajo) se mantiene IGUAL para todas las piezas.
No analices pieza por pieza — el patrón es consistente en toda la lista.

════════════════════════════════
PASO 3 — LEER CADA PIEZA
════════════════════════════════
Formato típico: (CANTIDAD) LARGO x ANCHO [observación opcional]
Ejemplo: "② 420 x 330" → qty=2, largo=420mm, ancho=330mm

INTERPRETACIÓN DE LÍNEAS SOBRE EL LARGO:
Las líneas sobre el número LARGO determinan L1 y L2.
El número de líneas dice cuántos lados llevan canto:

  Sin líneas           → L1="",  L2=""
  1 línea recta sola   → L1="D", L2=""   (un solo lado delgado)
  1 gusanito solo      → L1="G", L2=""   (un solo lado grueso)
  Recta ENCIMA + Recta DEBAJO  → L1="D", L2="D"  (ambos lados delgado)
  Gusanito ENCIMA + Gusanito DEBAJO → L1="G", L2="G"  (ambos lados grueso)
  Recta ENCIMA + Gusanito DEBAJO    → L1="D", L2="G"
  Gusanito ENCIMA + Recta DEBAJO    → L1="G", L2="D"

IMPORTANTE — PATRÓN DE POSICIÓN:
Si el patrón de la lista es "líneas ENCIMA":
  La línea de arriba define L1, la de abajo define L2. (igual que la tabla arriba)
Si el patrón es "líneas DEBAJO":
  La lógica se invierte: la línea de abajo define L1, la de arriba define L2.
  Ejemplo con patrón DEBAJO: Recta DEBAJO + Gusanito ENCIMA → L1="D", L2="G"

MISMA LÓGICA PARA EL ANCHO (A1 y A2):
Las líneas sobre/bajo el número ANCHO determinan A1 y A2.
  Sin líneas         → A1="",  A2=""
  2 líneas rectas    → A1="D", A2="D"
  2 gusanitos        → A1="G", A2="G"
  Recta + Gusanito   → A1="D", A2="G"  (según posición)

════════════════════════════════
EJEMPLO COMPLETO VERIFICADO
(lista real con patrón ENCIMA, material ROBLE GRIS)
════════════════════════════════
  ② 420 x 330:  sobre 420: recta↑ + gusanito↓ → L1=D,L2=G | sobre 330: recta↑ + recta↓ → A1=D,A2=D
  ② 864 x 330:  sobre 864: recta↑ + gusanito↓ → L1=D,L2=G | sobre 330: recta↑ + recta↓ → A1=D,A2=D
  ② 864 x 80:   sobre 864: recta↑ + recta↓   → L1=D,L2=D | sobre 80:  recta↑ + recta↓ → A1=D,A2=D
  ② 372 x 422:  sobre 372: gusanito↑+gusanito↓→ L1=G,L2=G | sobre 422: gusanito↑+gusanito↓→A1=G,A2=G
  ② 900 x 330:  sobre 900: recta↑ + gusanito↓ → L1=D,L2=G | sobre 330: recta↑ + recta↓ → A1=D,A2=D
  ② 414 x 330:  sobre 414: gusanito↑ + recta↓ → L1=G,L2=D | sobre 330: recta↑ + recta↓ → A1=D,A2=D

════════════════════════════════
PERFORACIÓN
════════════════════════════════
Indicada con puntos (o,o), letra P o "2P/1982":
  perf_cant = número (ej: "2")
  perf_lado = medida del lado (ej: "1982")
  perf_det  = detalle completo (ej: "2P/1982")

════════════════════════════════
RANURA
════════════════════════════════
Formato R/LIBRE/ESPE/PROF con lado:
  "R/18/3/8" lado=580 → ran_libre="18", ran_espe="3", ran_prof="8", ran_lado="580"

════════════════════════════════
OBSERVACIONES
════════════════════════════════
Si hay texto legible adicional por pieza (ej: "R. Costados", "Techo Pso", "Divina") → ponlo en obs.
Si algo es realmente ilegible → obs="REVISAR: [descripción corta]"
IGNORAR: dibujos, nombres de personas, fechas, marcas de agua.

════════════════════════════════
RESPUESTA — SOLO JSON
════════════════════════════════
Sin texto adicional, sin markdown, sin bloques de código:

{"piezas":[
  {"material":"ROBLE GRIS","qty":2,"largo":420,"ancho":330,"veta":"1-Longitud",
   "l1":"D","l2":"G","a1":"D","a2":"D",
   "perf_cant":"","perf_lado":"","perf_det":"",
   "ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"",
   "obs":"R. Costados"}
]}

Tipos de valores:
- material: string
- qty: entero positivo
- largo, ancho: enteros en mm
- veta: "1-Longitud" | "2-Ancho" | "Sin veta"
- l1,l2,a1,a2: "D"|"G"|"Dx"|"Dy"|"Dz"|"Gx"|"Gy"|"Gz"|""
- perf_cant,perf_lado,perf_det: string ("" si no hay)
- ran_libre,ran_espe,ran_prof,ran_lado,ran_det: string ("" si no hay)
- obs: string

SOLO EL JSON.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model:'claude-sonnet-4-6', max_tokens:4096,
        messages:[{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type:media_type||'image/jpeg', data:imagen_b64 }},
          { type:'text', text:prompt }
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
