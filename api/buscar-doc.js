// api/buscar-doc.js — Proxy RENIEC/SUNAT sin CORS
// Prueba múltiples endpoints para garantizar respuesta

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

  // Lista de intentos: distintos endpoints y tokens
  const intentos = esRUC ? [
    { url: `https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`,
      headers: { Authorization: 'Bearer apis-token-13621.LuUTvIBcFMq0WxI5lbPa5d5OJkAuiN17' } },
    { url: `https://api.apis.net.pe/v1/ruc?numero=${num}`, headers: {} },
    { url: `https://apisunat.com/api/v1/contribuyente/datos?ruc=${num}`, headers: {} },
  ] : [
    { url: `https://api.apis.net.pe/v2/reniec/dni?numero=${num}`,
      headers: { Authorization: 'Bearer apis-token-13621.LuUTvIBcFMq0WxI5lbPa5d5OJkAuiN17' } },
    { url: `https://api.apis.net.pe/v1/dni?numero=${num}`, headers: {} },
    { url: `https://dniruc.apisperu.com/api/v1/dni/${num}?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJlbWFpbCI6ImNhcnBpY2VudHJvMjAyNEBnbWFpbC5jb20ifQ.UEXGbgCRMBKxiPz99H-_GBlFxFzGjD7vHKxOoQ7j_EA`, headers: {} },
  ];

  for (const intento of intentos) {
    try {
      const response = await fetch(intento.url, {
        headers: { 'Content-Type': 'application/json', ...intento.headers },
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
      });
      if (!response.ok) continue;
      const data = await response.json();
      const nombre = data?.razonSocial || data?.nombre || data?.nombreCompleto
                  || data?.nombre_completo || data?.name || null;
      if (nombre) {
        return res.status(200).json({ nombre: nombre.trim() });
      }
    } catch (e) {
      // Siguiente intento
      continue;
    }
  }

  // Todos los intentos fallaron
  return res.status(200).json({
    nombre: null,
    error: 'No se encontró el ' + tipo + '. Por favor ingresa el nombre manualmente.'
  });
}
