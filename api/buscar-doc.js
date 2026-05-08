// api/buscar-doc.js — Proxy RENIEC/SUNAT
//
// Para DNI confiable (gratis, sin pagar):
//   1. Registrarse en https://apis.net.pe/app  → copiar token
//   2. En Vercel → Settings → Environment Variables → agregar:
//      APIS_NET_PE_TOKEN = <tu token>
//   También se puede agregar APIPERU_DEV_TOKEN desde https://apiperu.dev
//
// IMPORTANTE: el token va PRIMERO para no agotar el timeout de 10s de Vercel.
// eldni.com está bloqueado para IPs de servidores — se intenta de último.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tipo, numero } = req.body || {};
  if (!tipo || !numero) return res.status(400).json({ error: 'Faltan tipo y numero' });
  const num = String(numero).trim().replace(/\D/g, '');

  if (tipo === 'DNI' && num.length !== 8)
    return res.status(200).json({ nombre: null, error: 'El DNI debe tener 8 dígitos.' });
  if (tipo === 'RUC' && num.length !== 11)
    return res.status(200).json({ nombre: null, error: 'El RUC debe tener 11 dígitos.' });

  function extraerJSON(d) {
    if (!d || typeof d !== 'object') return null;
    for (const k of ['nombre_completo', 'nombreCompleto', 'nombre', 'razonSocial', 'name', 'fullName']) {
      if (d[k] && String(d[k]).trim().length > 2) return String(d[k]).trim();
    }
    if (d.data) { const r = extraerJSON(d.data); if (r) return r; }
    const ap1  = d.apellidoPaterno  || d.apellido_paterno  || d.primerApellido  || '';
    const ap2  = d.apellidoMaterno  || d.apellido_materno  || d.segundoApellido || '';
    const noms = d.nombres || d.names || '';
    const aps  = d.apellidos || '';
    if (aps && noms) return `${noms.trim()} ${aps.trim()}`.trim();
    const partes = [noms, ap1, ap2].map(x => String(x || '').trim()).filter(Boolean);
    if (partes.length >= 2) return partes.join(' ');
    return null;
  }

  async function fetchJSON(url, options = {}, timeoutMs = 5000) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) return null;
      const data = await r.json();
      return extraerJSON(data);
    } catch (_) { return null; }
  }

  // ── DNI — orden optimizado para caber en el timeout de 10s de Vercel ──
  if (tipo === 'DNI') {
    const tokApisNet = process.env.APIS_NET_PE_TOKEN  || '';
    const tokApiperu = process.env.APIPERU_DEV_TOKEN  || '';

    // ── 1. apis.net.pe v2 CON token (~1-2s) — MÁS CONFIABLE ─────────────
    if (tokApisNet) {
      const nombre = await fetchJSON(
        `https://api.apis.net.pe/v2/reniec/dni?numero=${num}`,
        { headers: { Accept: 'application/json', Authorization: `Bearer ${tokApisNet}` } },
        5000
      );
      if (nombre) return res.status(200).json({ nombre });
    }

    // ── 2. apiperu.dev CON token (~1-2s) ─────────────────────────────────
    if (tokApiperu) {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch('https://apiperu.dev/api/dni', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json',
                     Authorization: `Bearer ${tokApiperu}` },
          body: JSON.stringify({ dni: num }),
          signal: ctrl.signal,
        });
        if (r.ok) {
          const nombre = extraerJSON(await r.json());
          if (nombre) return res.status(200).json({ nombre });
        }
      } catch (_) {}
    }

    // ── 3. apis.net.pe v2 SIN token (~1-2s, rate-limited) ────────────────
    {
      const nombre = await fetchJSON(
        `https://api.apis.net.pe/v2/reniec/dni?numero=${num}`,
        { headers: { Accept: 'application/json' } },
        4000
      );
      if (nombre) return res.status(200).json({ nombre });
    }

    // ── 4. apis.net.pe v1 SIN token (legacy fallback) ────────────────────
    {
      const nombre = await fetchJSON(
        `https://api.apis.net.pe/v1/dni?numero=${num}`,
        { headers: { Accept: 'application/json' } },
        3000
      );
      if (nombre) return res.status(200).json({ nombre });
    }

    // ── 5. eldni.com — scraping (a veces bloqueado en servidores, va último)
    try {
      const BASE = 'https://eldni.com';
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';
      const ctrl1 = new AbortController();
      setTimeout(() => ctrl1.abort(), 3500);
      const pageResp = await fetch(`${BASE}/pe/buscar-datos-por-dni`, {
        headers: { 'User-Agent': ua, Accept: 'text/html', 'Accept-Language': 'es-PE,es;q=0.9' },
        signal: ctrl1.signal,
      });
      if (pageResp.ok) {
        const pageHTML = await pageResp.text();
        const rawCookies = (typeof pageResp.headers.getSetCookie === 'function'
          ? pageResp.headers.getSetCookie()
          : [pageResp.headers.get('set-cookie') || '']
        ).map(c => c.split(';')[0]).filter(Boolean).join('; ');
        const csrf = (pageHTML.match(/name="_token"\s+value="([^"]+)"/) || [])[1] || '';
        if (csrf) {
          const ctrl2 = new AbortController();
          setTimeout(() => ctrl2.abort(), 4000);
          const postResp = await fetch(`${BASE}/pe/buscar-datos-por-dni`, {
            method: 'POST',
            headers: { 'User-Agent': ua, 'Content-Type': 'application/x-www-form-urlencoded',
                       Accept: 'text/html', 'Accept-Language': 'es-PE,es;q=0.9',
                       Referer: `${BASE}/pe/buscar-datos-por-dni`, Cookie: rawCookies, Origin: BASE },
            body: `_token=${encodeURIComponent(csrf)}&dni=${num}`,
            signal: ctrl2.signal,
          });
          if (postResp.ok) {
            const nombre = extraerHTMLeldni(await postResp.text());
            if (nombre) return res.status(200).json({ nombre });
          }
        }
      }
    } catch (_) {}

    return res.status(200).json({ nombre: null, error: 'DNI no encontrado. Ingresa el nombre manualmente.' });
  }

  // ── RUC — no tocar, funciona ──────────────────────────────────────────
  const tok = process.env.APIS_NET_PE_TOKEN || '';
  for (const [url, hdrs] of [
    tok  ? [`https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, { Authorization: `Bearer ${tok}` }] : null,
    [`https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, {}],
    tok  ? [`https://api.apis.net.pe/v1/ruc?numero=${num}`, { Authorization: `Bearer ${tok}` }] : null,
    [`https://api.apis.net.pe/v1/ruc?numero=${num}`, {}],
  ].filter(Boolean)) {
    const nombre = await fetchJSON(url, { headers: { Accept: 'application/json', ...hdrs } }, 5000);
    if (nombre) return res.status(200).json({ nombre });
  }
  return res.status(200).json({ nombre: null, error: 'RUC no encontrado. Ingresa el nombre manualmente.' });
}

function extraerHTMLeldni(html) {
  const patrones = [
    /(?:Nombres?)\s*<\/td>\s*<td[^>]*>\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{2,50})\s*<\/td>/i,
    /(?:Nombres?)\s*<\/th>\s*<td[^>]*>\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{2,50})\s*<\/td>/i,
    /<(?:strong|b)>\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{5,60})\s*<\/(?:strong|b)>/,
    /class="[^"]*(?:result|nombre|dato)[^"]*"[^>]*>\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s]{4,60})\s*</i,
  ];
  for (const re of patrones) {
    const m = html.match(re);
    if (m && m[1].trim().length > 3) return m[1].trim();
  }
  const tds = html.match(/<td[^>]*>\s*([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ ]{5,60})\s*<\/td>/g) || [];
  for (const td of tds) {
    const text = td.replace(/<[^>]+>/g, '').trim();
    if (text.length > 5 && /^[A-ZÁÉÍÓÚÑÜ\s]+$/.test(text) &&
        !['NOMBRES', 'APELLIDO', 'PATERNO', 'MATERNO', 'SEXO', 'ESTADO CIVIL'].includes(text))
      return text;
  }
  return null;
}
