// api/leer-lista.js — Vercel Serverless Function
// Usa Google Gemini 2.0 Flash (GRATIS, sin tarjeta de crédito)
// Obtén tu key gratis en: https://aistudio.google.com/apikey

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imagen_b64, media_type } = req.body;
  if (!imagen_b64) return res.status(400).json({ error: 'Se requiere imagen_b64' });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY no configurada en Vercel Environment Variables' });

  const prompt = `Eres experto en listas de corte de melamina para carpintería en Perú.
Tu tarea: leer esta imagen y extraer TODAS las piezas de corte en formato JSON.

=== FORMATOS QUE PUEDE TENER LA IMAGEN ===

FORMATO CLIENTE (manuscrito más común):
  "206 x 80 = 2" → Largo=206mm, Ancho=80mm, Cantidad=2
  "2 → 206x80" o "2 pzs 206x80" → mismo significado
  "6→ 814x80 DD" → 6 piezas, largo=814, ancho=80, cantos L1=D, L2=D
  Las medidas SIEMPRE son en mm. Si ves 206 → 206mm.

SECCIONES POR MATERIAL: La lista puede tener secciones separadas por color/material:
  "Melamine Blanco:", "Caramelo:", "Pamela:", "Onix:", "Bardolino:", etc.
  Cada sección aplica ese material a todas sus piezas.

FORMATO VENDEDORA (tabla impresa/digital):
  Columnas: Cant | Largo | Ancho | Veta | L1 | L2 | A1 | A2
  Los números pueden tener puntos: "1.304,0" = 1304mm, "2.060,0" = 2060mm

=== REGLAS PARA CANTOS ===
Posiciones: L1=largo superior, L2=largo inferior, A1=ancho izquierdo, A2=ancho derecho
  D o - (guion)  → "D" (canto delgado)
  G o ~ (virgulilla) → "G" (canto grueso)
  DO             → D solo en L1, resto vacío
  DD             → D en L1 y L2
  GG             → G en L1 y L2
  DM             → "DM" (doble delgado ambos largos)
  GM             → "GM" (doble grueso ambos largos)
  Sin indicación → "" (vacío)
  "D G"          → L1="D", L2="G"
  "GC PPPP"      → L1="G" en el contorno, ignorar letras extra
  "6cppp GG"     → L1="G", L2="G" (GG)

=== REGLAS GENERALES ===
- IGNORA dibujos, bocetos y esquemas de muebles
- Si un valor es ilegible o ambiguo, ponlo en obs como "REVISAR: [lo que viste]"
- Material por defecto si no se indica: "MELA PELIKANO BLANCO"
- Convierte cm a mm si las medidas son claramente pequeñas (< 30 → multiplica x 10)
- Extrae ABSOLUTAMENTE TODAS las piezas de la imagen

=== RESPUESTA ===
RESPONDE ÚNICAMENTE con JSON válido, sin texto adicional, sin explicaciones, sin bloques de código markdown.

{"piezas":[
  {"material":"MELA PELIKANO BLANCO","qty":2,"largo":206,"ancho":80,"veta":"1-Longitud","l1":"D","l2":"D","a1":"","a2":"","obs":""},
  {"material":"MELA PELIKANO CARAMELO","qty":1,"largo":1304,"ancho":100,"veta":"1-Longitud","l1":"G","l2":"G","a1":"G","a2":"G","obs":"REVISAR: medida superior ilegible"}
]}

Campos por pieza:
- material: nombre completo del material
- qty: cantidad (entero)
- largo: milímetros (entero)
- ancho: milímetros (entero)
- veta: "1-Longitud" | "2-Ancho" | "Sin veta"
- l1, l2, a1, a2: "D" | "G" | "DM" | "GM" | ""
- obs: observación o "" — usa "REVISAR: xxx" si algo es dudoso

SOLO EL JSON. NADA MÁS.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

    const body = {
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: media_type || 'image/jpeg',
              data: imagen_b64
            }
          },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini error:', response.status, err);
      return res.status(502).json({ error: 'Error de Gemini API', status: response.status, detalle: err.slice(0, 300) });
    }

    const data = await response.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!texto) {
      return res.status(422).json({ error: 'Gemini no devolvió texto', data_raw: JSON.stringify(data).slice(0, 300) });
    }

    // Limpiar y parsear JSON
    const clean = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(422).json({ error: 'No se encontró JSON en la respuesta', respuesta_raw: texto.slice(0, 500) });
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return res.status(422).json({ error: 'JSON inválido', respuesta_raw: match[0].slice(0, 500) });
    }

    if (!parsed.piezas || !Array.isArray(parsed.piezas)) {
      return res.status(422).json({ error: 'JSON sin campo "piezas"', parsed });
    }

    // Normalizar cada pieza
    parsed.piezas = parsed.piezas.map(p => ({
      material: p.material || 'MELA PELIKANO BLANCO',
      qty: Math.max(1, parseInt(p.qty) || 1),
      largo: Math.round(parseFloat(String(p.largo).replace(',', '.')) || 0),
      ancho: Math.round(parseFloat(String(p.ancho).replace(',', '.')) || 0),
      veta: p.veta || '1-Longitud',
      l1: p.l1 || '',
      l2: p.l2 || '',
      a1: p.a1 || '',
      a2: p.a2 || '',
      obs: p.obs || ''
    }));

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Error en leer-lista:', err);
    return res.status(500).json({ error: 'Error interno del servidor', detalle: err.message });
  }
}
