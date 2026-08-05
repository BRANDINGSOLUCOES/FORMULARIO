// pdf-function/api/resend-email.ts
//
// POST /api/resend-email
// Body: { "company_id": "uuid-da-empresa" }
//
// Reenvia o e-mail usando o `pdf_url` que já existe (não gera um PDF
// novo). Só confirma que há um PDF salvo e delega o envio em si para a
// Edge Function `sendEmail` — a única que fala com a Resend.

import { fetchDiagnostic } from '../generatePdfCore';
import { callSendEmail } from '../services/edgeFunctionsClient';
import { ValidationError, withErrorHandling } from '../services/errors';

interface MinimalRequest {
  method?: string;
  body?: unknown;
}
interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
}

export default withErrorHandling(async (req: MinimalRequest, res: MinimalResponse) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método não permitido. Use POST.' });
    return;
  }

  const { company_id: companyId } = (req.body as { company_id?: string }) || {};
  if (!companyId) {
    throw new ValidationError('company_id é obrigatório.');
  }

  const diagnostic = await fetchDiagnostic(companyId);
  if (!diagnostic.pdf_url) {
    throw new ValidationError('Este diagnóstico ainda não tem um PDF gerado.');
  }

  const result = await callSendEmail(companyId);
  res.status(200).json({ ok: result.ok, email: result });
});
