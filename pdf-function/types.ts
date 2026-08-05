// pdf-function/types.ts
//
// Tipos compartilhados pelos serviços e handlers deste módulo Node.js.

export interface DiagnosticRow {
  id: string;
  company_id: string;
  html: string | null;
  pdf_url: string | null;
}

export interface GeneratePdfResult {
  diagnostic_id: string;
  pdf_url: string;
  whatsapp: EdgeFunctionCallResult;
  email: EdgeFunctionCallResult;
}

export interface EdgeFunctionCallResult {
  ok: boolean;
  status?: string;
  error?: string;
}

export interface FullPipelineResult {
  company_id: string;
  diagnosis: EdgeFunctionCallResult;
  pdf?: GeneratePdfResult;
}
