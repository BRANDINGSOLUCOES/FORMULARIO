// supabase-functions/_shared/logger.ts
//
// Logger estruturado (JSON) compartilhado por todas as Edge Functions.
// Nada sofisticado — Edge Functions não têm um destino de log persistente
// próprio, então o objetivo aqui é só garantir que toda linha logada tenha
// timestamp, função de origem, nível e um evento nomeado, pra ficar fácil
// de filtrar/buscar nos logs do Supabase (Dashboard → Edge Functions → Logs).

type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, fn: string, event: string, data?: Record<string, unknown>) {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    function: fn,
    event,
    ...(data ?? {}),
  };
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export function createLogger(functionName: string) {
  return {
    info: (event: string, data?: Record<string, unknown>) => write('info', functionName, event, data),
    warn: (event: string, data?: Record<string, unknown>) => write('warn', functionName, event, data),
    error: (event: string, err: unknown, data?: Record<string, unknown>) =>
      write('error', functionName, event, { ...(data ?? {}), error: err instanceof Error ? err.message : String(err) }),
  };
}
