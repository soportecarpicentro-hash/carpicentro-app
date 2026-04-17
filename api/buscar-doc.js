// api/buscar-doc.js — Proxy RENIEC/SUNAT sin CORS
// DNI: múltiples APIs gratuitas en cascada
// RUC: apis.net.pe (no tocar — funciona)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tipo, numero } = req.body || {};
  if (!tipo || !numero) return res.status(400).json({ error: 'Faltan tipo y numero' });
  const num = String(numero).trim().replace(/\D/g, '');

  // Validar longitud
  if (tipo === 'DNI' && num.length !== 8)
    return res.status(200).json({ nombre: null, error: 'El DNI debe tener 8 dígitos.' });
  if (tipo === 'RUC' && num.length !== 11)
    return res.status(200).json({ nombre: null, error: 'El RUC debe tener 11 dígitos.' });

  // Parsear nombre de cualquier formato de respuesta
  function extraer(d) {
    if (!d || typeof d !== 'object') return null;
    // Formatos directos
    for (const k of ['nombre', 'razonSocial', 'nombreCompleto', 'name']) {
      if (d[k] && String(d[k]).trim().length > 2) return String(d[k]).trim();
    }
    // RENIEC devuelve partes separadas: nombres + apellidos
    const n = [d.nombres, d.apellidoPaterno, d.apellidoMaterno]
      .filter(x => x && String(x).trim())
      .join(' ').trim();
    if (n.length > 2) return n;
    return null;
  }

  async function intentar(url, headers = {}, timeoutMs = 7000) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) return null;
      const data = await r.json();
      return extraer(data);
    } catch (_) { return null; }
  }

  // ── RUC: no tocar, funciona ──
  if (tipo === 'RUC') {
    const tok = process.env.APIS_NET_PE_TOKEN || '';
    const urls = [
      [`https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, tok ? { Authorization: `Bearer ${tok}` } : {}],
      [`https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, {}],
      [`https://api.apis.net.pe/v1/ruc?numero=${num}`, tok ? { Authorization: `Bearer ${tok}` } : {}],
      [`https://api.apis.net.pe/v1/ruc?numero=${num}`, {}],
    ];
    for (const [url, hdrs] of urls) {
      const nombre = await intentar(url, hdrs);
      if (nombre) return res.status(200).json({ nombre });
    }
    return res.status(200).json({ nombre: null, error: 'RUC no encontrado. Ingresa el nombre manualmente.' });
  }

  // ── DNI: múltiples APIs RENIEC ──
  const tok = process.env.APIS_NET_PE_TOKEN || '';

  // Lista ordenada de APIs para DNI — empezar por las más confiables
  const intentosDNI = [
    // 1. apis.net.pe v2 con token (el más confiable si el token es válido)
    () => tok ? intentar(
      `https://api.apis.net.pe/v2/reniec/dni?numero=${num}`,
      { Authorization: `Bearer ${tok}` }
    ) : null,

    // 2. apis.net.pe v2 sin token (a veces funciona gratis)
    () => intentar(`https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, {}),

    // 3. apis.net.pe v1 con token
    () => tok ? intentar(
      `https://api.apis.net.pe/v1/dni?numero=${num}`,
      { Authorization: `Bearer ${tok}` }
    ) : null,

    // 4. apis.net.pe v1 sin token
    () => intentar(`https://api.apis.net.pe/v1/dni?numero=${num}`, {}),

    // 5. apiperu.dev — API gratuita peruana
    () => intentar(`https://apiperu.dev/api/dni/${num}`, {}, 8000),

    // 6. consulta.pe — otro endpoint gratuito
    () => intentar(`https://api.consulta.pe/dni/${num}`, {}, 8000),
  ];

  for (const fn of intentosDNI) {
    const nombre = await fn();
    if (nombre) return res.status(200).json({ nombre });
  }

  return res.status(200).json({
    nombre: null,
    error: 'DNI no encontrado en RENIEC. Ingresa el nombre manualmente.'
  });
}
