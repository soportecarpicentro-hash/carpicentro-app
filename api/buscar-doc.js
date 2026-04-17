// api/buscar-doc.js — Proxy RENIEC/SUNAT (evita CORS desde el browser)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tipo, numero } = req.body || {};
  if (!tipo || !numero) return res.status(400).json({ error: 'Faltan tipo y numero' });

  const num = String(numero).trim().replace(/\D/g, '');
  const esRUC = tipo === 'RUC';

  if (esRUC && num.length !== 11)
    return res.status(200).json({ nombre: null, error: 'RUC debe tener 11 dígitos.' });
  if (!esRUC && tipo === 'DNI' && num.length !== 8)
    return res.status(200).json({ nombre: null, error: 'DNI debe tener 8 dígitos.' });

  // Extraer nombre de cualquier formato de respuesta de las APIs peruanas
  function extraer(d) {
    if (!d || typeof d !== 'object') return null;
    for (const k of ['nombre','razonSocial','nombreCompleto','name','razon_social']) {
      if (d[k] && String(d[k]).trim().length > 2) return String(d[k]).trim();
    }
    // RENIEC devuelve partes separadas
    const partes = [d.nombres, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean);
    if (partes.length) { const n=partes.join(' ').trim(); if(n.length>2) return n; }
    return null;
  }

  // Token del entorno (configurable en Vercel env vars) con fallbacks
  const TOKEN = process.env.APIS_NET_PE_TOKEN || '';

  // Lista de endpoints a probar en orden
  const urls = esRUC ? [
    { url: `https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, tok: TOKEN },
    { url: `https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, tok: '' },
    { url: `https://api.apis.net.pe/v1/ruc?numero=${num}`, tok: TOKEN },
    { url: `https://api.apis.net.pe/v1/ruc?numero=${num}`, tok: '' },
  ] : [
    { url: `https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, tok: TOKEN },
    { url: `https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, tok: '' },
    { url: `https://api.apis.net.pe/v1/dni?numero=${num}`, tok: TOKEN },
    { url: `https://api.apis.net.pe/v1/dni?numero=${num}`, tok: '' },
  ];

  for (const { url, tok } of urls) {
    try {
      const hdrs = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
      if (tok) hdrs['Authorization'] = `Bearer ${tok}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(url, { headers: hdrs, signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      const nombre = extraer(data);
      if (nombre) return res.status(200).json({ nombre });
    } catch (_) { continue; }
  }

  return res.status(200).json({
    nombre: null,
    error: `${tipo} no encontrado en el registro. Ingresa el nombre manualmente.`
  });
}
