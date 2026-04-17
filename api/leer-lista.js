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
Lee la imagen y extrae TODAS las piezas siguiendo estas reglas exactas:

═══ REGLA DE CANTOS — MUY IMPORTANTE ═══

Cada medida tiene LARGO y ANCHO. Los cantos se indican con líneas decorando los números:

TIPO DE LÍNEA:
  — (línea simple/recta)   = canto DELGADO = "D"
  ≈ (línea ondulada/gusanito) = canto GRUESO = "G"

CANTIDAD DE LÍNEAS indica cuántos lados llevan canto:
  1 sola línea  = solo UN lado de esa medida lleva canto (el otro queda vacío "")
  2 líneas      = AMBOS lados de esa medida llevan canto

POSICIÓN de las líneas (arriba o abajo del número):
  La PRIMERA medida de la lista establece el patrón de posición:
  - Si en la primera medida las líneas están ARRIBA del largo → L1 es el lado con canto, L2 es el opuesto
  - Si en la primera medida las líneas están ABAJO del largo → L2 es el lado con canto, L1 es el opuesto
  TODAS las medidas siguientes usan el MISMO patrón de posición que la primera.

EJEMPLOS COMPLETOS:

Ejemplo A — líneas arriba del largo (patrón: arriba=L1, abajo=L2):
  Línea simple arriba + gusanito arriba del LARGO:  L1="D", L2="" (un solo canto delgado arriba)
  Gusanito arriba del LARGO:                        L1="G", L2="" (un solo canto grueso arriba)
  2 líneas simples del LARGO (arriba y abajo):      L1="D", L2="D" (ambos lados delgado)
  2 gusanitos del LARGO:                            L1="G", L2="G" (ambos lados grueso)
  Línea simple arriba + gusanito abajo del LARGO:   L1="D", L2="G" (delgado arriba, grueso abajo)

Ejemplo B — líneas abajo del largo (patrón: abajo=L1, arriba=L2):
  Línea simple abajo del LARGO:   L1="D", L2=""
  2 líneas abajo del LARGO:       L1="D", L2="D"  ← misma lógica, diferente posición física

Para el ANCHO (A1/A2) aplica la misma lógica pero mirando izquierda/derecha del número de ancho.
  Si no hay líneas en el ancho → A1="", A2=""
  Si hay 1 línea en el ancho → un solo lado lleva canto
  Si hay 2 líneas en el ancho → A1 y A2 llevan canto

A VECES los cantos se escriben con LETRAS en vez de líneas:
  Letras bajo el diagrama de la pieza: "D G D D" → L1=D, L2=G, A1=D, A2=D
  Letras "DD" = ambos largos delgado, "GG" = ambos largos grueso
  Letra sola "D" = un lado delgado, "G" = un lado grueso

═══ PERFORACIÓN ═══
Indicada con puntos (o,o), letra P o notación "2P/1982":
  perf_cant = número de perforaciones (ej: "2")
  perf_lado = medida del lado (ej: "1982")
  perf_det  = detalle completo (ej: "2P/1982")

═══ RANURA ═══
Indicada con "R" o formato R/LIBRE/ESPE/PROF:
  ran_libre="18", ran_espe="3", ran_prof="8", ran_lado="580"
  Ejemplo "R/18/3/8" lado=580 → ran_libre=18, ran_espe=3, ran_prof=8, ran_lado=580

═══ MEDIDAS ═══
Siempre en milímetros. "420 x 330" → largo=420, ancho=330.
"4→ 420x330" o "4= 420x330" → qty=4, largo=420, ancho=330.
Si hay secciones por material (Blanco, Caramelo, etc.) → aplicar ese material a sus piezas.
Material por defecto si no se indica: "MELA PELIKANO BLANCO"
IGNORAR completamente dibujos, bocetos y flechas de muebles.

═══ RESPUESTA ═══
SOLO JSON sin texto adicional ni markdown:

{"piezas":[{"material":"MELA PELIKANO BLANCO","qty":2,"largo":420,"ancho":330,"veta":"1-Longitud","l1":"D","l2":"G","a1":"D","a2":"D","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":""}]}

Campos:
- material: string
- qty: entero positivo
- largo, ancho: enteros en mm
- veta: "1-Longitud" | "2-Ancho" | "Sin veta"
- l1,l2,a1,a2: "D"|"G"|"Dx"|"Dy"|"Dz"|"Gx"|"Gy"|"Gz"|""
- perf_cant,perf_lado,perf_det: string ("" si no hay)
- ran_libre,ran_espe,ran_prof,ran_lado,ran_det: string ("" si no hay)
- obs: "" o "REVISAR: [descripción]" solo si algo es realmente ilegible

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
