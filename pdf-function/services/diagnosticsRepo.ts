// pdf-function/services/diagnosticsRepo.ts
//
// Acesso a dados da tabela `diagnostics`, usado por generatePdfCore e
// pelos handlers de reenvio. Único lugar deste módulo que sabe o nome
// das colunas/tabela — se o schema mudar, só este arquivo muda.

import { getSupabaseAdmin } from './supabaseAdmin';
import { DiagnosticRow } from '../types';

/**
 * Busca o diagnóstico mais recente da empresa. Precisa já ter `html`
 * preenchido (gerado na Etapa 3, dentro da Edge Function generateDiagnosis).
 */
export async function fetchDiagnostic(companyId: string): Promise<DiagnosticRow> {
  const { data, error } = await getSupabaseAdmin()
    .from('diagnostics')
    .select('id, company_id, html, pdf_url')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Diagnóstico não encontrado para essa empresa: ${error?.message ?? companyId}`);
  }
  if (!data.html) {
    throw new Error('Este diagnóstico ainda não tem relatório HTML gerado (Edge Function generateDiagnosis).');
  }
  return data as DiagnosticRow;
}

export async function savePdfUrl(diagnosticId: string, pdfUrl: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('diagnostics')
    .update({ pdf_url: pdfUrl })
    .eq('id', diagnosticId);

  if (error) {
    throw new Error(`Erro ao salvar pdf_url: ${error.message}`);
  }
}
