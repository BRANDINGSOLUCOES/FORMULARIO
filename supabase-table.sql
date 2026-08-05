-- Schema — Diagnóstico Empresarial (Branding Soluções)
-- Rode este SQL no SQL Editor do Supabase.
--
-- Estrutura relacional:
--   companies    → 1 linha por empresa/lead que preencheu o formulário
--   answers      → N linhas por empresa, 1 linha por pergunta respondida
--   diagnostics  → N linhas por empresa (score, json, html, pdf_url, status de envio)
--
-- ── AUDITORIA DE RLS (Etapa 9) ──────────────────────────────────────────
-- Toda tabela abaixo tem Row Level Security HABILITADO. Resumo de quem
-- pode fazer o quê:
--
--                 anon (form.  público)    authenticated (admin)   service_role (Edge Fns/pdf-function)
--   companies     INSERT apenas             SELECT, DELETE          tudo (ignora RLS)
--   answers       INSERT apenas             SELECT, DELETE          tudo (ignora RLS)
--   diagnostics   nenhum acesso             SELECT, DELETE          tudo (ignora RLS)
--   storage.objects
--   (bucket diagnostics)
--                 leitura via URL pública*  DELETE                  tudo (ignora RLS)
--
-- * Buckets marcados como `public` no Storage servem os arquivos por uma
--   URL pública (/storage/v1/object/public/...) que não passa pelas
--   policies de storage.objects — por isso não existe (nem precisa
--   existir) uma policy de SELECT para `anon` nessa tabela.
-- ─────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text,
  empresa text,
  email text,
  telefone text,
  cidade text,
  estado text,
  segmento text
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pergunta text not null,
  resposta text
);

-- Etapa 8 — usado para exibir as respostas na página de detalhes da
-- empresa na mesma ordem em que foram enviadas.
alter table public.answers add column if not exists created_at timestamptz not null default now();

create index if not exists answers_company_id_idx on public.answers(company_id);

-- Etapa 2 — resultado do diagnóstico gerado por IA (1 por empresa/análise)
create table if not exists public.diagnostics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  score integer,
  nivel text,
  json jsonb not null,
  created_at timestamptz not null default now()
);

-- Etapa 3 — relatório HTML gerado a partir do JSON acima
alter table public.diagnostics add column if not exists html text;

-- Etapa 4 — PDF do relatório (gerado por Puppeteer, fora do Supabase)
alter table public.diagnostics add column if not exists pdf_url text;

-- Etapa 5 — envio automático por WhatsApp (Evolution API)
alter table public.diagnostics add column if not exists whatsapp_status text;
alter table public.diagnostics add column if not exists whatsapp_sent_at timestamptz;

-- Etapa 6 — envio automático por e-mail (Resend)
alter table public.diagnostics add column if not exists email_status text;
alter table public.diagnostics add column if not exists email_sent_at timestamptz;

-- Bucket de Storage onde os PDFs são salvos (público, para o pdf_url
-- funcionar como link direto de download).
insert into storage.buckets (id, name, public)
values ('diagnostics', 'diagnostics', true)
on conflict (id) do nothing;

create index if not exists diagnostics_company_id_idx on public.diagnostics(company_id);

-- Etapa 9 — a consulta mais comum do projeto é "o diagnóstico mais
-- recente de uma empresa" (fetchLatestDiagnostic, usada por sendWhatsapp,
-- sendEmail, resend-whatsapp, resend-email e na tela de detalhes do
-- admin). Esse índice composto atende esse padrão de acesso diretamente,
-- sem precisar escanear todas as linhas da empresa para ordenar.
create index if not exists diagnostics_company_created_idx
  on public.diagnostics(company_id, created_at desc);

-- Row Level Security
alter table public.companies enable row level security;
alter table public.answers enable row level security;
alter table public.diagnostics enable row level security;

-- Permite que o formulário público (chave anon) grave novos registros,
-- mas nunca leia, altere ou apague dados já salvos.
create policy "Public can insert companies"
  on public.companies
  for insert
  to anon
  with check (true);

create policy "Public can insert answers"
  on public.answers
  for insert
  to anon
  with check (true);

-- Etapa 7 — leitura para o painel administrativo (usuários logados via
-- Supabase Auth, criados manualmente no dashboard — não há cadastro
-- público). RLS continua bloqueando totalmente o acesso anônimo.
create policy "Authenticated can select companies"
  on public.companies
  for select
  to authenticated
  using (true);

create policy "Authenticated can select answers"
  on public.answers
  for select
  to authenticated
  using (true);

create policy "Authenticated can select diagnostics"
  on public.diagnostics
  for select
  to authenticated
  using (true);

-- Etapa 8 — botão "Excluir" no painel administrativo. answers/diagnostics
-- já são apagados em cascata (ON DELETE CASCADE) quando a empresa é
-- excluída, mas as policies abaixo também são criadas explicitamente
-- por segurança/clareza.
create policy "Authenticated can delete companies"
  on public.companies
  for delete
  to authenticated
  using (true);

create policy "Authenticated can delete answers"
  on public.answers
  for delete
  to authenticated
  using (true);

create policy "Authenticated can delete diagnostics"
  on public.diagnostics
  for delete
  to authenticated
  using (true);

-- Permite apagar o PDF do Storage junto com a empresa.
create policy "Authenticated can delete diagnostics pdfs"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'diagnostics');

-- `diagnostics` não tem policy para `anon`: só a Edge Function
-- `generateDiagnosis` grava aqui, usando a service_role key
-- (que ignora RLS). Nenhum acesso público de leitura/escrita.

-- Leitura/exportação dos leads deve ser feita pelo painel do Supabase
-- ou com a service_role key num backend confiável — nunca pelo navegador.
