// pdf-function/api/generate-pdf.ts
//
// POST /api/generate-pdf
// Body: { "company_id": "uuid-da-empresa" }
//
// Gera o PDF do diagnóstico, salva no Storage e dispara WhatsApp + e-mail
// automaticamente (via Edge Functions). Runtime: Node.js (não Edge) —
// configure isso explicitamente nas configurações do projeto Vercel.

import { generateAndStorePdf } from '../generatePdfCore';
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

  const result = await generateAndStorePdf(companyId);
  res.status(200).json({ ok: true, ...result });
});
