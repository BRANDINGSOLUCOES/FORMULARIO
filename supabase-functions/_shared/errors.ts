// supabase-functions/_shared/errors.ts
//
// Erro tipado + resposta HTTP padronizada, usados por todas as Edge
// Functions em vez de cada uma montar seu próprio `new Response(...)`
// de erro com um formato ligeiramente diferente.

export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = 'internal_error') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'validation_error');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'not_found');
    this.name = 'NotFoundError';
  }
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return jsonResponse({ ok: false, error: err.message, code: err.code }, err.status);
  }
  const message = err instanceof Error ? err.message : String(err);
  return jsonResponse({ ok: false, error: message, code: 'internal_error' }, 500);
}
