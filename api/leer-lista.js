// api/leer-lista.js — Claude Vision para listas de corte CARPICENTRO
// Sistema de 2 fases: describir visualmente → interpretar JSON
// Robusto: maneja errores de API, JSON truncado, reintentos

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imagen_b64, media_type } = req.body || {};
  if (!imagen_b64) return res.status(400).json({ error: 'Se requiere imagen_b64' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  const mt = media_type || 'image/jpeg';

  // ── Sistema de prompt ──────────────────────────────────────────────────
  const sistema = `Eres el lector de listas de corte de CARPICENTRO (Lima, Perú). Eres muy preciso y cuidadoso. Nunca inventas datos que no ves claramente en la imagen.

ESTRUCTURA JSON DE SALIDA — cada pieza:
{ "material": string, "qty": int, "largo": int (mm), "ancho": int (mm), "veta": "1-Longitud"|"2-Ancho"|"Sin veta",
  "l1": "", "l2": "", "a1": "", "a2": "",  ← "D"|"G"|"DM"|"GM"|"Dx"|"Dz"|"Gx"|"Gz"|""
  "perf_cant": "", "perf_lado": "", "perf_det": "",
  "ran_libre": "", "ran_espe": "", "ran_prof": "", "ran_lado": "", "ran_det": "",
  "obs": "" }

REGLAS CRÍTICAS:
1. UNIDAD: decimales pequeños (57.4, 116.9) = CM → ×10 = MM. Enteros grandes (1960, 580) = ya MM.
2. CANTOS: marcas SOBRE los números del largo → L1 (sup) y L2 (inf). Sobre el ancho → A1 (izq) y A2 (der).
   - Línea recta/guion = "D", Gusanito/≈ o letra X encima = "G", Letra D = "D", Letra G = "G"
   - 1 marca = 1 solo lado (el otro ""). 2 marcas = ambos lados.
   - NUNCA inventar cantos. Sin marca visible = "".
3. PATRÓN: la PRIMERA pieza define si las marcas van arriba o abajo. Ese patrón aplica a TODAS.
4. RANURA: "RAN.", "R", "RA" = ranura. Si tiene números: R/LIBRE/ESPE/PROF. Sin números → obs="Indicar especificaciones de ranura".
5. CANTIDAD: números encerrados en círculo ①②③ o números normales al inicio.
6. LEER TODO: leer de izquierda a derecha, de arriba a abajo, todas las columnas.`;

  const pregunta_visual = `FASE 1 — DESCRIPCIÓN VISUAL (sé muy específico, no interpretes aún):

1. ¿Qué material/nombre aparece en el encabezado?
2. ¿Las medidas tienen decimales (→CM) o son enteros grandes (→MM)?
3. ¿Cuántas columnas de medidas tiene la lista? (1, 2 o 3 columnas)
4. ¿Las marcas de canto van ENCIMA o DEBAJO de los números? (mira la primera pieza)
5. Para las primeras 6 piezas de CADA columna, describe exactamente:
   - Cantidad y medidas
   - Marcas sobre el número LARGO: ¿líneas rectas? ¿gusanitos? ¿letras? ¿cuántas?
   - Marcas sobre el número ANCHO: ídem
   - ¿Hay ranura? ¿puntos de perforación? ¿texto adicional?

No interpretes todavía. Solo describe lo que ves.`;

  const instruccion_json = `FASE 2 — Genera el JSON completo con TODAS las piezas de la lista.
Incluye TODAS las columnas. Lee de izquierda a derecha, arriba a abajo.
Aplica las reglas del sistema de forma estricta.
Responde ÚNICAMENTE con el JSON. Sin texto antes ni después. Sin markdown.
Formato exacto: {"piezas":[{...},{...}]}`;

  // ── Función auxiliar: llamar a Claude API ──────────────────────────────
  async function callClaude(messages, maxTokens = 2048) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 55000); // 55s timeout
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system: sistema, messages }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      if (!r.ok) {
        const errText = await r.text();
        throw new Error(`API ${r.status}: ${errText.slice(0, 200)}`);
      }
      const data = await r.json();
      return (data.content || []).map(c => c.text || '').join('');
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  // ── Función: extraer JSON robusto ──────────────────────────────────────
  function extraerJSON(texto) {
    // Limpiar bloques de código
    let clean = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    // Buscar el objeto JSON principal
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first === -1 || last === -1 || first >= last) return null;
    let jsonStr = clean.slice(first, last + 1);
    // Intentar parsear directo
    try { return JSON.parse(jsonStr); } catch (_) {}
    // Intentar reparar JSON truncado: encontrar el último objeto completo
    const patterns = [
      // Agregar cierre del array y objeto
      jsonStr + ']}',
      // Cortar en el último objeto completo
      jsonStr.slice(0, jsonStr.lastIndexOf('},') + 1) + ']}',
      jsonStr.slice(0, jsonStr.lastIndexOf('}') + 1) + ']}',
    ];
    for (const attempt of patterns) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed && parsed.piezas) return parsed;
      } catch (_) {}
    }
    return null;
  }

  // ── Función: normalizar pieza ──────────────────────────────────────────
  function normalizarPieza(p) {
    const s = v => String(v || '').trim();
    const n = v => Math.round(parseFloat(String(v || '').replace(',', '.')) || 0);
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

  // ── FASE 1: Descripción visual ─────────────────────────────────────────
  let descripcion = '';
  try {
    descripcion = await callClaude([{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mt, data: imagen_b64 } },
        { type: 'text', text: pregunta_visual }
      ]
    }], 1500);
  } catch (e) {
    // Si fase 1 falla, intentar directamente fase 2
    descripcion = 'Descripción no disponible, intentando lectura directa.';
  }

  // ── FASE 2: Generar JSON ───────────────────────────────────────────────
  let parsed = null;
  let ultimoError = '';

  // Intentar hasta 2 veces (con y sin descripción previa)
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const messages = intento === 1 && descripcion ? [
        { role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mt, data: imagen_b64 } },
          { type: 'text', text: pregunta_visual }
        ]},
        { role: 'assistant', content: descripcion },
        { role: 'user', content: instruccion_json }
      ] : [
        { role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mt, data: imagen_b64 } },
          { type: 'text', text: instruccion_json }
        ]}
      ];

      const texto = await callClaude(messages, 8192);
      parsed = extraerJSON(texto);

      if (parsed && parsed.piezas && parsed.piezas.length > 0) {
        parsed.piezas = parsed.piezas.map(normalizarPieza);
        return res.status(200).json({ ...parsed, _descripcion: descripcion, _intentos: intento });
      }
      ultimoError = `Intento ${intento}: JSON sin piezas. Raw: ${texto.slice(0, 200)}`;
    } catch (e) {
      ultimoError = `Intento ${intento}: ${e.message}`;
      // Esperar un poco antes de reintentar
      if (intento < 2) await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Si ambos intentos fallaron
  return res.status(422).json({
    error: 'No se pudo extraer la lista. ' + ultimoError,
    descripcion,
  });
}
