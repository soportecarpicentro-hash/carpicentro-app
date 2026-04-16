// api/buscar-doc.js — Proxy RENIEC/SUNAT sin CORS
// Intenta múltiples APIs y parsea distintos formatos de respuesta

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tipo, numero } = req.body || {};
  if (!tipo || !numero) return res.status(400).json({ error: 'Se requiere tipo y numero' });

  const num = String(numero).trim().replace(/\D/g, '');
  const esRUC = tipo === 'RUC';

  if (esRUC && num.length !== 11)
    return res.status(200).json({ nombre: null, error: 'El RUC debe tener 11 dígitos.' });
  if (!esRUC && tipo === 'DNI' && num.length !== 8)
    return res.status(200).json({ nombre: null, error: 'El DNI debe tener 8 dígitos.' });

  const TOKEN = process.env.APIS_NET_PE_TOKEN || 'apis-token-13621.LuUTvIBcFMq0WxI5lbPa5d5OJkAuiN17';

  // Función para extraer nombre de cualquier formato de respuesta
  function extraerNombre(d) {
    if (!d || typeof d !== 'object') return null;
    // Formato 1: nombre directo
    if (d.nombre && d.nombre.length > 2) return d.nombre.trim();
    if (d.razonSocial && d.razonSocial.length > 2) return d.razonSocial.trim();
    if (d.nombreCompleto && d.nombreCompleto.length > 2) return d.nombreCompleto.trim();
    if (d.name && d.name.length > 2) return d.name.trim();
    // Formato 2: partes separadas
    if (d.nombres || d.apellidoPaterno) {
      const partes = [d.nombres, d.apellidoPaterno, d.apellidoMaterno].filter(Boolean);
      const resultado = partes.join(' ').trim();
      if (resultado.length > 2) return resultado;
    }
    return null;
  }

  const intentosDNI = [
    { url: `https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, headers: { Authorization: `Bearer ${TOKEN}` } },
    { url: `https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, headers: {} },
    { url: `https://api.apis.net.pe/v1/dni?numero=${num}`, headers: { Authorization: `Bearer ${TOKEN}` } },
    { url: `https://api.apis.net.pe/v1/dni?numero=${num}`, headers: {} },
  ];

  const intentosRUC = [
    { url: `https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, headers: { Authorization: `Bearer ${TOKEN}` } },
    { url: `https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, headers: {} },
    { url: `https://api.apis.net.pe/v1/ruc?numero=${num}`, headers: { Authorization: `Bearer ${TOKEN}` } },
  ];

  const intentos = esRUC ? intentosRUC : intentosDNI;

  for (const intento of intentos) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);
      const r = await fetch(intento.url, {
        headers: { Accept: 'application/json', ...intento.headers },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) continue;
      const data = await r.json();
      const nombre = extraerNombre(data);
      if (nombre) return res.status(200).json({ nombre });
    } catch (_) { continue; }
  }

  return res.status(200).json({
    nombre: null,
    error: `${tipo} no encontrado. Por favor ingresa el nombre manualmente.`
  });
}
