// supabase-functions/generateDiagnosis/index.ts
//
// ETAPA 2 — Geração do diagnóstico com IA.
// ETAPA 3 — Relatório HTML (componente em ../_shared/reportTemplate.ts).
// ETAPA 9 — refatorada para usar os serviços compartilhados em _shared/
// (antes esta function tinha sua própria cópia de tipos, cliente Supabase,
// tratamento de erro e busca de dados — hoje tudo isso é reaproveitado
// também por sendWhatsapp e sendEmail).
//
// Esta função NÃO gera PDF e NÃO envia WhatsApp/e-mail — isso é feito por
// outras functions (ver pdf-function/ para o PDF, e sendWhatsapp/sendEmail
// para as notificações). O trabalho desta function é:
//   1. Buscar a empresa e todas as respostas dela no banco.
//   2. Montar um prompt para a OpenAI.
//   3. Pedir um JSON estruturado com o diagnóstico.
//   4. Transformar esse JSON num relatório HTML (componente puro).
//   5. Salvar o JSON e o HTML na tabela `diagnostics`.
//
// Deploy:
//   supabase functions deploy generateDiagnosis
//   supabase secrets set OPENAI_API_KEY=sk-...
//
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já ficam disponíveis
// automaticamente dentro de toda Edge Function — não precisam ser
// configurados manualmente.
//
// Chamada (a partir de outro serviço/backend confiável — nunca do
// navegador com a service_role key):
//   POST /functions/v1/generateDiagnosis
//   Body: { "company_id": "uuid-da-empresa" }

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { buildDiagnosticReportHtml } from '../_shared/reportTemplate.ts';
import { fetchAnswers, fetchCompany, insertDiagnostic } from '../_shared/companiesRepo.ts';
import { errorResponse, jsonResponse, corsHeaders } from '../_shared/errors.ts';
import { parseJsonBody, requireUuid } from '../_shared/validation.ts';
import { createLogger } from '../_shared/logger.ts';
import { Answer, Company, CompanyIdPayload, DiagnosisResult } from '../_shared/types.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_MODEL = Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini';

const log = createLogger('generateDiagnosis');

const DIAGNOSIS_JSON_SHAPE = `{
  "score": 0,
  "nivel": "",
  "resumo": "",
  "pontosFortes": [],
  "pontosFracos": [],
  "oportunidades": [],
  "plano30dias": [],
  "plano60dias": [],
  "plano90dias": [],
  "conclusao": ""
}`;

// Monta o prompt para a OpenAI a partir dos dados da empresa.
function buildPrompt(company: Company, answers: Answer[]): string {
  const perguntasRespostas = answers.map((a) => `- ${a.pergunta}: ${a.resposta}`).join('\n');

  return `Você é um consultor sênior de marketing, vendas e automação comercial.

Analise os dados abaixo de uma empresa que respondeu a um diagnóstico
empresarial e gere um diagnóstico estratégico completo, em português do Brasil.

DADOS DA EMPRESA
Nome do responsável: ${company.nome ?? 'não informado'}
Empresa: ${company.empresa ?? 'não informado'}
Segmento: ${company.segmento ?? 'não informado'}
Cidade/Estado: ${[company.cidade, company.estado].filter(Boolean).join(' - ') || 'não informado'}

RESPOSTAS DO DIAGNÓSTICO
${perguntasRespostas || 'Nenhuma resposta registrada.'}

TAREFA
Com base apenas nessas informações, gere um diagnóstico honesto e específico
(evite generalidades genéricas — cite o que a empresa realmente respondeu).
Responda ESTRITAMENTE em JSON, sem nenhum texto fora do JSON, seguindo
exatamente este formato e estas chaves:

${DIAGNOSIS_JSON_SHAPE}

Regras de preenchimento:
- "score": nota de 0 a 100 sobre a maturidade comercial/marketing da empresa.
- "nivel": um rótulo curto, ex.: "Inicial", "Em Estruturação", "Em Crescimento", "Avançado".
- "resumo": 2-3 frases resumindo o momento atual da empresa.
- "pontosFortes", "pontosFracos", "oportunidades": listas de 3 a 5 itens curtos.
- "plano30dias", "plano60dias", "plano90dias": listas de 3 a 5 ações objetivas para cada período.
- "conclusao": 2-3 frases finais com uma recomendação direta.`;
}

// Envia o prompt para a OpenAI e recebe o JSON estruturado.
// Esta é a ÚNICA função de todo o projeto que fala com a OpenAI — chamada
// apenas a partir desta Edge Function (nunca do navegador ou do lado Node).
async function callOpenAI(prompt: string): Promise<DiagnosisResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada nos secrets desta function.');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content: 'Você responde sempre e apenas com um objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Erro na OpenAI (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Resposta da OpenAI veio vazia.');
  }

  try {
    return JSON.parse(content) as DiagnosisResult;
  } catch {
    throw new Error('Não foi possível interpretar o JSON retornado pela OpenAI.');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Método não permitido. Use POST.' }, 405);
  }

  try {
    const body = await parseJsonBody<CompanyIdPayload>(req);
    const companyId = requireUuid(body.company_id, 'company_id');

    log.info('start', { companyId });

    const company = await fetchCompany(companyId);
    const answers = await fetchAnswers(companyId);

    if (answers.length === 0) {
      // Não é um erro fatal, mas vale registrar — a IA vai gerar um
      // diagnóstico bem menos específico sem nenhuma resposta pra analisar.
      log.warn('no_answers_found', { companyId });
    }

    const prompt = buildPrompt(company, answers);
    const diagnosis = await callOpenAI(prompt);
    const html = buildDiagnosticReportHtml({ company, diagnosis, generatedAt: new Date() });
    const savedDiagnostic = await insertDiagnostic({ companyId, diagnosis, html });

    log.info('success', { companyId, diagnosticId: savedDiagnostic.id, score: diagnosis.score });

    return jsonResponse({ ok: true, diagnostic: savedDiagnostic });
  } catch (err) {
    log.error('failure', err);
    return errorResponse(err);
  }
});
