// api/leer-lista.js — Claude Vision CARPICENTRO v3
// Robusto: maneja texto plano de API, reintentos, JSON repair, timeout

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { imagen_b64, media_type } = req.body || {};
  if (!imagen_b64) return res.status(400).json({ error: 'Se requiere imagen_b64' });

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' });

  const mt = media_type || 'image/jpeg';

  // ── Prompt compacto y efectivo ─────────────────────────────────────────
  const PROMPT = `Eres el lector de listas de corte de CARPICENTRO (Lima, Perú).

LEE la imagen y devuelve ÚNICAMENTE un JSON válido. Sin texto antes ni después. Sin markdown.

REGLAS:
1. UNIDAD: números con decimal ≤3 dígitos antes del punto (57.4, 116.9) = CM → multiplicar ×10 → MM. Enteros grandes (1960, 580) = ya son MM.
2. CANTOS (L1/L2/A1/A2): marcas sobre el LARGO definen L1=superior, L2=inferior. Sobre el ANCHO definen A1=izquierda, A2=derecha.
   Tipos: línea recta=D, gusanito/≈/X_encima=G, letra_D=D, letra_G=G, DM=DM, GM=GM
   1 marca → un lado, otro vacío "". 2 marcas → ambos lados. Sin marca → "". NUNCA inventar.
3. La PRIMERA pieza define si las marcas van arriba o abajo. Ese patrón aplica a TODAS.
4. RANURA: "RAN", "R", "RA" seguido de números → ran_libre/ran_espe/ran_prof/ran_lado. Sin números → obs="Indicar especificaciones de ranura".
5. PERFORACIÓN: puntos bajo un número → perf_cant=cantidad, perf_lado=esa_medida.
6. CANTIDAD: número en círculo ①②③ o número al inicio de la línea.
7. Lee TODAS las columnas, de izquierda a derecha, arriba a abajo.
8. Medidas en CM: 196=1960mm, 57.4=574mm, 116.9=1169mm, 51.2=512mm, 84.2=842mm.

FORMATO JSON:
{"piezas":[{"material":"NOMBRE","qty":1,"largo":1960,"ancho":580,"veta":"1-Longitud","l1":"D","l2":"","a1":"D","a2":"","perf_cant":"","perf_lado":"","perf_det":"","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":""}]}

DEVUELVE SOLO EL JSON.`;

  // ── Llamar a Anthropic de forma segura ────────────────────────────────
  async function callAnthropic(imageData, maxTok = 8192) {
    const ctrl = new AbortController();
    const tmo = setTimeout(() => ctrl.abort(), 50000);
    let rawText = '';
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: maxTok,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mt, data: imageData } },
              { type: 'text', text: PROMPT }
            ]
          }]
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tmo);

      // Leer siempre como texto primero — evita el crash si la API devuelve texto plano
      rawText = await resp.text();

      // Si no es JSON válido de Anthropic, lanzar error descriptivo
      let apiData;
      try { apiData = JSON.parse(rawText); }
      catch (_) { throw new Error('API devolvió texto no-JSON: ' + rawText.slice(0, 100)); }

      if (!resp.ok) {
        throw new Error(`API error ${resp.status}: ${apiData.error?.message || rawText.slice(0, 100)}`);
      }

      return (apiData.content || []).map(c => c.text || '').join('');
    } catch (e) {
      clearTimeout(tmo);
      if (e.name === 'AbortError') throw new Error('Timeout: la API tardó demasiado (>50s)');
      throw e;
    }
  }

  // ── Extraer JSON del texto de respuesta ───────────────────────────────
  function extraerJSON(texto) {
    if (!texto) return null;
    // Limpiar bloques de código markdown
    let clean = texto.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    // Encontrar primer { y último }
    const a = clean.indexOf('{');
    const z = clean.lastIndexOf('}');
    if (a < 0 || z < 0 || a >= z) return null;
    const jsonStr = clean.slice(a, z + 1);
    // Intentar parse directo
    try { const p = JSON.parse(jsonStr); if (p?.piezas?.length) return p; } catch (_) {}
    // Intentar reparar truncado: cortar tras el último objeto completo
    const cortes = [
      jsonStr.slice(0, jsonStr.lastIndexOf('},') + 1) + ']}',
      jsonStr.slice(0, jsonStr.lastIndexOf('}') + 1) + ']}',
    ];
    for (const c of cortes) {
      try { const p = JSON.parse(c); if (p?.piezas?.length) return p; } catch (_) {}
    }
    return null;
  }

  // ── Normalizar cada pieza ─────────────────────────────────────────────
  function norm(p) {
    const s = v => String(v ?? '').trim();
    const n = v => Math.round(parseFloat(String(v ?? '').replace(',', '.')) || 0);
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

  // ── Intentar lectura con reintentos ───────────────────────────────────
  let lastError = '';
  for (let i = 1; i <= 3; i++) {
    try {
      const texto = await callAnthropic(imagen_b64, i === 3 ? 4096 : 8192);
      const parsed = extraerJSON(texto);
      if (parsed?.piezas?.length) {
        return res.status(200).json({
          piezas: parsed.piezas.map(norm),
          _intentos: i,
        });
      }
      lastError = `Intento ${i}: JSON sin piezas. Respuesta: ${texto.slice(0, 150)}`;
    } catch (e) {
      lastError = `Intento ${i}: ${e.message}`;
      // Esperar antes de reintentar (backoff)
      if (i < 3) await new Promise(r => setTimeout(r, i * 3000));
    }
  }

  return res.status(422).json({ error: 'No se pudo leer la lista tras 3 intentos. ' + lastError });
}
