// supabase-functions/sendEmail/index.ts
//
// ETAPA 6 — Envio por e-mail (Resend).
// ETAPA 9 — movida do lado Node (pdf-function/emailNotify.js) para cá.
// Este é o ÚNICO lugar de todo o projeto que fala com a Resend — a chave
// (RESEND_API_KEY) fica só nos secrets desta Edge Function, nunca num
// ambiente Node/Vercel separado.
//
// Busca sozinha o diagnóstico mais recente da empresa (precisa já ter
// `pdf_url`, gerado pelo pdf-function/ em Node — só o PDF continua lá,
// por causa do Puppeteer).
//
// Deploy:
//   supabase functions deploy sendEmail
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set RESEND_FROM_EMAIL=diagnostico@brandingsolucoes.com.br
//
// Chamada (a partir do pdf-function/ em Node, ou do botão "Reenviar
// e-mail" no painel administrativo):
//   POST /functions/v1/sendEmail
//   Body: { "company_id": "uuid-da-empresa" }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { fetchCompany, fetchLatestDiagnostic, updateEmailStatus } from '../_shared/companiesRepo.ts';
import { errorResponse, jsonResponse, corsHeaders, ValidationError } from '../_shared/errors.ts';
import { parseJsonBody, requireUuid } from '../_shared/validation.ts';
import { createLogger } from '../_shared/logger.ts';
import { CompanyIdPayload } from '../_shared/types.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL');

const log = createLogger('sendEmail');

function buildEmailHtml(nome: string | null, link: string): string {
  const primeiroNome = (nome || '').trim().split(' ')[0] || '';
  const saudacao = primeiroNome ? `Olá ${primeiroNome}` : 'Olá';

  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#F7FBFF;padding:32px 24px;border-radius:20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:#062B45;color:#fff;font-weight:800;font-size:14px;padding:8px 16px;border-radius:10px;">
        📊 Branding Soluções
      </div>
    </div>
    <p style="color:#062B45;font-size:16px;margin:0 0 12px;">${saudacao},</p>
    <p style="color:#062B45;font-size:16px;margin:0 0 12px;">Seu diagnóstico foi concluído.</p>
    <p style="color:#5B6B7A;font-size:15px;margin:0 0 28px;">Clique abaixo para visualizar.</p>
    <div style="text-align:center;">
      <a href="${link}" target="_blank" rel="noopener"
         style="display:inline-block;background:linear-gradient(135deg,#E4C158,#C9A227);color:#062B45;
                font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:14px;">
        Visualizar Relatório
      </a>
    </div>
  </div>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error('Resend não configurado (RESEND_API_KEY / RESEND_FROM_EMAIL).');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to, subject, html }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend respondeu ${res.status}: ${errText}`);
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
    if (!company.email) {
      throw new ValidationError('Empresa não tem e-mail cadastrado.');
    }

    const subject = 'Seu Diagnóstico Empresarial está pronto.';
    const html = buildEmailHtml(company.nome, diagnostic.pdf_url);
    await sendEmail(company.email, subject, html);

    await updateEmailStatus(diagnostic.id, 'enviado', new Date().toISOString());
    log.info('success', { companyId, diagnosticId: diagnostic.id });

    return jsonResponse({ ok: true, status: 'enviado' });
  } catch (err) {
    log.error('failure', err, { diagnosticId });

    if (diagnosticId) {
      const message = String(err instanceof Error ? err.message : err).slice(0, 500);
      await updateEmailStatus(diagnosticId, `erro: ${message}`, null);
    }

    return errorResponse(err);
  }
});
