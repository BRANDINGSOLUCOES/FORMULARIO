// supabase-functions/_shared/companiesRepo.ts
//
// Serviço de acesso a dados (companies / answers / diagnostics),
// reutilizado por generateDiagnosis, sendWhatsapp e sendEmail — em vez de
// cada function reimplementar suas próprias queries (era o caso antes
// desta etapa: generateDiagnosis e o antigo `whatsappNotify`/`emailNotify`
// no lado Node tinham cada um sua própria versão de "busca empresa por id").

import { getSupabaseAdmin } from './supabaseAdmin.ts';
import { NotFoundError } from './errors.ts';
import { Answer, Company, DiagnosisResult, DiagnosticRow } from './types.ts';

export async function fetchCompany(companyId: string): Promise<Company> {
  const { data, error } = await getSupabaseAdmin()
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();

  if (error || !data) {
    throw new NotFoundError(`Empresa não encontrada: ${error?.message ?? companyId}`);
  }
  return data as Company;
}

export async function fetchAnswers(companyId: string): Promise<Answer[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('answers')
    .select('pergunta, resposta')
    .eq('company_id', companyId);

  if (error) throw new Error(`Erro ao buscar respostas: ${error.message}`);
  return (data ?? []) as Answer[];
}

// Busca o diagnóstico mais recente da empresa (usado por sendWhatsapp e
// sendEmail, que precisam do `pdf_url` já gerado).
export async function fetchLatestDiagnostic(companyId: string): Promise<DiagnosticRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('diagnostics')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar diagnóstico: ${error.message}`);
  if (!data) throw new NotFoundError(`Nenhum diagnóstico encontrado para a empresa ${companyId}.`);
  return data as DiagnosticRow;
}

export async function insertDiagnostic(params: {
  companyId: string;
  diagnosis: DiagnosisResult;
  html: string;
}): Promise<DiagnosticRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('diagnostics')
    .insert([{
      company_id: params.companyId,
      score: params.diagnosis.score ?? null,
      nivel: params.diagnosis.nivel ?? null,
      json: params.diagnosis,
      html: params.html,
    }])
    .select()
    .single();

  if (error) throw new Error(`Erro ao salvar diagnóstico: ${error.message}`);
  return data as DiagnosticRow;
}

export async function updateDiagnosticPdfUrl(diagnosticId: string, pdfUrl: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('diagnostics')
    .update({ pdf_url: pdfUrl })
    .eq('id', diagnosticId);

  if (error) throw new Error(`Erro ao salvar pdf_url: ${error.message}`);
}

export async function updateWhatsappStatus(diagnosticId: string, status: string, sentAt: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('diagnostics')
    .update({ whatsapp_status: status, whatsapp_sent_at: sentAt })
    .eq('id', diagnosticId);

  // Best effort — não deve derrubar o fluxo de envio se o registro falhar.
  if (error) console.error(`Erro ao salvar whatsapp_status: ${error.message}`);
}

export async function updateEmailStatus(diagnosticId: string, status: string, sentAt: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('diagnostics')
    .update({ email_status: status, email_sent_at: sentAt })
    .eq('id', diagnosticId);

  // Best effort — não deve derrubar o fluxo de envio se o registro falhar.
  if (error) console.error(`Erro ao salvar email_status: ${error.message}`);
}
