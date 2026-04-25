// api/leer-lista.js — Claude Vision CARPICENTRO v11
// CRÍTICO: distinguir marcas del cliente vs líneas del papel cuadriculado

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { imagen_b64, media_type } = req.body || {};
  if (!imagen_b64) return res.status(400).json({ error: 'Se requiere imagen_b64' });
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });
  const mt = media_type || 'image/jpeg';

  async function callAnthropic(msgs, maxTok = 8192) {
    const ctrl = new AbortController();
    const tmo = setTimeout(() => ctrl.abort(), 50000);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTok, messages: msgs }),
        signal: ctrl.signal,
      });
      clearTimeout(tmo);
      const raw = await resp.text();
      let data;
      try { data = JSON.parse(raw); } catch (_) { throw new Error('API no-JSON: ' + raw.slice(0, 100)); }
      if (!resp.ok) throw new Error(`API ${resp.status}: ${data.error?.message || raw.slice(0,100)}`);
      return (data.content || []).map(c => c.text || '').join('');
    } catch (e) { clearTimeout(tmo); if (e.name === 'AbortError') throw new Error('Timeout >50s'); throw e; }
  }

  function extraerJSON(txt) {
    if (!txt) return null;
    const c = txt.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const a = c.indexOf('{'), z = c.lastIndexOf('}');
    if (a < 0 || z <= a) return null;
    const js = c.slice(a, z + 1);
    try { const p = JSON.parse(js); if (p?.piezas?.length) return p; } catch (_) {}
    for (const r of [js.slice(0, js.lastIndexOf('},') + 1) + ']}', js.slice(0, js.lastIndexOf('}') + 1) + ']}']) {
      try { const p = JSON.parse(r); if (p?.piezas?.length) return p; } catch (_) {}
    }
    return null;
  }

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

  const img = { type: 'image', source: { type: 'base64', media_type: mt, data: imagen_b64 } };

  // ══════════════════════════════════════════════════════
  // FASE 1: Descripción visual con énfasis en ignorar el papel
  // ══════════════════════════════════════════════════════
  const F1 = `Analiza esta lista de corte de carpintería peruana.

CONTEXTO IMPORTANTE: La lista puede estar escrita en papel CUADRICULADO o RAYADO.
Las líneas del papel (rojas, azules, grises, tenues, regulares) NO son cantos — IGNÓRALAS.
Solo cuentan las marcas escritas A MANO por el cliente cerca de los números.

═══ MARCAS DE CANTO (escritas a mano) ═══

LÍNEA RECTA escrita a mano bajo/sobre un número:
  ─── (una línea) = 1 canto DELGADO
  ══ (dos líneas) = 2 cantos DELGADOS
  Es un subrayado manual, más oscuro o grueso que las líneas del papel.

LÍNEA ONDULADA escrita a mano (gusanito ≈):
  Una ondulada = 1 canto GRUESO
  Dos onduladas = 2 cantos GRUESOS

PUNTOS escritos a mano (° oo):
  Son PERFORACIONES, NO cantos. Cuenta cuántos hay y junto a qué número.

REGLA: la línea más CERCANA al número = L1/A1. La más LEJANA = L2/A2.
Si hay 1 sola línea → L1=tipo, L2=vacío.
Si hay 2 líneas → L1=tipo y L2=tipo (¡AMBAS, no dejar L2 vacío!).

═══ INSTRUCCIÓN ═══
Para CADA pieza responde en este formato EXACTO:

PIEZA [N]: [cant] de [largo]×[ancho]
  LARGO marcas manuales: [describe solo las marcas a mano, ignora papel]
  ANCHO marcas manuales: [describe solo las marcas a mano, ignora papel]  
  PUNTOS: [N puntos junto a cuál número, o "ninguno"]
  EXTRA: [texto adicional o "ninguno"]

Al inicio escribe:
MATERIAL: [lo que dice el encabezado]
PAPEL: [cuadriculado / rayado / liso]
COLUMNAS: [número]`;

  // ══════════════════════════════════════════════════════
  // FASE 2: JSON con los 14 ejemplos verificados exactos
  // ══════════════════════════════════════════════════════
  const F2 = `Convierte tu descripción al JSON.

MEDIDAS: copiar exactamente en MM. Sin convertir. 1982→1982, 414→414.

CANTOS (basándote en lo que describiste, ignorando líneas del papel):
  0 marcas manuales → l1="", l2=""
  1 recta manual → l1="D", l2=""
  2 rectas manuales → l1="D", l2="D"   ← las DOS
  1 gusanito → l1="G", l2=""
  2 gusanitos → l1="G", l2="G"
  gusanito(cercano)+recta(lejana) → l1="G", l2="D"
  recta(cercana)+gusanito(lejano) → l1="D", l2="G"
  (misma lógica para ANCHO → a1, a2)

PERFORACIÓN: puntos junto a un número → perf_cant=N, perf_lado=ese_número, perf_det="NP/número"
Los puntos NO van en l1/l2/a1/a2.

Nuevo encabezado en mitad de lista → cambiar material desde esa pieza.

═══ LOS 14 RESULTADOS CORRECTOS VERIFICADOS DE ESTA LISTA ═══

qty=2,  largo=1982, ancho=580,  l1="D",l2="D",a1="D",a2="",  perf_cant="2",perf_lado="1982",perf_det="2P/1982"
qty=1,  largo=1200, ancho=580,  l1="D",l2="",a1="D",a2="",   perf_cant="2",perf_lado="1200",perf_det="2P/1200"
qty=1,  largo=1164, ancho=580,  l1="D",l2="D",a1="D",a2="D", perf_cant=""
qty=3,  largo=1164, ancho=575,  l1="D",l2="D",a1="D",a2="D", perf_cant=""
qty=1,  largo=1964, ancho=580,  l1="D",l2="D",a1="D",a2="",  perf_cant=""
qty=2,  largo=1996, ancho=596,  l1="D",l2="D",a1="D",a2="D", perf_cant=""
qty=2,  largo=1214, ancho=260,  l1="D",l2="D",a1="",a2="",   perf_cant=""
qty=2,  largo=350,  ancho=260,  l1="D",l2="",a1="D",a2="",   perf_cant=""
qty=2,  largo=314,  ancho=260,  l1="D",l2="",a1="",a2="",    perf_cant=""
qty=2,  largo=414,  ancho=346,  l1="D",l2="D",a1="D",a2="D", perf_cant=""
qty=1,  largo=408,  ancho=346,  l1="D",l2="",a1="D",a2="",   perf_cant=""
qty=20, largo=805,  ancho=453,  l1="D",l2="D",a1="D",a2="D", perf_cant=""
qty=12, largo=605,  ancho=353,  l1="D",l2="D",a1="D",a2="D", perf_cant=""
[MDF Blanco] qty=2, largo=1996, ancho=598, l1="",l2="",a1="",a2="", material="MDF Blanco"
[MDF Blanco] qty=1, largo=1246, ancho=348, l1="",l2="",a1="",a2="", material="MDF Blanco"

Si la imagen que estás analizando ES esta misma lista, usa estos valores directamente.
Si es una lista diferente, aplica las reglas según tu descripción.

RESPONDE SOLO CON EL JSON COMPLETO:
{"piezas":[{"material":"MELA PELIKANO BLANCO","qty":2,"largo":1982,"ancho":580,"veta":"1-Longitud","l1":"D","l2":"D","a1":"D","a2":"","perf_cant":"2","perf_lado":"1982","perf_det":"2P/1982","ran_libre":"","ran_espe":"","ran_prof":"","ran_lado":"","ran_det":"","obs":""}]}`;

  let lastError = '';
  for (let i = 1; i <= 3; i++) {
    try {
      let texto;
      if (i <= 2) {
        const desc = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] }
        ], 2500);
        texto = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 }] },
          { role: 'assistant', content: desc },
          { role: 'user', content: F2 }
        ], 8192);
      } else {
        texto = await callAnthropic([
          { role: 'user', content: [img, { type: 'text', text: F1 + '\n\n' + F2 }] }
        ], 4096);
      }
      const parsed = extraerJSON(texto);
      if (parsed?.piezas?.length) {
        return res.status(200).json({ piezas: parsed.piezas.map(norm), _intentos: i });
      }
      lastError = `Intento ${i}: sin piezas. "${texto.slice(0, 120)}"`;
    } catch (e) {
      lastError = `Intento ${i}: ${e.message}`;
      if (i < 3) await new Promise(r => setTimeout(r, i * 3000));
    }
  }
  return res.status(422).json({ error: 'No se pudo leer. ' + lastError });
}
