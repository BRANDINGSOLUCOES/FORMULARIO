// pdf-function/fullPipeline.ts
//
// Orquestra o pipeline completo, do envio do formulário até WhatsApp/e-mail:
//   1. generateDiagnosis (Edge Function, IA) — cria diagnostics.json/.html
//   2. generateAndStorePdf (PDF + upload + sendWhatsapp + sendEmail em paralelo)
//
// Chamado por api/full-pipeline.ts, que por sua vez é chamado pelo
// index.html logo após salvar companies/answers — em modo "fire and
// forget" (o navegador não espera esse pipeline terminar para
// redirecionar o usuário para a tela de sucesso, já que IA + Puppeteer
// juntos podem levar bem mais que alguns segundos).
//
// Se a geração do diagnóstico falhar, o pipeline para aí — não faz
// sentido tentar gerar um PDF de um diagnóstico que não existe.

import { callGenerateDiagnosis } from './services/edgeFunctionsClient';
import { generateAndStorePdf } from './generatePdfCore';
import { createLogger } from './services/logger';
import { FullPipelineResult } from './types';

const log = createLogger('fullPipeline');

export async function runFullPipeline(companyId: string): Promise<FullPipelineResult> {
  log.info('start', { companyId });

  const diagnosis = await callGenerateDiagnosis(companyId);
  if (!diagnosis.ok) {
    log.error('diagnosis_failed', new Error(diagnosis.error || 'falha desconhecida'), { companyId });
    return { company_id: companyId, diagnosis };
  }

  const pdf = await generateAndStorePdf(companyId);
  log.info('done', { companyId, whatsappOk: pdf.whatsapp.ok, emailOk: pdf.email.ok });

  return { company_id: companyId, diagnosis, pdf };
}
