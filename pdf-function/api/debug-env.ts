// pdf-function/api/debug-env.ts
//
// ⚠️ ENDPOINT TEMPORÁRIO DE DIAGNÓSTICO — apagar depois de resolver o
// problema de RLS no upload do Storage. Não expõe nenhuma chave
// completa, só metadados seguros (tamanho, prefixo, sufixo) pra
// confirmar se a variável de ambiente configurada na Vercel é
// exatamente a mesma que está sendo usada de verdade pela função.

interface MinimalRequest {
  method?: string;
}
interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): void;
}

function safeInfo(value: string | undefined) {
  if (!value) return { present: false };
  return {
    present: true,
    length: value.length,
    prefix: value.slice(0, 12),
    suffix: value.slice(-6),
    hasWhitespace: /\s/.test(value),
    hasNewline: /[\r\n]/.test(value),
  };
}

export default function handler(req: MinimalRequest, res: MinimalResponse) {
  res.status(200).json({
    SUPABASE_URL: safeInfo(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: safeInfo(process.env.SUPABASE_SERVICE_ROLE_KEY),
    DIAGNOSTICS_PDF_BUCKET: safeInfo(process.env.DIAGNOSTICS_PDF_BUCKET),
    nodeVersion: process.version,
    region: process.env.VERCEL_REGION || 'desconhecida',
  });
}
