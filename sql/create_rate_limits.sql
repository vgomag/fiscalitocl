-- ═══════════════════════════════════════════════════════
-- RATE LIMITING — Tabla y función RPC para Fiscalito
-- Fecha: 2026-04-03
-- ═══════════════════════════════════════════════════════

-- Tabla para rastrear solicitudes por usuario y endpoint
CREATE TABLE IF NOT EXISTS rate_limits (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL,
  endpoint    TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INT NOT NULL DEFAULT 1,
  UNIQUE(user_id, endpoint, window_start)
);

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint
  ON rate_limits(user_id, endpoint, window_start DESC);

-- Limpieza automática: eliminar registros > 2 horas
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
  ON rate_limits(window_start);

-- ═══ Función RPC atómica: check_rate_limit ═══
-- Retorna: { allowed: bool, remaining: int, reset_at: timestamptz }
-- Usa ventana deslizante de 1 hora por defecto
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_endpoint TEXT,
  p_max_requests INT DEFAULT 60,
  p_window_minutes INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INT;
  v_remaining INT;
  v_reset_at TIMESTAMPTZ;
BEGIN
  -- Calcular inicio de ventana (truncar al minuto de la ventana)
  v_window_start := date_trunc('hour', now());
  v_reset_at := v_window_start + (p_window_minutes || ' minutes')::INTERVAL;

  -- Limpiar registros antiguos (> 2 horas) para mantener tabla pequeña
  DELETE FROM rate_limits WHERE window_start < now() - INTERVAL '2 hours';

  -- Contar solicitudes en la ventana actual
  SELECT COALESCE(SUM(request_count), 0) INTO v_current_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND endpoint = p_endpoint
    AND window_start >= v_window_start;

  -- Si excede el límite, denegar
  IF v_current_count >= p_max_requests THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'current', v_current_count,
      'limit', p_max_requests,
      'reset_at', v_reset_at
    );
  END IF;

  -- Incrementar contador (upsert atómico)
  INSERT INTO rate_limits (user_id, endpoint, window_start, request_count)
  VALUES (p_user_id, p_endpoint, date_trunc('minute', now()), 1)
  ON CONFLICT (user_id, endpoint, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1;

  v_remaining := p_max_requests - v_current_count - 1;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', v_remaining,
    'current', v_current_count + 1,
    'limit', p_max_requests,
    'reset_at', v_reset_at
  );
END;
$$;

-- Habilitar RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Solo el service role puede acceder (la función RPC usa SECURITY DEFINER)
CREATE POLICY rate_limits_service_only ON rate_limits
  FOR ALL USING (false);

-- Dar acceso a la función RPC para usuarios autenticados
GRANT EXECUTE ON FUNCTION check_rate_limit TO authenticated;
