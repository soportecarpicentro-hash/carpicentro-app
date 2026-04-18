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

  const prompt = `Eres el lector de listas de corte de CARPICENTRO (Lima, Perú).
TÓMATE EL TIEMPO NECESARIO. Es mejor ser lento y preciso que rápido y equivocado.

════════════════════════════════════════
PASO 1 — MATERIAL
════════════════════════════════════════
Lee el nombre escrito arriba de la lista. Ejemplos: "MELA PELIKANO PAMELA", "ROBLE GRIS".
Aplica ese material a todas las piezas. Sin nombre → "MELA PELIKANO BLANCO"

════════════════════════════════════════
PASO 2 — UNIDAD DE MEDIDA
════════════════════════════════════════
Si los números tienen decimales como 109.8, 54.2, 52.9 → están en CM → multiplicar x10 para convertir a MM.
Si son enteros grandes como 420, 1982, 864 → ya son MM.
Regla: largo < 300 probablemente es CM → multiplicar x10.
Ejemplos: 109.8cm→1098mm | 54.2cm→542mm | 73.0cm→730mm | 38.2cm→382mm

════════════════════════════════════════
PASO 3 — IDENTIFICAR EL PATRÓN DE POSICIÓN
════════════════════════════════════════
Mira SOLO la primera pieza de la lista.
¿Las marcas de canto están ENCIMA o DEBAJO de los números?
Ese patrón se mantiene igual para TODA la lista. No analices pieza por pieza.

════════════════════════════════════════
PASO 4 — LECTURA DE CANTOS (¡MUY IMPORTANTE — SÉ PRECISO!)
════════════════════════════════════════

ANTES DE ASIGNAR UN CANTO, HAZTE ESTAS PREGUNTAS PARA CADA NÚMERO:
1. ¿Hay alguna marca REAL encima o debajo de este número? (no imagines marcas que no existen)
2. ¿Cuántas marcas hay exactamente? (cuenta con cuidado: 1 o 2)
3. ¿Qué tipo de marca es?

TIPOS DE MARCA:
  DELGADO "D" → línea recta/guion (—) encima o debajo del número
              → letra "D" escrita encima del número
              → letra "D" mal escrita que parece "O" o bolita — VER CONTEXTO (si las demás medidas usan D, esta también)
  GRUESO  "G" → línea ondulada/gusanito (≈) encima o debajo del número
              → letra "X" o "x" encima del número (NO entre medidas)
              → letra "G" escrita encima del número

  ⚠️ LA "x" ENTRE DOS NÚMEROS ("109.8 x 54.2") ES EL SEPARADOR — NO ES CANTO. IGNORAR.
  ⚠️ SI NO VES NINGUNA MARCA CLARAMENTE → L1="", L2="", A1="", A2="" (sin canto)
  ⚠️ NO INVENTES CANTOS. Si tienes duda → dejar vacío y poner en obs="REVISAR: canto dudoso"

CUANDO EL CLIENTE ESCRIBE LETRAS (D, G):
  Si una medida tiene "D" escrita encima → canto delgado en ese lado.
  Si parece una "O" o bolita pero OTRAS medidas tienen "D" → asumir que también es "D".
  Si una medida tiene "G" escrita encima → canto grueso en ese lado.
  El contexto del resto de la lista ayuda a confirmar qué letra es.

CANTIDAD DE MARCAS → CUÁNTOS LADOS LLEVAN CANTO:
  Sin marca visible      → L1="",  L2=""   (sin canto en este lado)
  1 sola marca encima    → L1=tipo, L2=""  (solo un lado)
  1 sola marca debajo    → L1=tipo, L2=""  (solo un lado — según patrón)
  2 marcas (arriba+abajo)→ L1=tipo1, L2=tipo2 (ambos lados)

ASIGNACIÓN L1 L2 para el LARGO:
  2 líneas rectas (— —)       → L1="D", L2="D"
  2 X (X X) o 2 gusanitos     → L1="G", L2="G"
  1 línea + 1 gusanito/X      → L1="D", L2="G"  (recta=D, gusanito/X=G)
  1 gusanito/X + 1 línea      → L1="G", L2="D"
  Letras "D" "G"              → asignar según posición arriba/abajo
  1 sola línea recta          → L1="D", L2=""
  1 solo gusanito/X           → L1="G", L2=""
  Ninguna marca               → L1="",  L2=""

MISMA LÓGICA para el ANCHO → A1 y A2:
  2 líneas rectas → A1="D", A2="D"
  2 X/gusanitos   → A1="G", A2="G"
  1 sola línea    → A1="D", A2=""
  Sin marcas      → A1="",  A2=""

════════════════════════════════════════
PASO 5 — PERFORACIÓN
════════════════════════════════════════
Puntos (·, •, ..., o,o) debajo de un número = perforaciones.
  Número de puntos = perf_cant
  Número de la medida donde están = perf_lado
  perf_det = "NP/LADO"
Ejemplo: 3 puntos debajo de 109.8cm (→1098mm) → perf_cant="3", perf_lado="1098", perf_det="3P/1098"

════════════════════════════════════════
PASO 6 — RANURA
════════════════════════════════════════
"R LIBRE-ESPE-PROF" junto a una medida:
  "R 18-4-7" junto al largo 50.0cm(→500mm) → ran_libre="18", ran_espe="4", ran_prof="7", ran_lado="500"
  "R 12-6-7" junto al largo 110cm(→1100mm) → ran_libre="12", ran_espe="6", ran_prof="7", ran_lado="1100"

════════════════════════════════════════
EJEMPLOS VERIFICADOS (lista MELA PELIKANO PAMELA, CM, patrón encima)
════════════════════════════════════════
  4(109.8×54.2): 2 líneas sobre 109.8→L1=D,L2=D | 3 puntos debajo→perf | 2 líneas sobre 54.2→A1=D,A2=D
  1(52.9×10.0):  2 líneas sobre 52.9→L1=D,L2=D  | sin marcas sobre 10.0→A1="",A2=""
  2(38.2×13.0):  2 X sobre 38.2→L1=G,L2=G       | 2 X sobre 13.0→A1=G,A2=G
  2(73.0×33.0):  línea+X sobre 73.0→L1=D,L2=G   | 1 sola línea sobre 33.0→A1=D,A2=""
  4(50.0×11.0):  1 línea sobre 50.0→L1=D,L2=""  | sin marcas→A1="",A2="" | R 18-4-7 lado=500

════════════════════════════════════════
PASO 7 — OBSERVACIONES
════════════════════════════════════════
Texto descriptivo junto a la pieza → obs (ej: "R. Costados", "Techo Pso")
Texto al final que no son piezas (cantidades de otros materiales: "2.5pl", "5 ScorM") → IGNORAR
Ilegible → obs="REVISAR: descripción"

════════════════════════════════════════
RESPUESTA — SOLO JSON
════════════════════════════════════════
{"piezas":[
  {"material":"MELA PELIKANO PAMELA","qty":4,"largo":1098,"ancho":542,"veta":"1-Longitud",
   "l1":"D","l2":"D","a1":"D","a2":"D",
   "perf_cant":"3","perf_lado":"1098","perf_det":"3P/1098",
   "ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":""}
]}

Campos: material(str) | qty(int) | largo,ancho(int mm) | veta("1-Longitud"|"2-Ancho"|"Sin veta")
  l1,l2,a1,a2("D"|"G"|"") | perf_cant,perf_lado,perf_det(str) | ran_libre,ran_espe,ran_prof,ran_lado,ran_det(str) | obs(str)

SOLO EL JSON.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 4096,
        messages: [{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type: media_type||'image/jpeg', data: imagen_b64 }},
          { type:'text', text: prompt }
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
    try { parsed=JSON.parse(match[0]); }
    catch(e) { return res.status(422).json({ error:'JSON inválido', raw:match[0].slice(0,300) }); }
    if (!parsed.piezas||!Array.isArray(parsed.piezas))
      return res.status(422).json({ error:'Sin piezas', parsed });
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
