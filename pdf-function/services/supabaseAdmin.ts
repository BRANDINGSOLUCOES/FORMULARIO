// pdf-function/services/supabaseAdmin.ts
//
// Fábrica única do client Supabase com service_role, reaproveitada por
// todos os serviços deste módulo (antes cada arquivo criava seu próprio
// client repetindo a leitura das mesmas env vars).

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas nas variáveis de ambiente.');
  }

  cachedClient = createClient(url, serviceRoleKey);
  return cachedClient;
}
