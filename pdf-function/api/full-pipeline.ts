// pdf-function/api/full-pipeline.ts
//
// POST /api/full-pipeline
// Body: { "company_id": "uuid-da-empresa" }
//
// Dispara o pipeline inteiro: gera o diagnóstico com IA, depois o PDF,
// depois WhatsApp + e-mail. Chamado pelo index.html logo após o
// formulário salvar `companies`/`answers` — em modo fire-and-forget
// (`fetch(..., { keepalive: true })`, sem `await` no navegador), porque
// o pipeline completo (IA + Puppeteer + notificações) pode levar bem
// mais que alguns segundos, e o usuário não deve ficar esperando isso
// pra ver a tela de sucesso.
//
// ⚠️ Este handler fica com a requisição aberta até o pipeline inteiro
// terminar. Configure um `maxDuration` generoso para esta função
// especificamente (ver vercel.json) — o padrão da Vercel (10s no plano
// Hobby) não é suficiente. Se o seu plano não permitir aumentar isso o
// bastante, considere separar esse pipeline num worker/fila em vez de
// uma função HTTP síncrona.

import { runFullPipeline } from '../fullPipeline';
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

  const result = await runFullPipeline(companyId);
  res.status(200).json({ ok: true, ...result });
});
