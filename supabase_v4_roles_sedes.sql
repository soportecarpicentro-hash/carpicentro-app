-- ══════════════════════════════════════════════════════════════
-- CARPICENTRO — Migración v4: roles, sedes, asignaciones
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Agregar columna sede a usuarios (default Independencia)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sede TEXT DEFAULT 'Independencia';

-- 2. Agregar columna vendedora_asignada a pedidos (quién atiende el pedido)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS vendedora_asignada TEXT DEFAULT NULL;

-- 3. Agregar columna vendedora_preferida (elegida por el cliente al hacer pedido)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS vendedora_preferida TEXT DEFAULT NULL;

-- 4. Renombrar sedes en pedidos existentes
UPDATE pedidos SET sede = 'Independencia'
  WHERE sede IN ('Sede I', 'Sede I — Av. Gerardo Unger 3209, Independencia');

UPDATE pedidos SET sede = 'Universitaria'
  WHERE sede IN ('Sede II', 'Sede II — Av. Universitaria Norte 3149, SMP');

-- 5. Política RLS: clientes (anon) pueden leer nombres y sede de vendedoras activas
--    (para el selector de vendedora en el formulario del cliente)
DO $$ BEGIN
  CREATE POLICY "anon_leer_vendedoras_activas" ON usuarios
    FOR SELECT TO anon USING (activo = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ══════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════
SELECT 'pedidos' AS tabla, sede, COUNT(*) FROM pedidos GROUP BY sede ORDER BY sede;
SELECT 'usuarios' AS tabla, rol, sede, COUNT(*) FROM usuarios GROUP BY rol, sede ORDER BY rol, sede;
