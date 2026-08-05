// supabase-functions/sendWhatsapp/index.ts
//
// ETAPA 5 — Envio pelo WhatsApp (Evolution API).
// ETAPA 9 — movida do lado Node (pdf-function/whatsappNotify.js) para cá.
// Este é o ÚNICO lugar de todo o projeto que fala com a Evolution API —
// a chave da Evolution API (EVOLUTION_API_KEY) fica só nos secrets desta
// Edge Function, nunca num ambiente Node/Vercel separado.
//
// Busca sozinha o diagnóstico mais recente da empresa (precisa já ter
// `pdf_url`, gerado pelo pdf-function/ em Node — só o PDF continua lá,
// por causa do Puppeteer).
//
// Deploy:
//   supabase functions deploy sendWhatsapp
//   supabase secrets set EVOLUTION_API_URL=https://sua-evolution-api.com
//   supabase secrets set EVOLUTION_API_KEY=sua-apikey
//   supabase secrets set EVOLUTION_INSTANCE=nome-da-instancia
//
// Chamada (a partir do pdf-function/ em Node, ou do botão "Reenviar
// WhatsApp" no painel administrativo):
//   POST /functions/v1/sendWhatsapp
//   Body: { "company_id": "uuid-da-empresa" }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { fetchCompany, fetchLatestDiagnostic, updateWhatsappStatus } from '../_shared/companiesRepo.ts';
import { errorResponse, jsonResponse, corsHeaders, ValidationError } from '../_shared/errors.ts';
import { parseJsonBody, requireUuid } from '../_shared/validation.ts';
import { createLogger } from '../_shared/logger.ts';
import { CompanyIdPayload } from '../_shared/types.ts';

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL');
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY');
const EVOLUTION_INSTANCE = Deno.env.get('EVOLUTION_INSTANCE');

const log = createLogger('sendWhatsapp');

// Deixa só dígitos e garante o código do país (55) na frente, já que o
// campo `whatsapp` do formulário é preenchido em formato livre (BR).
function normalizePhoneNumber(rawPhone: string | null): string | null {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function buildMessage(nome: string | null, link: string): string {
  const primeiroNome = (nome || '').trim().split(' ')[0] || '';
  const saudacao = primeiroNome ? `Olá ${primeiroNome}.` : 'Olá.';
  return `${saudacao}\n\nSeu diagnóstico empresarial está pronto.\n\nClique abaixo para visualizar.\n\n${link}`;
}

// Corpo no formato mais comum da Evolution API (v1.x/v2.x costumam aceitar
// `{ number, text }` em /message/sendText/{instance}). Confira a versão da
// sua instância — algumas esperam `{ number, textMessage: { text } }`.
async function sendWhatsappMessage(number: string, text: string): Promise<void> {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
    throw new Error('Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE).');
  }

  const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_API_KEY },
    body: JSON.stringify({ number, text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Evolution API respondeu ${res.status}: ${errText}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método não permitido. Use POST.' }, 405);
  }

  let diagnosticId: string | null = null;

  try {
    const body = await parseJsonBody<CompanyIdPayload>(req);
    const companyId = requireUuid(body.company_id, 'company_id');

    log.info('start', { companyId });

    const [company, diagnostic] = await Promise.all([
      fetchCompany(companyId),
      fetchLatestDiagnostic(companyId),
    ]);
    diagnosticId = diagnostic.id;

    if (!diagnostic.pdf_url) {
      throw new ValidationError('Este diagnóstico ainda não tem um PDF gerado.');
    }

    const number = normalizePhoneNumber(company.telefone);
    if (!number) {
      throw new ValidationError('Empresa não tem telefone/whatsapp cadastrado.');
    }

    const text = buildMessage(company.nome, diagnostic.pdf_url);
    await sendWhatsappMessage(number, text);

    await updateWhatsappStatus(diagnostic.id, 'enviado', new Date().toISOString());
    log.info('success', { companyId, diagnosticId: diagnostic.id });

    return jsonResponse({ ok: true, status: 'enviado' });
  } catch (err) {
    log.error('failure', err, { diagnosticId });

    // Registra o erro no banco (se já sabemos qual diagnóstico é) antes
    // de responder — assim o painel administrativo sempre reflete a
    // última tentativa, com sucesso ou erro.
    if (diagnosticId) {
      const message = String(err instanceof Error ? err.message : err).slice(0, 500);
      await updateWhatsappStatus(diagnosticId, `erro: ${message}`, null);
    }

    return errorResponse(err);
  }
});
