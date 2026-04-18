// api/buscar-doc.js — Proxy RENIEC/SUNAT
// DNI: eldni.com (scraping) + APIs como fallback
// RUC: apis.net.pe (funciona, no tocar)

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

  // Parsear nombre de cualquier formato JSON
  function extraerJSON(d) {
    if (!d || typeof d !== 'object') return null;
    for (const k of ['nombre', 'razonSocial', 'nombreCompleto', 'name']) {
      if (d[k] && String(d[k]).trim().length > 2) return String(d[k]).trim();
    }
    const n = [d.nombres, d.apellidoPaterno, d.apellidoMaterno]
      .filter(x => x && String(x).trim()).join(' ').trim();
    if (n.length > 2) return n;
    return null;
  }

  // Extraer nombre del HTML de eldni.com
  function extraerHTMLeldni(html) {
    // El HTML tiene el nombre en una tabla o div con los datos
    const patrones = [
      /Nombres?[:\s<\/td>]+<td[^>]*>([^<]{4,60})<\/td>/i,
      /class="[^"]*nombre[^"]*"[^>]*>([^<]{4,60})</i,
      /<strong>([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{3,50})<\/strong>/,
      /Apellido Paterno[^:]*:\s*([A-ZÁÉÍÓÚÑ][A-Z\s]{2,30})/i,
    ];
    for (const re of patrones) {
      const m = html.match(re);
      if (m && m[1].trim().length > 3) return m[1].trim();
    }
    // Buscar tabla con datos personales
    const tdMatch = html.match(/<td[^>]*>([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{5,60})<\/td>/g);
    if (tdMatch) {
      for (const td of tdMatch) {
        const text = td.replace(/<[^>]+>/g, '').trim();
        if (text.length > 5 && /^[A-ZÁÉÍÓÚÑ\s]+$/.test(text) && !text.includes('NOMBRES')) {
          return text;
        }
      }
    }
    return null;
  }

  async function fetchJSON(url, options = {}, timeoutMs = 8000) {
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

  // ── DNI — eldni.com scraping + APIs fallback ──
  if (tipo === 'DNI') {
    // Método 1: eldni.com — scraping con CSRF token
    try {
      const BASE = 'https://eldni.com';
      const ctrl1 = new AbortController();
      setTimeout(() => ctrl1.abort(), 8000);
      const pageResp = await fetch(`${BASE}/pe/buscar-datos-por-dni`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-PE,es;q=0.9',
        },
        signal: ctrl1.signal,
      });
      if (pageResp.ok) {
        const pageHTML = await pageResp.text();
        const cookieHeader = pageResp.headers.get('set-cookie') || '';
        // Extraer CSRF token
        const tokenMatch = pageHTML.match(/name="_token"\s+value="([^"]+)"/);
        const csrf = tokenMatch ? tokenMatch[1] : '';
        if (csrf) {
          const ctrl2 = new AbortController();
          setTimeout(() => ctrl2.abort(), 10000);
          const postResp = await fetch(`${BASE}/pe/buscar-datos-por-dni`, {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'text/html,application/xhtml+xml',
              'Accept-Language': 'es-PE,es;q=0.9',
              'Referer': `${BASE}/pe/buscar-datos-por-dni`,
              'Cookie': cookieHeader.split(';')[0] || '',
              'Origin': BASE,
            },
            body: `_token=${encodeURIComponent(csrf)}&dni=${num}`,
            signal: ctrl2.signal,
          });
          if (postResp.ok) {
            const resultHTML = await postResp.text();
            const nombre = extraerHTMLeldni(resultHTML);
            if (nombre) return res.status(200).json({ nombre });
          }
        }
      }
    } catch (_) { /* siguiente método */ }

    // Método 2: apis.net.pe con token del entorno
    const tok = process.env.APIS_NET_PE_TOKEN || '';
    const apiUrls = [
      tok ? [`https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, { Authorization: `Bearer ${tok}` }] : null,
      [`https://api.apis.net.pe/v2/reniec/dni?numero=${num}`, {}],
      tok ? [`https://api.apis.net.pe/v1/dni?numero=${num}`, { Authorization: `Bearer ${tok}` }] : null,
      [`https://api.apis.net.pe/v1/dni?numero=${num}`, {}],
    ].filter(Boolean);

    for (const [url, hdrs] of apiUrls) {
      const nombre = await fetchJSON(url, { headers: { Accept: 'application/json', ...hdrs } });
      if (nombre) return res.status(200).json({ nombre });
    }

    return res.status(200).json({
      nombre: null,
      error: 'DNI no encontrado. Ingresa el nombre manualmente.'
    });
  }

  // ── RUC — no tocar, funciona ──
  const tok = process.env.APIS_NET_PE_TOKEN || '';
  const rucUrls = [
    tok ? [`https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, { Authorization: `Bearer ${tok}` }] : null,
    [`https://api.apis.net.pe/v2/sunat/ruc?numero=${num}`, {}],
    tok ? [`https://api.apis.net.pe/v1/ruc?numero=${num}`, { Authorization: `Bearer ${tok}` }] : null,
    [`https://api.apis.net.pe/v1/ruc?numero=${num}`, {}],
  ].filter(Boolean);

  for (const [url, hdrs] of rucUrls) {
    const nombre = await fetchJSON(url, { headers: { Accept: 'application/json', ...hdrs } });
    if (nombre) return res.status(200).json({ nombre });
  }
  return res.status(200).json({ nombre: null, error: 'RUC no encontrado. Ingresa el nombre manualmente.' });
}
