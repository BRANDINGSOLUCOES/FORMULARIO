// pdf-function/services/errors.ts
//
// Erro tipado + helper de resposta HTTP, para os 3 handlers em api/
// pararem de reimplementar cada um seu próprio try/catch com formato
// de resposta ligeiramente diferente.

export class AppError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

// Handler mínimo, compatível com o formato (req, res) do runtime Node.js
// da Vercel — sem importar tipos da Vercel aqui para manter este módulo
// portável para outros hosts (Express, Cloud Run) se for preciso trocar.
interface MinimalRequest {
  method?: string;
  body?: unknown;
}
interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
}

export function withErrorHandling(
  handler: (req: MinimalRequest, res: MinimalResponse) => Promise<void>
) {
  return async (req: MinimalRequest, res: MinimalResponse): Promise<void> => {
    try {
      await handler(req, res);
    } catch (err) {
      const status = err instanceof AppError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: 'error', event: 'unhandled_error', error: message }));
      res.status(status).json({ ok: false, error: message });
    }
  };
}
