// api/buscar-doc.js — Proxy para RENIEC/SUNAT
// Resuelve el problema de CORS: el browser no puede llamar a apis.net.pe
// directamente, pero el servidor de Vercel sí puede.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tipo, numero } = req.body;
  if (!tipo || !numero) {
    return res.status(400).json({ error: 'Se requiere tipo y numero' });
  }

  const TOKEN = 'apis-token-13621.LuUTvIBcFMq0WxI5lbPa5d5OJkAuiN17';

  const url = tipo === 'RUC'
    ? `https://api.apis.net.pe/v2/sunat/ruc?numero=${numero}`
    : `https://api.apis.net.pe/v2/reniec/dni?numero=${numero}`;

  try {
    // Intento 1: con token
    let response = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    // Intento 2: sin token si falla
    if (!response.ok) {
      response = await fetch(url);
    }

    if (!response.ok) {
      return res.status(200).json({
        nombre: null,
        error: `No encontrado (${response.status}). Ingresa el nombre manualmente.`
      });
    }

    const data = await response.json();
    const nombre = data?.razonSocial || data?.nombre || data?.nombreCompleto || null;

    return res.status(200).json({
      nombre: nombre || null,
      raw: nombre ? undefined : data,
      error: nombre ? null : 'Número no encontrado en el registro. Ingresa el nombre manualmente.'
    });

  } catch (err) {
    console.error('buscar-doc error:', err);
    return res.status(200).json({
      nombre: null,
      error: 'Servicio no disponible. Ingresa el nombre manualmente.'
    });
  }
}
