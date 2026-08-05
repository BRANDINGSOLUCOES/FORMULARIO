// supabase-functions/_shared/supabaseAdmin.ts
//
// Fábrica única do client Supabase com service_role — evita cada Edge
// Function reimplementar `createClient(...)` com sua própria leitura de
// env vars. SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já ficam disponíveis
// automaticamente dentro de toda Edge Function (não precisam ser
// configurados manualmente nos secrets).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não disponíveis no ambiente da function.');
  }

  cachedClient = createClient(url, serviceRoleKey);
  return cachedClient;
}
