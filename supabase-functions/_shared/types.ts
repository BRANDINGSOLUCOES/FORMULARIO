// supabase-functions/_shared/types.ts
//
// Tipos compartilhados por todas as Edge Functions (generateDiagnosis,
// sendWhatsapp, sendEmail) e pelo componente de relatório HTML.

export interface Company {
  id: string;
  nome: string | null;
  empresa: string | null;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  estado: string | null;
  segmento: string | null;
  created_at?: string;
}

export interface Answer {
  pergunta: string;
  resposta: string;
}

export interface DiagnosisResult {
  score: number;
  nivel: string;
  resumo: string;
  pontosFortes: string[];
  pontosFracos: string[];
  oportunidades: string[];
  plano30dias: string[];
  plano60dias: string[];
  plano90dias: string[];
  conclusao: string;
}

export type SendStatus = 'enviado' | string; // 'enviado' | `erro: <detalhe>`

export interface DiagnosticRow {
  id: string;
  company_id: string;
  score: number | null;
  nivel: string | null;
  json: DiagnosisResult | null;
  html: string | null;
  pdf_url: string | null;
  whatsapp_status: SendStatus | null;
  whatsapp_sent_at: string | null;
  email_status: SendStatus | null;
  email_sent_at: string | null;
  created_at: string;
}

// Payload de entrada aceito pelas 3 Edge Functions — todas recebem, no
// mínimo, o id da empresa.
export interface CompanyIdPayload {
  company_id: string;
}
