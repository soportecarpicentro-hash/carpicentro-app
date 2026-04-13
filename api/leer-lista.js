// api/leer-lista.js
// Vercel Serverless Function — proxy para Claude Vision
// Se llama desde el frontend en /api/leer-lista

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imagen_b64, media_type } = req.body;

  if (!imagen_b64) {
    return res.status(400).json({ error: 'Se requiere imagen_b64' });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en Vercel' });
  }

  const prompt = `Eres un experto en listas de corte de melamina para carpintería en Perú.
Tu tarea es leer esta imagen que puede ser:
- Una lista manuscrita del CLIENTE con medidas de corte
- Un documento con formato de tabla de la VENDEDORA

FORMATO DEL CLIENTE (manuscrito):
Las listas de clientes usan el formato: LARGO x ANCHO = CANTIDAD
Ejemplo: "206 x 80 = 2" significa: Largo=206, Ancho=80, Cantidad=2
A veces la cantidad va al inicio: "2 → 206 x 80" o "2 pzs 206x80"
Los cantos van después: D=delgado, G=grueso, - (guión)=delgado, ~=grueso
Las notas de cantos pueden aparecer como: "DO" (delgado solo en un lado), "DD" (delgado en dos lados), "GG" (grueso en dos lados)
La posición de cantos: L1=lado largo superior, L2=lado largo inferior, A1=lado ancho izquierdo, A2=lado ancho derecho
El material puede estar indicado al inicio de una sección: "Melamine Blanco", "Caramelo", "Pamela", etc.
Si hay varias secciones separadas por material, cada sección tiene su propio material.

REGLAS DE INTERPRETACIÓN DE CANTOS:
- "D" o "-" = Delgado (D)
- "G" o "~" = Grueso (G)  
- "DO" = Solo un canto delgado (pon D en L1, vacío en el resto)
- "DD" = Dos cantos delgados (pon D en L1 y L2)
- "GG" = Dos cantos gruesos (pon G en L1 y L2)
- "DM" = Doble canto delgado (pon D en L1 y L2)
- "GM" = Doble canto grueso (pon G en L1 y L2)
- Sin indicación = dejar vacío ("")
- Si hay letras después de las medidas como "D G" = L1:D, L2:G
- Ignora dibujos, esquemas y bocetos de muebles
- Interpreta texto manuscrito aunque tenga errores o sea difícil de leer

FORMATO DE LA VENDEDORA (tabla):
Las tablas de vendedora tienen columnas: Cant, Largo, Ancho, Veta, L1, L2, A1, A2
Los largos pueden tener puntos como separadores de miles: "1.304,0" = 1304mm, "206,0" = 206mm

IMPORTANTE:
- Largo y Ancho siempre en MILÍMETROS (mm). Si ves "206" asume mm.
- Si las medidas parecen estar en cm (valores < 10), multiplica x 10 para convertir a mm.
- Material por defecto: "MELA PELIKANO BLANCO" si no se indica otro.
- Ignora completamente dibujos, esquemas, flechas y bocetos.
- Extrae TODAS las piezas que veas en la imagen.

RESPONDE ÚNICAMENTE con un JSON válido, sin texto adicional, sin explicaciones, sin bloques de código.
La estructura debe ser exactamente esta:

{"piezas":[{"material":"MELA PELIKANO BLANCO","qty":2,"largo":206,"ancho":80,"veta":"1-Longitud","l1":"D","l2":"D","a1":"","a2":"","obs":""}]}

Campos obligatorios por pieza:
- material: string (nombre del material, default "MELA PELIKANO BLANCO")
- qty: número entero (cantidad de piezas)
- largo: número entero en mm
- ancho: número entero en mm
- veta: "1-Longitud" o "2-Ancho" o "Sin veta" (default "1-Longitud")
- l1: "D", "G", "DM", "GM" o "" (canto lado largo superior)
- l2: "D", "G", "DM", "GM" o "" (canto lado largo inferior)
- a1: "D", "G", "DM", "GM" o "" (canto lado ancho izquierdo)
- a2: "D", "G", "DM", "GM" o "" (canto lado ancho derecho)
- obs: string con observaciones especiales o "" si no hay

Si ves algún valor que no puedes interpretar con certeza, escríbelo en el campo "obs" con el texto "REVISAR: [valor dudoso]".

RESPONDE SOLO EL JSON. Nada más.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: media_type || 'image/jpeg',
                  data: imagen_b64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Anthropic API error:', response.status, errorBody);
      return res.status(502).json({
        error: 'Error al llamar a la API de Claude',
        status: response.status,
        detalle: errorBody.slice(0, 300),
      });
    }

    const data = await response.json();
    const texto = (data.content || []).map((c) => c.text || '').join('');

    // Extraer JSON limpio
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(422).json({
        error: 'La IA no devolvió un JSON válido',
        respuesta_raw: texto.slice(0, 500),
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return res.status(422).json({
        error: 'JSON inválido en la respuesta de la IA',
        respuesta_raw: match[0].slice(0, 500),
      });
    }

    if (!parsed.piezas || !Array.isArray(parsed.piezas)) {
      return res.status(422).json({
        error: 'El JSON no tiene el campo "piezas"',
        respuesta_parsed: parsed,
      });
    }

    // Normalizar y validar cada pieza
    parsed.piezas = parsed.piezas.map((p, idx) => ({
      material: p.material || 'MELA PELIKANO BLANCO',
      qty: Math.max(1, parseInt(p.qty) || 1),
      largo: Math.round(parseFloat(String(p.largo).replace(',', '.')) || 0),
      ancho: Math.round(parseFloat(String(p.ancho).replace(',', '.')) || 0),
      veta: p.veta || '1-Longitud',
      l1: p.l1 || '',
      l2: p.l2 || '',
      a1: p.a1 || '',
      a2: p.a2 || '',
      obs: p.obs || '',
    }));

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Error en leer-lista:', err);
    return res.status(500).json({ error: 'Error interno', detalle: err.message });
  }
}
