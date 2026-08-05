// pdf-function/services/storageService.ts
//
// Upload do PDF gerado para o Supabase Storage (bucket `diagnostics`) e
// obtenção da URL pública — isolado num serviço próprio para não misturar
// "gerar o PDF" com "onde ele é guardado" (facilita trocar de storage no
// futuro sem tocar em pdfRenderer.ts).

import { getSupabaseAdmin } from './supabaseAdmin';

const STORAGE_BUCKET = process.env.DIAGNOSTICS_PDF_BUCKET || 'diagnostics';

export async function uploadPdf(diagnosticId: string, pdfBuffer: Buffer): Promise<string> {
  const path = `${diagnosticId}.pdf`;
  const supabaseAdmin = getSupabaseAdmin();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) {
    throw new Error(`Erro ao subir o PDF para o Storage: ${uploadError.message}`);
  }

  const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
