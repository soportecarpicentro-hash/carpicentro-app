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

  const prompt = `Eres el sistema de lectura de listas de corte de CARPICENTRO (Lima, Perú).
Lee la imagen y extrae TODAS las piezas siguiendo estas reglas exactas.

═══ PASO 1: IDENTIFICAR EL MATERIAL ═══
Busca el nombre del material escrito arriba de la lista (ej: "ROBLE GRIS", "BLANCO", "CARAMELO").
Ese material aplica a TODAS las piezas de esa sección.
Si no se indica material → usar "MELA PELIKANO BLANCO".

═══ PASO 2: LEER CADA PIEZA ═══
Cada pieza tiene formato: (CANTIDAD) LARGO x ANCHO
Ejemplo: "② 420 x 330" → qty=2, largo=420, ancho=330
Las líneas decorativas encima/debajo de los números indican los cantos.

═══ PASO 3: INTERPRETAR LAS LÍNEAS DE CANTO ═══

HAY DOS TIPOS DE LÍNEA:
  — línea recta/simple = canto DELGADO = "D"
  ≈ línea ondulada/gusanito = canto GRUESO = "G"

REGLA DE POSICIÓN — CRÍTICA:
  Mira la PRIMERA pieza de la lista para determinar el patrón:
  • Si las líneas están ENCIMA de los números → la línea de arriba es L1 (largo superior) y la de abajo es L2 (largo inferior)
  • Si las líneas están DEBAJO de los números → igual: arriba=L1, abajo=L2
  TODAS las piezas siguientes usan el MISMO patrón que la primera.

REGLA DE CANTIDAD — CÓMO ASIGNAR L1, L2, A1, A2:
  Para el LARGO (determina L1 y L2):
    • 1 línea recta encima + 1 gusanito debajo → L1="D", L2="G"
    • 1 gusanito encima + 1 línea recta debajo → L1="G", L2="D"
    • 2 líneas rectas (una encima, una debajo) → L1="D", L2="D"
    • 2 gusanitos (uno encima, uno debajo) → L1="G", L2="G"
    • 1 sola línea recta (solo encima o solo debajo) → L1="D", L2="" (solo un lado)
    • 1 solo gusanito → L1="G", L2="" (solo un lado)
    • Sin líneas → L1="", L2=""

  Para el ANCHO (determina A1 y A2) — misma lógica:
    • 2 líneas rectas → A1="D", A2="D"
    • 2 gusanitos → A1="G", A2="G"
    • 1 línea recta + 1 gusanito → A1="D", A2="G" (o según posición)
    • 1 sola línea recta → A1="D", A2=""
    • Sin líneas → A1="", A2=""

EJEMPLO REAL de esta imagen de referencia (material: ROBLE GRIS, patrón: líneas encima):

  ② 420 x 330:
    Sobre 420: línea recta encima (=L1=D) + gusanito debajo (=L2=G)
    Sobre 330: línea recta encima (=A1=D) + línea recta debajo (=A2=D)
    → qty=2, largo=420, ancho=330, L1="D", L2="G", A1="D", A2="D"

  ② 864 x 330:
    Mismo patrón. Sobre 864: línea recta+gusanito → L1="D", L2="G"
    Sobre 330: dos líneas rectas → A1="D", A2="D"
    → qty=2, largo=864, ancho=330, L1="D", L2="G", A1="D", A2="D"

  ② 864 x 80:
    Sobre 864: dos líneas rectas → L1="D", L2="D"
    Sobre 80: dos líneas rectas → A1="D", A2="D"
    → qty=2, largo=864, ancho=80, L1="D", L2="D", A1="D", A2="D"

  ② 372 x 422:
    Sobre 372: dos gusanitos → L1="G", L2="G"
    Sobre 422: dos gusanitos → A1="G", A2="G"
    → qty=2, largo=372, ancho=422, L1="G", L2="G", A1="G", A2="G"

═══ PASO 4: PERFORACIÓN ═══
Indicada con puntos (o,o) sobre la pieza, o notación "2P/1982":
  perf_cant = número de perforaciones (ej: "2")
  perf_lado = medida del lado (ej: "1982")
  perf_det  = detalle (ej: "2P/1982")

═══ PASO 5: RANURA ═══
Formato R/LIBRE/ESPE/PROF con lado indicado:
  "R/18/3/8" lado=580 → ran_libre="18", ran_espe="3", ran_prof="8", ran_lado="580"

═══ PASO 6: OBSERVACIONES ═══
Si hay texto adicional legible (ej: "R. Costados", "Techo Pso", "Divina") → ponlo en obs.
Si algo es ilegible → obs="REVISAR: [descripción]"
IGNORAR: dibujos de muebles, marcas de agua, nombres de personas, fechas.

═══ RESPUESTA ═══
SOLO JSON sin texto adicional ni bloques markdown:

{"piezas":[
  {"material":"ROBLE GRIS","qty":2,"largo":420,"ancho":330,"veta":"1-Longitud","l1":"D","l2":"G","a1":"D","a2":"D","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":"R. Costados"}
]}

Campos:
- material: string (del encabezado de la sección)
- qty: entero positivo
- largo, ancho: enteros en mm
- veta: "1-Longitud" | "2-Ancho" | "Sin veta"
- l1,l2,a1,a2: "D"|"G"|"Dx"|"Dy"|"Dz"|"Gx"|"Gy"|"Gz"|""
- perf_cant,perf_lado,perf_det: string ("" si no hay)
- ran_libre,ran_espe,ran_prof,ran_lado,ran_det: string ("" si no hay)
- obs: string con texto adicional de la pieza, o "" si no hay

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
