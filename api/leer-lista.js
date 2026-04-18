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

  const prompt = `Eres el lector especializado de listas de corte de CARPICENTRO (Lima, Perú).
Analiza con calma y precisión. Es mejor tomarte más tiempo que equivocarte.

════════════════════════════════════════
PASO 1 — MATERIAL
════════════════════════════════════════
Lee el nombre escrito en la parte superior (ej: "MELA PELIKANO PAMELA", "ROBLE GRIS").
Aplica ese material a todas las piezas de la sección.
Si no hay nombre → "MELA PELIKANO BLANCO"

════════════════════════════════════════
PASO 2 — UNIDAD DE MEDIDA (¡MUY IMPORTANTE!)
════════════════════════════════════════
Detecta si las medidas están en CM o MM:
- Si los números tienen decimales como 109.8, 54.2, 52.9 → están en CM → multiplicar x10 para convertir a MM
- Si los números son enteros grandes como 420, 1982, 864 → ya están en MM → no convertir
- Regla práctica: si el número del largo es menor a 300, probablemente es CM → multiplicar x10

Ejemplos de conversión CM→MM:
  109.8 cm → 1098 mm
  54.2 cm  → 542 mm
  52.9 cm  → 529 mm
  10.0 cm  → 100 mm
  38.2 cm  → 382 mm
  73.0 cm  → 730 mm

════════════════════════════════════════
PASO 3 — FORMATO DE CADA PIEZA
════════════════════════════════════════
Formato: (CANTIDAD) LARGO x ANCHO [observaciones]
La "x" entre los dos números es el separador de medidas — NO es canto.
Ejemplo: "4(109.8 x 54.2)" → qty=4, largo=109.8cm=1098mm, ancho=54.2cm=542mm

════════════════════════════════════════
PASO 4 — CANTOS (L1, L2, A1, A2)
════════════════════════════════════════
Los cantos se indican con marcas ENCIMA o DEBAJO de los números de medida.

TIPOS DE MARCA — canto DELGADO "D":
  — (línea recta/guion encima o debajo del número)

TIPOS DE MARCA — canto GRUESO "G":
  ≈ (línea ondulada/gusanito encima o debajo del número)
  X o x (letra X encima del número, NO entre medidas)
  ⚠️ IMPORTANTE: la "x" ENTRE los números (ej: "109.8 x 54.2") es el separador y NO es canto.
     Solo las X que están ENCIMA o DEBAJO de un número individual indican canto grueso.

REGLA DE CANTIDAD — cuántos lados llevan canto:
  1 marca sola encima del número → solo L1 lleva canto, L2 queda vacío ""
  2 marcas (encima Y debajo) → L1 Y L2 ambos llevan canto
  Sin marcas → L1="", L2="" (sin canto)

REGLA DE PATRÓN — CRÍTICA:
Mira la PRIMERA pieza de la lista para determinar si las marcas van encima o debajo.
Ese patrón se mantiene igual para TODAS las piezas.

ASIGNACIÓN L1, L2 para el LARGO:
  2 líneas rectas  → L1="D", L2="D"
  2 X              → L1="G", L2="G"
  2 gusanitos      → L1="G", L2="G"
  Línea + X        → L1="D", L2="G"  (recta=D, X=G)
  Línea + Gusanito → L1="D", L2="G"
  X + Línea        → L1="G", L2="D"
  1 sola línea     → L1="D", L2=""
  1 sola X         → L1="G", L2=""
  1 solo gusanito  → L1="G", L2=""
  Sin marcas       → L1="",  L2=""

MISMA LÓGICA para el ANCHO → A1 y A2:
  2 líneas rectas → A1="D", A2="D"
  2 X o gusanitos → A1="G", A2="G"
  1 sola línea    → A1="D", A2=""
  1 sola X        → A1="G", A2=""
  Sin marcas      → A1="",  A2=""

════════════════════════════════════════
PASO 5 — PERFORACIÓN (puntos debajo del número)
════════════════════════════════════════
Si ves puntos (·, •, o,o, ...) debajo de un número de medida:
  El número de puntos = cantidad de perforaciones (perf_cant)
  El número de medida donde están los puntos = perf_lado
  perf_det = "NP/LADO" donde N=cantidad, LADO=la medida

Ejemplo: 3 puntos debajo de 109.8 cm (=1098mm) → perf_cant="3", perf_lado="1098", perf_det="3P/1098"
Ejemplo: "o,o" debajo de 1982 → perf_cant="2", perf_lado="1982", perf_det="2P/1982"

════════════════════════════════════════
PASO 6 — RANURA (R seguido de números)
════════════════════════════════════════
Formato: R LIBRE-ESPE-PROF o R LIBRE-ESPE-PROF con guiones o barras
El LADO de la ranura es la medida (largo o ancho) junto a la que aparece el texto R.

Ejemplo: "R 18-4-7" aparece junto a la medida 50.0 cm (=500mm)
  → ran_libre="18", ran_espe="4", ran_prof="7", ran_lado="500", ran_det="R 18-4-7"

Ejemplo: "R 18-4-7" aparece junto a largo 29.1 cm (=291mm)
  → ran_libre="18", ran_espe="4", ran_prof="7", ran_lado="291", ran_det="R 18-4-7"

Ejemplo: "R 12-6-7"
  → ran_libre="12", ran_espe="6", ran_prof="7"

════════════════════════════════════════
EJEMPLOS REALES VERIFICADOS
(de lista real MELA PELIKANO PAMELA, medidas en CM, patrón: marcas encima)
════════════════════════════════════════

  4(109.8 x 54.2): 
    Sobre 109.8: 2 líneas rectas → L1="D",L2="D" | 3 puntos debajo → perf_cant="3",perf_lado="1098",perf_det="3P/1098"
    Sobre 54.2: 2 líneas rectas → A1="D",A2="D"
    → qty=4, largo=1098, ancho=542, L1=D,L2=D,A1=D,A2=D, perf

  1(52.9 x 10.0):
    Sobre 52.9: 2 líneas rectas → L1="D",L2="D"
    Sobre 10.0: sin marcas → A1="",A2=""
    → qty=1, largo=529, ancho=100, L1=D,L2=D,A1="",A2=""

  2(38.2 x 13.0):
    Sobre 38.2: 2 X encima → L1="G",L2="G"
    Sobre 13.0: 2 X encima → A1="G",A2="G"
    → qty=2, largo=382, ancho=130, L1=G,L2=G,A1=G,A2=G

  2(73.0 x 33.0) [columna derecha]:
    Sobre 73.0: 1 línea + 1 X encima → L1="D",L2="G"
    Sobre 33.0: 1 sola línea → A1="D",A2=""
    → qty=2, largo=730, ancho=330, L1=D,L2=G,A1=D,A2=""

  4(50.0 x 11.0) con "R 18-4-7":
    Sobre 50.0: 1 sola línea → L1="D",L2=""
    Sobre 11.0: sin marcas → A1="",A2=""
    R 18-4-7 junto a 50.0 → ran_libre=18,ran_espe=4,ran_prof=7,ran_lado=500
    → qty=4, largo=500, ancho=110, L1=D,L2="",A1="",A2="", ranura

════════════════════════════════════════
PASO 7 — TEXTO ADICIONAL EN OBSERVACIONES
════════════════════════════════════════
Texto legible junto a la medida (que no sea canto, perforación ni ranura):
  "R. Costados", "Techo Pso", "Divina", "Divisor" → ponlo en obs
Texto al final de la lista no relacionado a medidas → ignorar
  (ej: "2.5pl", "5 ScorM", "56000n", "11.rolo", "8 rema" → son otros productos, NO piezas)
Si algo es ilegible → obs="REVISAR: [descripción]"

════════════════════════════════════════
RESPUESTA — SOLO JSON SIN TEXTO ADICIONAL
════════════════════════════════════════
{"piezas":[
  {"material":"MELA PELIKANO PAMELA","qty":4,"largo":1098,"ancho":542,"veta":"1-Longitud",
   "l1":"D","l2":"D","a1":"D","a2":"D",
   "perf_cant":"3","perf_lado":"1098","perf_det":"3P/1098",
   "ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"",
   "obs":""}
]}

Campos:
- material: string
- qty: entero positivo
- largo, ancho: enteros en MM (convertir de CM si es necesario)
- veta: "1-Longitud" | "2-Ancho" | "Sin veta"
- l1,l2,a1,a2: "D"|"G"|"Dx"|"Dy"|"Dz"|"Gx"|"Gy"|"Gz"|""
- perf_cant,perf_lado,perf_det: string ("" si no hay)
- ran_libre,ran_espe,ran_prof,ran_lado,ran_det: string ("" si no hay)
- obs: string vacío o nota corta

SOLO EL JSON. Nada más.`;

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
