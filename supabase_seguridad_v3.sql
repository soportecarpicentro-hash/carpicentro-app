-- ══════════════════════════════════════════════════════════════
-- CARPICENTRO — Script de seguridad RLS v3
-- Elimina TODAS las políticas existentes antes de crear las nuevas
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- PASO 0: Ver qué políticas existen actualmente (diagnóstico)
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- PASO 1: Eliminar TODAS las políticas en las 5 tablas
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('pedidos','pedido_piezas','pedido_historial','usuarios','soporte_mensajes')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    RAISE NOTICE 'Eliminada política: % en %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- PASO 2: Habilitar y forzar RLS en todas las tablas
ALTER TABLE pedidos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_piezas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE soporte_mensajes ENABLE ROW LEVEL SECURITY;

ALTER TABLE pedidos          FORCE ROW LEVEL SECURITY;
ALTER TABLE pedido_piezas    FORCE ROW LEVEL SECURITY;
ALTER TABLE pedido_historial FORCE ROW LEVEL SECURITY;
ALTER TABLE usuarios         FORCE ROW LEVEL SECURITY;
ALTER TABLE soporte_mensajes FORCE ROW LEVEL SECURITY;

-- PASO 3: Crear SOLO las políticas correctas

-- pedidos: anon puede leer y crear, staff acceso total
CREATE POLICY "anon_lectura_pedidos" ON pedidos
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_crear_pedidos" ON pedidos
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "staff_todo_pedidos" ON pedidos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pedido_piezas: anon puede leer y crear, staff acceso total
CREATE POLICY "anon_lectura_piezas" ON pedido_piezas
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_crear_piezas" ON pedido_piezas
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "staff_todo_piezas" ON pedido_piezas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pedido_historial: anon puede insertar (para registrar creación del pedido), staff acceso total
CREATE POLICY "anon_crear_historial" ON pedido_historial
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "staff_todo_historial" ON pedido_historial
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- usuarios: SOLO staff autenticado
CREATE POLICY "staff_todo_usuarios" ON usuarios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- soporte_mensajes: SOLO staff autenticado
CREATE POLICY "staff_todo_soporte" ON soporte_mensajes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN: rowsecurity debe ser true en todas
-- ══════════════════════════════════════════════════════════════
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('pedidos','pedido_piezas','pedido_historial','usuarios','soporte_mensajes')
ORDER BY tablename;

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN: políticas finales (debe haber solo las nuestras)
-- ══════════════════════════════════════════════════════════════
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pedidos','pedido_piezas','pedido_historial','usuarios','soporte_mensajes')
ORDER BY tablename, policyname;
