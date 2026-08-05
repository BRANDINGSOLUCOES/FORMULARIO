// pdf-function/services/edgeFunctionsClient.ts
//
// ETAPA 9 (ponto 11): "Garantir que todas as chamadas para OpenAI,
// WhatsApp e Resend ocorram apenas através de Supabase Edge Functions."
//
// Antes desta etapa, este módulo Node.js (pdf-function/) chamava a
// Evolution API e a Resend diretamente (whatsappNotify.js / emailNotify.js
// — removidos). Isso significava que as chaves da Evolution API e da
// Resend precisavam estar configuradas em DOIS lugares diferentes
// (Supabase secrets E variáveis de ambiente da Vercel), e havia dois
// pontos distintos de código conversando com serviços de terceiros
// sensíveis.
//
// Agora este módulo só chama as Edge Functions `sendWhatsapp` e
// `sendEmail` (Deno, no Supabase) via HTTP — a Evolution API e a Resend
// são chamadas exclusivamente de dentro delas. As chaves de terceiros
// saem completamente do ambiente Node/Vercel.
//
// Autenticação: chamada de servidor para servidor, usando a
// service_role key como Bearer token (aceita pelo gateway de Edge
// Functions do Supabase como um JWT válido do projeto).

import { EdgeFunctionCallResult } from '../types';
import { createLogger } from './logger';

const log = createLogger('edgeFunctionsClient');

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas.');
  }
  return { supabaseUrl, serviceRoleKey };
}

async function callEdgeFunction(functionName: string, companyId: string): Promise<EdgeFunctionCallResult> {
  const { supabaseUrl, serviceRoleKey } = getConfig();
  const url = `${supabaseUrl}/functions/v1/${functionName}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ company_id: companyId }),
    });

    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; error?: string };

    if (!res.ok || !json.ok) {
      log.warn('edge_function_returned_error', { functionName, companyId, status: res.status, error: json.error });
      return { ok: false, error: json.error || `${functionName} respondeu ${res.status}` };
    }

    log.info('edge_function_success', { functionName, companyId });
    return { ok: true, status: json.status };
  } catch (err) {
    log.error('edge_function_call_failed', err, { functionName, companyId });
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Chama a Edge Function `sendWhatsapp` (Deno) — nunca fala com a Evolution API diretamente. */
export function callSendWhatsapp(companyId: string): Promise<EdgeFunctionCallResult> {
  return callEdgeFunction('sendWhatsapp', companyId);
}

/** Chama a Edge Function `sendEmail` (Deno) — nunca fala com a Resend diretamente. */
export function callSendEmail(companyId: string): Promise<EdgeFunctionCallResult> {
  return callEdgeFunction('sendEmail', companyId);
}

/** Chama a Edge Function `generateDiagnosis` (Deno) — nunca fala com a OpenAI diretamente. */
export function callGenerateDiagnosis(companyId: string): Promise<EdgeFunctionCallResult> {
  return callEdgeFunction('generateDiagnosis', companyId);
}
