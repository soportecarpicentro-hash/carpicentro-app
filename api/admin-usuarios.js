// api/admin-usuarios.js — Gestión de usuarios con Supabase service key (nunca expuesta al frontend)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const SB = 'https://cybybindlspwbkocrang.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY no configurada en Vercel' });

  const svcHH = {
    'Content-Type': 'application/json',
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  };

  // ── Verificar que el llamador tiene sesión de admin válida ──────────
  const callerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!callerToken) return res.status(401).json({ error: 'Sin autorización' });

  const callerUser = await fetch(`${SB}/auth/v1/user`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${callerToken}` },
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  if (!callerUser?.email) return res.status(401).json({ error: 'Sesión inválida o expirada' });

  const callerUsr = callerUser.email.split('@')[0];
  const callerPerfil = await fetch(
    `${SB}/rest/v1/usuarios?usuario=eq.${encodeURIComponent(callerUsr)}&select=rol`,
    { headers: svcHH }
  ).then(r => r.ok ? r.json() : []).catch(() => []);

  if (!['admin'].includes(callerPerfil[0]?.rol)) {
    return res.status(403).json({ error: 'Solo administradores pueden gestionar usuarios' });
  }

  // ── Acción ─────────────────────────────────────────────────────────
  const { accion, usuario, password, nombre, rol, activo, usuario_id, sede } = req.body || {};

  try {
    // ── CREAR ──────────────────────────────────────────────────────
    if (accion === 'crear') {
      if (!usuario || !password || !nombre || !rol) {
        return res.status(400).json({ error: 'Faltan campos: nombre, usuario, password, rol' });
      }
      const email = `${usuario}@carpicentro.pe`;

      // 1. Crear cuenta en Supabase Auth
      const authRes = await fetch(`${SB}/auth/v1/admin/users`, {
        method: 'POST',
        headers: svcHH,
        body: JSON.stringify({ email, password, email_confirm: true }),
      }).then(r => r.json());

      if (!authRes.id) {
        return res.status(400).json({ error: 'Error en Auth: ' + (authRes.message || authRes.msg || JSON.stringify(authRes)) });
      }

      // 2. Crear perfil en tabla usuarios (con auth_user_id vinculado)
      await fetch(`${SB}/rest/v1/usuarios`, {
        method: 'POST',
        headers: { ...svcHH, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ nombre, usuario, password_hash: password, rol, activo: true, auth_user_id: authRes.id, sede: sede||'Independencia' }),
      });

      return res.status(200).json({ ok: true });

    // ── ACTUALIZAR ─────────────────────────────────────────────────
    } else if (accion === 'actualizar') {
      if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' });

      // Obtener auth_user_id del perfil actual
      const perfilActual = await fetch(
        `${SB}/rest/v1/usuarios?id=eq.${usuario_id}&select=auth_user_id`,
        { headers: svcHH }
      ).then(r => r.ok ? r.json() : []);

      const authUserId = perfilActual[0]?.auth_user_id;

      // Si hay contraseña nueva y tenemos auth_user_id, actualizar en Auth también
      if (password && authUserId) {
        await fetch(`${SB}/auth/v1/admin/users/${authUserId}`, {
          method: 'PUT',
          headers: svcHH,
          body: JSON.stringify({ password }),
        });
      }

      // Actualizar tabla usuarios
      const datos = {};
      if (nombre !== undefined) datos.nombre = nombre;
      if (rol !== undefined) datos.rol = rol;
      if (activo !== undefined) datos.activo = activo;
      if (password) datos.password_hash = password;
      if (sede !== undefined) datos.sede = sede;

      await fetch(`${SB}/rest/v1/usuarios?id=eq.${usuario_id}`, {
        method: 'PATCH',
        headers: { ...svcHH, 'Prefer': 'return=minimal' },
        body: JSON.stringify(datos),
      });

      return res.status(200).json({ ok: true });

    // ── ELIMINAR ───────────────────────────────────────────────────
    } else if (accion === 'eliminar') {
      if (!usuario_id) return res.status(400).json({ error: 'Falta usuario_id' });

      // Obtener auth_user_id para eliminar de Auth también
      const perfil = await fetch(
        `${SB}/rest/v1/usuarios?id=eq.${usuario_id}&select=auth_user_id`,
        { headers: svcHH }
      ).then(r => r.ok ? r.json() : []);

      const authUserId = perfil[0]?.auth_user_id;
      if (authUserId) {
        await fetch(`${SB}/auth/v1/admin/users/${authUserId}`, {
          method: 'DELETE',
          headers: svcHH,
        });
      }

      // Eliminar de tabla usuarios
      await fetch(`${SB}/rest/v1/usuarios?id=eq.${usuario_id}`, {
        method: 'DELETE',
        headers: svcHH,
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Acción no reconocida: ' + accion });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
