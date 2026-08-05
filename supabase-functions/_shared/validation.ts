// supabase-functions/_shared/validation.ts
//
// Validação de entrada compartilhada. Pequena de propósito — o objetivo
// aqui não é reimplementar um framework de schema validation, é garantir
// que toda Edge Function rejeite entradas óbviamente inválidas cedo, com
// uma mensagem clara, em vez de deixar o erro estourar mais fundo (ex.:
// erro genérico do Postgres por causa de um UUID malformado).

import { ValidationError } from './errors.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function requireUuid(value: unknown, fieldName: string): string {
  if (!isUuid(value)) {
    throw new ValidationError(`${fieldName} precisa ser um UUID válido.`);
  }
  return value;
}

export async function parseJsonBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError('Corpo da requisição precisa ser um JSON válido.');
  }
}
