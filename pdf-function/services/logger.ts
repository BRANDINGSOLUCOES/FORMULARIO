// pdf-function/services/logger.ts
//
// Logger estruturado (JSON) compartilhado por todos os serviços deste
// módulo — mesmo formato usado nas Edge Functions (Deno), pra facilitar
// correlacionar logs dos dois lados (Node + Deno) durante um mesmo fluxo
// de geração de diagnóstico.

type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, source: string, event: string, data?: Record<string, unknown>): void {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    source,
    event,
    ...(data ?? {}),
  };
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export function createLogger(source: string) {
  return {
    info: (event: string, data?: Record<string, unknown>) => write('info', source, event, data),
    warn: (event: string, data?: Record<string, unknown>) => write('warn', source, event, data),
    error: (event: string, err: unknown, data?: Record<string, unknown>) =>
      write('error', source, event, { ...(data ?? {}), error: err instanceof Error ? err.message : String(err) }),
  };
}
