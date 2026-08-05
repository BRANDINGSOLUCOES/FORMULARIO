// pdf-function/generatePdfCore.ts
//
// ETAPA 4 — Geração de PDF (Puppeteer + Supabase Storage).
// ETAPA 9 — reorganizada em serviços (services/) e migrada para
// TypeScript. WhatsApp e e-mail não são mais chamados diretamente daqui:
// esta função só aciona as Edge Functions correspondentes
// (services/edgeFunctionsClient.ts) depois que o PDF já está salvo.
//
// ⚠️ Continua precisando rodar em Node.js (Vercel Serverless "nodejs",
// Cloud Run, Railway, etc.) — Puppeteer não roda em Deno Deploy/Edge
// Functions, que não permitem abrir um binário de Chromium.

import { fetchDiagnostic, savePdfUrl } from './services/diagnosticsRepo';
import { renderHtmlToPdf } from './services/pdfRenderer';
import { uploadPdf } from './services/storageService';
import { callSendWhatsapp, callSendEmail } from './services/edgeFunctionsClient';
import { createLogger } from './services/logger';
import { GeneratePdfResult } from './types';

const log = createLogger('generatePdfCore');

/**
 * Gera o PDF de uma empresa (a partir do relatório HTML já salvo em
 * `diagnostics.html`), salva no Storage e, em seguida, dispara WhatsApp
 * e e-mail em paralelo — cada um via sua própria Edge Function,
 * independentes entre si (falha de um não afeta o outro nem o PDF, que
 * já está salvo antes dessa etapa).
 */
export async function generateAndStorePdf(companyId: string): Promise<GeneratePdfResult> {
  log.info('start', { companyId });

  const diagnostic = await fetchDiagnostic(companyId);
  const pdfBuffer = await renderHtmlToPdf(diagnostic.html as string);
  const pdfUrl = await uploadPdf(diagnostic.id, pdfBuffer);
  await savePdfUrl(diagnostic.id, pdfUrl);

  log.info('pdf_saved', { companyId, diagnosticId: diagnostic.id, pdfUrl });

  const [whatsapp, email] = await Promise.all([
    callSendWhatsapp(companyId),
    callSendEmail(companyId),
  ]);

  log.info('done', { companyId, diagnosticId: diagnostic.id, whatsappOk: whatsapp.ok, emailOk: email.ok });

  return { diagnostic_id: diagnostic.id, pdf_url: pdfUrl, whatsapp, email };
}

// Reexportado para os endpoints de reenvio (resend-whatsapp / resend-email),
// que só precisam confirmar que já existe um PDF antes de acionar a Edge
// Function correspondente — sem gerar um PDF novo.
export { fetchDiagnostic } from './services/diagnosticsRepo';
