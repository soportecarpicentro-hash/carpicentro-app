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

  // Enviamos DOS mensajes al modelo:
  // 1. Un "preflight" que le pide describir visualmente la imagen antes de interpretar
  // 2. Luego la interpretación final con las reglas
  // Esto mejora dramáticamente la precisión porque el modelo "ve" antes de "deducir"

  const sistemaPrompt = `Eres el lector de listas de corte de CARPICENTRO (Lima, Perú).
Trabajas en DOS FASES para máxima precisión:
FASE 1: Describes visualmente lo que ves (líneas, marcas, letras sobre los números)
FASE 2: Conviertes esa descripción visual en el JSON estructurado

═══ REGLAS DE INTERPRETACIÓN ═══

MATERIAL: Nombre escrito arriba de la lista. Si no hay → "MELA PELIKANO BLANCO"

UNIDAD DE MEDIDA:
- Números con decimales (109.8, 54.2, 73.0) → CM → multiplicar x10 → MM
- Números enteros grandes (420, 1982, 864) → ya son MM
- Si ves "M" o "m" como unidad → multiplicar x1000 → MM

FORMATO DE PIEZA: (CANTIDAD) LARGO x ANCHO [anotaciones]
La "x" o "×" ENTRE los números es separador de medidas — NO es canto.

═══ CANTOS — MÉTODO DE LECTURA EN 3 PASOS ═══

PASO A — ¿Qué tipo de marca hay?
  Línea recta/guion (—) = DELGADO = "D"
  Línea ondulada/gusanito (≈ o ~~~) = GRUESO = "G"  
  Letra X encima del número = GRUESO = "G"
  Letra "D" escrita encima = DELGADO = "D" (aunque parezca "O" o bolita, si las demás son "D" → también es "D")
  Letra "G" escrita encima = GRUESO = "G"
  Letra "Dm" escrita = "Dm" (canto delgado diferente color)
  Letra "Gm" escrita = "Gm" (canto grueso diferente color)

PASO B — ¿Cuántas marcas tiene ese número?
  0 marcas → sin canto: ambos lados vacíos ""
  1 marca (solo encima O solo debajo) → UN solo lado lleva canto, el otro vacío
  2 marcas (encima Y debajo, o tipos diferentes) → AMBOS lados llevan canto

PASO C — ¿Las marcas van arriba o abajo? (Patrón de la PRIMERA pieza)
  Mira SOLO la primera pieza para detectar si las marcas van encima o debajo de los números.
  Ese patrón se aplica a TODAS las piezas de la lista.
  Marca arriba → L1 (o A1); Marca abajo → L2 (o A2)

COMBINACIONES PARA EL LARGO → L1 y L2:
  Sin marcas                    → L1="",  L2=""
  1 línea recta (arriba)        → L1="D", L2=""
  1 línea recta (abajo)         → L1="D", L2=""  [según patrón]
  2 líneas rectas               → L1="D", L2="D"
  1 gusanito/X                  → L1="G", L2=""
  2 gusanitos/X                 → L1="G", L2="G"
  1 línea + 1 gusanito/X        → L1="D", L2="G"  (recta=D arriba, gusanito=G abajo)
  1 gusanito/X + 1 línea        → L1="G", L2="D"

MISMA LÓGICA para el ANCHO → A1 y A2

⚠️ REGLAS CRÍTICAS:
1. NO INVENTES cantos. Si no ves marca claramente → dejar vacío ""
2. Cuenta las marcas con cuidado: 1 ó 2
3. La "x" entre dos números (ej: "109.8 x 54.2") NO es canto — es separador
4. Solo las X encima o debajo de UN número individual son cantos gruesos

═══ PERFORACIÓN ═══
Puntos (• o,o ...) debajo de un número = perforaciones
  cant_puntos=perf_cant | medida_donde_están=perf_lado | perf_det="NP/LADO"
  Ej: 3 puntos bajo 109.8cm(=1098mm) → perf_cant="3", perf_lado="1098", perf_det="3P/1098"

═══ RANURA ═══
"R LIBRE-ESPE-PROF" junto a una medida:
  Ej: "R 18-4-7" con largo=50cm(=500mm) → ran_libre="18", ran_espe="4", ran_prof="7", ran_lado="500"

═══ TEXTO ADICIONAL ═══
Texto descriptivo junto a la pieza → obs (ej: "R. Costados", "Techo Pso")
Texto al final que no son piezas (cantidades de otros materiales) → IGNORAR completamente

═══ EJEMPLOS VERIFICADOS (MELA PELIKANO PAMELA, en CM, marcas encima) ═══
  4(109.8×54.2): 2 líneas sobre 109.8→L1=D,L2=D | 3 puntos→3P/1098 | 2 líneas sobre 54.2→A1=D,A2=D
  1(52.9×10.0):  2 líneas sobre 52.9→L1=D,L2=D  | nada sobre 10.0→A1="",A2=""
  2(38.2×13.0):  2 X sobre 38.2→L1=G,L2=G       | 2 X sobre 13.0→A1=G,A2=G
  2(73.0×33.0):  1 línea+1 X sobre 73.0→L1=D,L2=G | 1 sola línea sobre 33→A1=D,A2=""
  4(50.0×11.0):  1 línea sobre 50→L1=D,L2=""    | nada sobre 11→A1="",A2="" | R18-4-7→ran

═══ RESPUESTA ═══
SOLO JSON sin texto adicional ni markdown:
{"piezas":[{"material":"MELA PELIKANO PAMELA","qty":4,"largo":1098,"ancho":542,"veta":"1-Longitud","l1":"D","l2":"D","a1":"D","a2":"D","perf_cant":"3","perf_lado":"1098","perf_det":"3P/1098","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":""}]}

Campos: material(str) | qty(int) | largo,ancho(int mm) | veta("1-Longitud"|"2-Ancho"|"Sin veta")
  l1,l2,a1,a2("D"|"G"|"Dm"|"Gm"|"Dx"|"Dz"|"Gx"|"Gz"|"") 
  perf_cant,perf_lado,perf_det(str) | ran_libre,ran_espe,ran_prof,ran_lado,ran_det(str) | obs(str)`;

  // Prompt de dos fases: primero describir, luego interpretar
  const prompt_describe = `Antes de interpretar, describe visualmente lo que ves en esta lista de corte:
1. ¿Qué material dice arriba?
2. ¿Las medidas tienen decimales (CM) o son enteros grandes (MM)?
3. Para las primeras 3 piezas: ¿qué marcas ves exactamente encima y debajo de cada número? 
   (líneas rectas, gusanitos, letras X, letras D o G, puntos, etc.)
4. ¿Las marcas van encima o debajo de los números?
5. ¿Hay texto de ranura (R) o perforación (puntos)?

Sé muy específico sobre las marcas visuales. No interpretes aún, solo describe lo que ves.`;

  const prompt_interpret = `Ahora, basándote en tu descripción visual anterior y las reglas del sistema, 
genera el JSON completo con TODAS las piezas de la lista.
SOLO EL JSON, sin texto adicional.`;

  try {
    // FASE 1: El modelo describe visualmente la imagen
    const r1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1024,
        system: sistemaPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media_type||'image/jpeg', data: imagen_b64 }},
            { type: 'text', text: prompt_describe }
          ]
        }]
      })
    });
    if (!r1.ok) { const e=await r1.text(); return res.status(502).json({ error:'Error API fase 1', detalle:e.slice(0,200) }); }
    const data1 = await r1.json();
    const descripcion = (data1.content||[]).map(c=>c.text||'').join('');

    // FASE 2: Con la descripción visual, genera el JSON
    const r2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 4096,
        system: sistemaPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: media_type||'image/jpeg', data: imagen_b64 }},
              { type: 'text', text: prompt_describe }
            ]
          },
          { role: 'assistant', content: descripcion },
          { role: 'user', content: prompt_interpret }
        ]
      })
    });
    if (!r2.ok) { const e=await r2.text(); return res.status(502).json({ error:'Error API fase 2', detalle:e.slice(0,200) }); }
    const data2 = await r2.json();
    const texto = (data2.content||[]).map(c=>c.text||'').join('');
    const clean = texto.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.status(422).json({ error:'Sin JSON', descripcion, raw:texto.slice(0,300) });
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
    return res.status(200).json({ ...parsed, _descripcion: descripcion });
  } catch(err) {
    return res.status(500).json({ error:'Error interno', detalle:err.message });
  }
}
