// api/buscar-doc.js — Proxy RENIEC/SUNAT
// Múltiples APIs + parseo robusto de todos los formatos de respuesta

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

  if (esRUC && num.length !== 11) return res.status(200).json({ nombre: null, error: 'RUC debe tener 11 dígitos.' });
  if (!esRUC && tipo === 'DNI' && num.length !== 8) return res.status(200).json({ nombre: null, error: 'DNI debe tener 8 dígitos.' });

  function extraerNombre(d) {
    if (!d || typeof d !== 'object') return null;
    if (d.nombre && String(d.nombre).trim().length > 2) return String(d.nombre).trim();
    if (d.razonSocial && String(d.razonSocial).trim().length > 2) return String(d.razonSocial).trim();
    if (d.nombreCompleto && String(d.nombreCompleto).trim().length > 2) return String(d.nombreCompleto).trim();
    if (d.name && String(d.name).trim().length > 2) return String(d.name).trim();
    // Formato con partes separadas (RENIEC v2)
    const n = [d.nombres, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean).join(' ').trim();
    if (n.length > 2) return n;
    return null;
  }

  // Token del entorno o token de respaldo
  const tok = process.env.APIS_NET_PE_TOKEN || 'apis-token-13621.LuUTvIBcFMq0WxI5lbPa5d5OJkAuiN17';

  const urls = esRUC
    ? [
        [`https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, tok],
        [`https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, ''],
        [`https://api.apis.net.pe/v1/ruc?numero=${num}`, tok],
        [`https://api.apis.net.pe/v1/ruc?numero=${num}`, ''],
      ]
    : [
        [`https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, tok],
        [`https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, ''],
        [`https://api.apis.net.pe/v1/dni?numero=${num}`, tok],
        [`https://api.apis.net.pe/v1/dni?numero=${num}`, ''],
      ];

  for (const [url, token] of urls) {
    try {
      const headers = { Accept: 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(t);

      if (!r.ok) continue;
      const data = await r.json();
      const nombre = extraerNombre(data);
      if (nombre) return res.status(200).json({ nombre });
    } catch (_) { continue; }
  }

  return res.status(200).json({
    nombre: null,
    error: `${tipo} no encontrado. Ingresa el nombre manualmente.`
  });
}
