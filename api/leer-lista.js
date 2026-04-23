// api/leer-lista.js — Claude Vision para listas de corte CARPICENTRO
// Usa dos fases: describir visualmente → luego interpretar
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

  const sistema = `Eres el lector de listas de corte de CARPICENTRO (Lima, Perú).
Eres muy preciso. Cuando tienes duda, prefieres dejar un campo vacío y marcar obs="REVISAR" antes que inventar datos.

══════════════════════════════════════════════
ESTRUCTURA DEL JSON DE SALIDA
══════════════════════════════════════════════
Cada pieza tiene estos campos exactos:
{
  "material": string,     // nombre del material
  "qty": int,             // cantidad
  "largo": int,           // en MM
  "ancho": int,           // en MM
  "veta": string,         // "1-Longitud" | "2-Ancho" | "Sin veta"
  "l1": string,           // borde SUPERIOR del largo   → "D"|"G"|"DM"|"GM"|"Dx"|"Dz"|"Gx"|"Gz"|""
  "l2": string,           // borde INFERIOR del largo   → mismo
  "a1": string,           // borde IZQUIERDO del ancho  → mismo
  "a2": string,           // borde DERECHO del ancho    → mismo
  "perf_cant": string,    // cantidad de perforaciones
  "perf_lado": string,    // medida del lado con perforaciones
  "perf_det": string,     // descripción ej: "2P/1982"
  "ran_libre": string,    // ranura: espacio libre
  "ran_espe": string,     // ranura: espesor
  "ran_prof": string,     // ranura: profundidad
  "ran_lado": string,     // ranura: lado (medida)
  "ran_det": string,      // descripción completa ej: "R/18/3/8/512"
  "obs": string           // observaciones o "REVISAR: motivo"
}

══════════════════════════════════════════════
REGLA 1 — MATERIAL
══════════════════════════════════════════════
Busca el nombre del material escrito en el encabezado de la lista o sección.
Si el material tiene letras como "RH", "LINO", "CINO" → son variantes del nombre.
Ejemplos reales:
  "CINO RH/LINO" → material = "MELA PELIKANO CINO" (o el nombre que más se entienda)
  "ROBLE GRIS"   → material = "MELA PELIKANO ROBLE GRIS"
  Sin nombre     → "MELA PELIKANO BLANCO"

══════════════════════════════════════════════
REGLA 2 — UNIDAD DE MEDIDA
══════════════════════════════════════════════
DETECTA la unidad mirando los números:
• Números con 1 decimal ≤ 3 dígitos antes del punto (ej: 57.4, 116.9, 50.0) → CM → ×10 → MM
• Números enteros ≥ 4 dígitos (ej: 1960, 580, 1169) → ya son MM → no convertir
• Si ves "M" como unidad escrita → ×1000 → MM
Regla práctica: si el largo es menor a 300 sin decimales → probablemente CM → ×10

Ejemplos de conversión:
  196 cm → 1960 mm | 57.4 cm → 574 mm | 51.2 cm → 512 mm | 50 cm → 500 mm
  46.3 cm → 463 mm | 84.2 cm → 842 mm | 116.9 cm → 1169 mm | 48.1 cm → 481 mm

══════════════════════════════════════════════
REGLA 3 — FORMATO DE PIEZA
══════════════════════════════════════════════
Formato típico: (CANTIDAD) LARGO × ANCHO [anotaciones]
La cantidad puede estar como número encerrado en círculo ①②③ o como número normal.
La "×" o "x" entre dos números es SEPARADOR de medidas — NO es canto.

══════════════════════════════════════════════
REGLA 4 — CANTOS (la más importante)
══════════════════════════════════════════════
Los cantos son marcas visuales sobre los números. El Excel de referencia usa:
  L1 = borde SUPERIOR del LARGO   (P_EDGE_MAT_UP)
  L2 = borde INFERIOR del LARGO   (P_EGDE_MAT_LO)
  A1 = borde IZQUIERDO del ANCHO  (P_EDGE_MAT_SX)
  A2 = borde DERECHO del ANCHO    (P_EDGE_MAT_DX)

TIPOS DE MARCA → VALOR:
  Línea recta/guion (—) encima o debajo  → "D"  (delgado)
  Línea ondulada/gusanito (≈)            → "G"  (grueso)
  Letra X encima del número              → "G"  (grueso, equivalente a gusanito)
  Letra "D" escrita encima               → "D"  (aunque parezca "O" si el contexto es "D")
  Letra "G" escrita encima               → "G"
  Abreviación "DM" o "Dm"               → "DM" (delgado diferente color)
  Abreviación "GM" o "Gm"               → "GM" (grueso diferente color)
  Sin marca visible                      → ""   (sin canto — NO inventar)

PASO A — DETECTAR PATRÓN de posición (PRIMERA PIEZA):
  ¿Las marcas están ENCIMA o DEBAJO de los números?
  Ese patrón se aplica a TODAS las piezas de la lista.
  Si las marcas van ENCIMA: la marca de arriba = L1, la de abajo = L2
  Si las marcas van DEBAJO: la marca de abajo = L1, la de arriba = L2
  (En la práctica casi siempre van encima)

PASO B — CONTAR marcas sobre el LARGO:
  0 marcas → L1="", L2=""
  1 marca sola → L1=tipo, L2=""
  2 marcas distintas (recta + gusanito) → L1=tipo_arriba, L2=tipo_abajo
  2 marcas iguales (recta + recta) → L1="D", L2="D"
  2 gusanitos/X → L1="G", L2="G"

PASO C — CONTAR marcas sobre el ANCHO → misma lógica para A1 y A2

REGLA CRÍTICA: Si NO hay marca visible → campo vacío "". NUNCA inventar cantos.

══════════════════════════════════════════════
REGLA 5 — RANURA
══════════════════════════════════════════════
Se indica como "RAN", "R", "RA", "RANURA" seguido de números.
Formato en el Excel de referencia: R/LIBRE/ESPE/PROF/LADO
  Ej: "R/18/3/8/512" → ran_libre="18", ran_espe="3", ran_prof="8", ran_lado="512", ran_det="R/18/3/8/512"
  Ej: "RAN." junto a largo 512→ consultar especificaciones → obs="REVISAR: especificaciones de ranura"
  Ej: "R18-3-8" → libre=18, espe=3, prof=8; lado = la medida junto a la que aparece

Si el cliente pone "RAN." sin más detalles → obs="Indicar especificaciones de ranura"

══════════════════════════════════════════════
REGLA 6 — PERFORACIÓN
══════════════════════════════════════════════
Puntos (• o,o ...) debajo de un número = perforaciones
  cantidad de puntos = perf_cant | medida donde están = perf_lado | perf_det = "NP/LADO"
  Ej: punto junto a 196 cm(=1960mm) → perf_cant="1", perf_lado="1960", perf_det="1P/1960"

══════════════════════════════════════════════
REGLA 7 — TEXTO ADICIONAL Y OBSERVACIONES
══════════════════════════════════════════════
"CUADRICULADO" al final de la lista → es nota del papel, ignorar
Texto descriptivo por pieza → obs
Si hay ranura incompleta → obs = "Indicar especificaciones de ranura"
Texto ilegible → obs = "REVISAR: [descripción]"
Notas al final que no son piezas → IGNORAR

══════════════════════════════════════════════
EJEMPLOS VERIFICADOS (lista CINO RH, medidas en CM, marcas encima)
══════════════════════════════════════════════
[Excel de referencia confirma estas interpretaciones]

  Imagen: 196×58 ② con 1 línea encima del largo, 1 línea encima del ancho
  Resultado: qty=2, largo=1960, ancho=580, L1="D", L2="", A1="D", A2=""
  [Excel: P_EDGE_MAT_UP=D, P_EDGE_MAT_SX=D]

  Imagen: 57.4×58 ③ con 1 línea encima del largo, sin marca en ancho
  Resultado: qty=3, largo=574, ancho=580, L1="D", L2="", A1="", A2=""
  [Excel: P_EDGE_MAT_UP=D, resto vacío]

  Imagen: 51.2×20 ⑥ RAN. con 2 líneas encima del largo, sin marca ancho
  Resultado: qty=6, largo=512, ancho=200, L1="D", L2="D", A1="", A2="", obs="Indicar especificaciones de ranura"
  [Excel: P_EDGE_MAT_UP=D, P_EGDE_MAT_LO=D, P_IDESC=R/18/3/8/512]

  Imagen: 46.3×8 ⑮ sin marcas en largo ni ancho
  Resultado: qty=15, largo=463, ancho=80, L1="", L2="", A1="", A2=""
  [Excel: todas las celdas de canto vacías]

  Imagen: 86×86 ⑦ sin marcas
  Resultado: qty=7, largo=860, ancho=860, L1="", L2="", A1="", A2=""

  Imagen: 35×20 ③ con 2 líneas encima del largo
  Resultado: qty=3, largo=350, ancho=200, L1="D", L2="D", A1="", A2=""
  [Excel: P_EDGE_MAT_UP=D, P_EGDE_MAT_LO=D]

══════════════════════════════════════════════
RESPUESTA — SOLO JSON
══════════════════════════════════════════════
Sin texto adicional ni bloques markdown. Exactamente:
{"piezas":[{...}]}`;

  const pregunta_visual = `Analiza esta lista de corte con MUCHO CUIDADO.

FASE 1 — DESCRIPCIÓN VISUAL (antes de interpretar):
Por favor responde estas preguntas específicas:

1. ¿Qué material o nombre aparece en el encabezado?
2. ¿Las medidas parecen estar en CM (números con decimales <300) o MM (enteros >300)?
3. ¿Las marcas de canto están ENCIMA o DEBAJO de los números? (detecta esto en la PRIMERA pieza)
4. Para las primeras 5 piezas, describe EXACTAMENTE:
   - Las medidas y cantidad
   - Qué marcas ves sobre el número del LARGO (líneas rectas, gusanitos, X, letras D/G)
   - Qué marcas ves sobre el número del ANCHO
   - Si hay ranura (R, RAN, RA) o perforación (puntos)
   - Cualquier texto adicional
5. ¿La lista tiene 1 columna, 2 columnas o 3 columnas de medidas?

Sé muy específico. No interpretes todavía — solo describe lo que ves visualmente.`;

  const instruccion_json = `Perfecto. Ahora, basándote en tu descripción visual anterior y las reglas del sistema, genera el JSON completo con TODAS las piezas de la lista (incluyendo todas las columnas si hay más de una).

Recuerda:
- Convertir CM→MM si corresponde (×10) 
- Si hay ranura escrita solo como "RAN." sin números → obs="Indicar especificaciones de ranura"
- NUNCA inventar cantos — si no hay marca visible → campo vacío ""
- Leer de izquierda a derecha, de arriba hacia abajo

SOLO EL JSON, sin texto adicional.`;

  try {
    // FASE 1: El modelo describe visualmente
    const r1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1500,
        system: sistema,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media_type||'image/jpeg', data: imagen_b64 }},
            { type: 'text', text: pregunta_visual }
          ]
        }]
      })
    });
    if (!r1.ok) { const e=await r1.text(); return res.status(502).json({ error:'Error API fase 1', detalle:e.slice(0,200) }); }
    const d1 = await r1.json();
    const descripcion = (d1.content||[]).map(c=>c.text||'').join('');

    // FASE 2: Genera el JSON con contexto de la descripción
    const r2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 8192,
        system: sistema,
        messages: [
          { role:'user', content:[
            { type:'image', source:{ type:'base64', media_type:media_type||'image/jpeg', data:imagen_b64 }},
            { type:'text', text:pregunta_visual }
          ]},
          { role:'assistant', content: descripcion },
          { role:'user', content: instruccion_json }
        ]
      })
    });
    if (!r2.ok) { const e=await r2.text(); return res.status(502).json({ error:'Error API fase 2', detalle:e.slice(0,200) }); }
    const d2 = await r2.json();
    const texto = (d2.content||[]).map(c=>c.text||'').join('');
    // Extracción robusta del JSON — maneja texto antes/después y bloques de código
    const clean = texto.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    // Buscar el JSON empezando desde la primera llave { hasta la última }
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    let parsed;
    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      return res.status(422).json({ error:'Sin JSON en respuesta', descripcion, raw:clean.slice(0,500) });
    }
    const jsonStr = clean.slice(firstBrace, lastBrace + 1);
    try { parsed = JSON.parse(jsonStr); }
    catch(e) {
      // Intentar reparar JSON truncado: buscar el último objeto completo
      const lastComma = jsonStr.lastIndexOf('},');
      if (lastComma > 0) {
        try { parsed = JSON.parse(jsonStr.slice(0, lastComma) + '}]}'); }
        catch(e2) { return res.status(422).json({ error:'JSON inválido', descripcion, raw:jsonStr.slice(0,500) }); }
      } else {
        return res.status(422).json({ error:'JSON inválido', descripcion, raw:jsonStr.slice(0,500) });
      }
    }
    if (!parsed.piezas||!Array.isArray(parsed.piezas))
      return res.status(422).json({ error:'Sin piezas', descripcion, parsed });
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
