# Diagnóstico Empresarial — Branding Soluções

Landing page (wizard de formulário) + backend completo (IA, PDF, WhatsApp,
e-mail) + painel administrativo, para captar leads e gerar automaticamente
um diagnóstico empresarial personalizado.

## Status atual: pipeline 100% conectado, ponta a ponta

A partir do envio do formulário, tudo acontece sozinho, sem nenhuma ação
manual: salvar dados → gerar diagnóstico com IA → gerar PDF → enviar por
WhatsApp e e-mail. O painel administrativo também está completo (login,
dashboard, detalhes por empresa), e o projeto passou por uma revisão geral
de organização, tipagem, segurança e performance (Etapa 9). **O layout e o
comportamento visual do formulário não foram alterados por nenhuma dessas
etapas de backend.**

## Sumário das etapas

| Etapa | O que faz |
|---|---|
| 0 | Formulário (wizard de 6 etapas) — `index.html` |
| 1 | Salva `companies` + `answers` no Supabase |
| 2 | Gera o diagnóstico com IA (OpenAI) — Edge Function `generateDiagnosis` |
| 3 | Monta o relatório em HTML a partir do diagnóstico |
| 4 | Gera o PDF do relatório (Puppeteer) e salva no Storage |
| 5 | Envia o link do PDF por WhatsApp (Evolution API) |
| 6 | Envia o link do PDF por e-mail (Resend) |
| 7 | Painel administrativo (login + dashboard) |
| 8 | Tela de detalhes da empresa no painel (`admin/company.html`) |
| 9 | Revisão geral: organização, tipagem, RLS, validação, erros, logs, performance |

## Estrutura do projeto

```
index.html                        — formulário público (wizard de 6 etapas)
obrigado.html                     — página de sucesso

admin/                            — painel administrativo (protegido por login)
  login.html
  dashboard.html
  company.html                    — detalhes de uma empresa (?id=uuid)
  shared.js                       — componentes de UI reutilizáveis (JS)
  admin-theme.css                 — design system compartilhado (CSS)

supabase-functions/                — Edge Functions (Deno) — deploy no Supabase
  _shared/
    types.ts                      — tipos TypeScript compartilhados
    supabaseAdmin.ts              — fábrica única do client (service_role)
    companiesRepo.ts              — acesso a dados (companies/answers/diagnostics)
    reportTemplate.ts             — componente puro: JSON do diagnóstico → HTML
    logger.ts                     — logger estruturado (JSON)
    errors.ts                     — erros tipados + resposta HTTP padronizada
    validation.ts                 — validação de entrada (UUID, corpo JSON)
  generateDiagnosis/index.ts      — gera o diagnóstico com IA (ÚNICO lugar que chama a OpenAI)
  sendWhatsapp/index.ts           — envia WhatsApp (ÚNICO lugar que chama a Evolution API)
  sendEmail/index.ts              — envia e-mail (ÚNICO lugar que chama a Resend)

pdf-function/                     — módulo Node.js (Puppeteer) — deploy na Vercel/Cloud Run/etc.
  types.ts
  services/
    supabaseAdmin.ts
    diagnosticsRepo.ts
    pdfRenderer.ts                — Puppeteer (com reuso de browser em execuções "quentes")
    storageService.ts             — upload do PDF pro Supabase Storage
    edgeFunctionsClient.ts        — chama generateDiagnosis/sendWhatsapp/sendEmail via HTTP (nunca fala com OpenAI/Evolution/Resend direto)
    logger.ts
    errors.ts
  generatePdfCore.ts              — orquestra: busca diagnóstico → PDF → upload → aciona WhatsApp/e-mail
  fullPipeline.ts                 — orquestra tudo: generateDiagnosis → generatePdfCore
  api/
    generate-pdf.ts               — POST — gera o PDF pela primeira vez
    resend-whatsapp.ts            — POST — reenvia WhatsApp (usa o PDF já existente)
    resend-email.ts               — POST — reenvia e-mail (usa o PDF já existente)
    full-pipeline.ts              — POST — roda o pipeline inteiro (chamado pelo index.html)
  package.json / tsconfig.json / vercel.json

supabase-table.sql                — schema completo + RLS + Storage bucket
README.md
```

## Arquitetura: quem chama quem

```
[ index.html ]
      │  insert (anon key)
      ▼
[ companies / answers ]  (Supabase Postgres)
      │
      │  fetch(..., { keepalive: true })  — fire-and-forget, não bloqueia
      │  o redirecionamento para a tela de sucesso
      ▼
[ pdf-function/api/full-pipeline ]  (Node.js — Vercel/Cloud Run)
      │
      ├──► [ generateDiagnosis ]  (Edge Function, Deno)
      │        │  lê companies/answers, chama a OpenAI,
      │        │  salva em diagnostics (json + html)
      │        ▼
      │     [ diagnostics.json / diagnostics.html ]
      │
      └──► generateAndStorePdf()
               │  lê diagnostics.html, renderiza PDF (Puppeteer),
               │  salva no Storage, salva diagnostics.pdf_url
               ├──► [ sendWhatsapp ]  (Edge Function, Deno) ──► Evolution API
               └──► [ sendEmail ]     (Edge Function, Deno) ──► Resend

[ admin/*.html ]  (Supabase Auth)
      │  SELECT/DELETE (authenticated) em companies/answers/diagnostics
      │  botões "Reenviar" chamam pdf-function/api/resend-whatsapp|resend-email
      ▼
      que por sua vez chamam sendWhatsapp/sendEmail (nunca a Evolution/Resend direto)
```

**Ponto central da Etapa 9:** OpenAI, Evolution API (WhatsApp) e Resend
(e-mail) só são chamadas de dentro de Edge Functions do Supabase — nunca
do navegador, nunca do módulo Node.js. O `pdf-function/` (que precisa
continuar em Node.js por causa do Puppeteer) só *aciona* as Edge Functions
de WhatsApp/e-mail via HTTP, depois que o PDF já está pronto — ele não
guarda mais as chaves da Evolution API nem da Resend.

## O que mudou nesta revisão (Etapa 9), objetivo por objetivo

**Organizar a estrutura do projeto**
Os arquivos soltos na raiz (`supabase-function-generateDiagnosis.ts`,
`supabase-report-template.ts`, `supabase-function-send-diagnostico-email.ts`
— este último já estava obsoleto desde a Etapa 6) viraram uma árvore de
pastas normal: `supabase-functions/` (Deno) e `pdf-function/` (Node),
cada uma já no formato esperado pelo respectivo deploy.

**Remover código duplicado**
- `admin/shared.js` + `admin/admin-theme.css` já existiam desde a Etapa 8.
- Do lado Deno: `_shared/companiesRepo.ts` centraliza toda leitura/escrita
  de `companies`/`answers`/`diagnostics` — antes, `generateDiagnosis` e a
  lógica de WhatsApp/e-mail (que ficava em Node) tinham cada uma sua
  própria versão de "buscar empresa por id".
- Do lado Node: um único `supabaseAdmin.ts` por ambiente, em vez de cada
  arquivo criar seu próprio client.

**Criar tipagens TypeScript**
Todo o `pdf-function/` (antes `.js`/CommonJS solto) virou TypeScript com
tipos reais (`types.ts` em cada lado). Validado com `tsc --noEmit --strict`
com as dependências reais instaladas — zero erros.

**Criar serviços reutilizáveis**
`companiesRepo.ts` (Deno) e `diagnosticsRepo.ts`/`pdfRenderer.ts`/
`storageService.ts`/`edgeFunctionsClient.ts` (Node) — cada um com uma
responsabilidade única, usado por múltiplas functions/handlers.

**Implementar Row Level Security**
RLS já existia desde etapas anteriores; nesta revisão foi auditado e
documentado por completo no topo do `supabase-table.sql` (tabela de quem
pode fazer o quê, por role). Nenhuma tabela ficou de fora.

**Validar entradas**
`_shared/validation.ts` (Deno) valida que `company_id` é um UUID de
verdade antes de qualquer query — antes um ID malformado só quebraria
mais fundo, com um erro genérico do Postgres.

**Tratar erros**
`_shared/errors.ts` (Deno) e `services/errors.ts` (Node): erros tipados
(`ValidationError`, `NotFoundError`, `AppError`) com status HTTP e
formato de resposta consistente em todas as functions/endpoints.

**Criar logs**
`_shared/logger.ts` (Deno) e `services/logger.ts` (Node): logger
estruturado em JSON (timestamp, nível, origem, evento) em todas as
Edge Functions e serviços Node — antes era `console.log`/`console.error`
solto e inconsistente.

**Melhorar performance**
- Índice composto `diagnostics(company_id, created_at desc)` — acelera a
  consulta mais comum do projeto ("diagnóstico mais recente da empresa"),
  usada por `sendWhatsapp`, `sendEmail`, os endpoints de reenvio e a tela
  de detalhes do admin.
- `pdfRenderer.ts` reaproveita a instância do Chromium entre execuções
  "quentes" da função serverless, em vez de abrir um browser novo a cada
  chamada.
- Clients Supabase (Deno e Node) viraram singletons em vez de recriados
  a cada função.

**OpenAI, WhatsApp e Resend só via Edge Functions**
Como descrito na seção de arquitetura acima — mudança estrutural desta
etapa. `pdf-function/services/edgeFunctionsClient.ts` é o único ponto do
lado Node que ainda "fala" com o backend do Supabase para esses envios, e
ele faz isso chamando as Edge Functions via HTTP (autenticado com a
`service_role key` como Bearer token), nunca as APIs de terceiros
diretamente.

## Estrutura do banco

```
companies                 answers                    diagnostics
─────────────             ─────────────────────      ─────────────────────
id (uuid, PK)              id (uuid, PK)               id (uuid, PK)
created_at                 company_id (FK)             company_id (FK)
nome                       pergunta                    score
empresa                    resposta                    nivel
email                      created_at                  json (jsonb)
telefone                                                html (text)
cidade   (sem campo na UI)                              pdf_url (text)
estado   (sem campo na UI)                              whatsapp_status
segmento (sem campo na UI)                              whatsapp_sent_at
                                                         email_status
                                                         email_sent_at
```

Índices: `answers(company_id)`, `diagnostics(company_id)`,
`diagnostics(company_id, created_at desc)`.

## RLS — resumo de acesso

| Tabela | `anon` (formulário público) | `authenticated` (admin) | `service_role` (Edge Functions / pdf-function) |
|---|---|---|---|
| `companies` | INSERT | SELECT, DELETE | tudo |
| `answers` | INSERT | SELECT, DELETE | tudo |
| `diagnostics` | nenhum acesso | SELECT, DELETE | tudo |
| Storage (`diagnostics`) | leitura via URL pública* | DELETE | tudo |

\* bucket público — a leitura do PDF não passa pelas policies de
`storage.objects`, é servida direto pela URL pública do Storage.

## Como funciona cada etapa

### Formulário → banco (Etapas 0-1)
`index.html` valida os campos etapa a etapa (client-side) e, ao clicar em
"Enviar" na última etapa, grava a empresa em `companies` e cada resposta
em `answers` (uma linha por pergunta), usando a chave `anon` do Supabase.

### Diagnóstico com IA (Etapa 2)
`supabase-functions/generateDiagnosis/index.ts`:
1. Busca a empresa e todas as respostas (`_shared/companiesRepo.ts`).
2. Monta um prompt em português com os dados reais da empresa.
3. Chama a OpenAI (`gpt-4o-mini` por padrão, configurável via `OPENAI_MODEL`)
   pedindo um JSON estruturado: `score`, `nivel`, `resumo`, `pontosFortes`,
   `pontosFracos`, `oportunidades`, `plano30/60/90dias`, `conclusao`.
4. Monta o relatório HTML (`_shared/reportTemplate.ts`).
5. Salva tudo em `diagnostics`.

Deploy:
```bash
supabase functions deploy generateDiagnosis
supabase functions deploy sendWhatsapp
supabase functions deploy sendEmail
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set EVOLUTION_API_URL=https://sua-evolution-api.com
supabase secrets set EVOLUTION_API_KEY=sua-apikey
supabase secrets set EVOLUTION_INSTANCE=nome-da-instancia
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set RESEND_FROM_EMAIL=diagnostico@brandingsolucoes.com.br
```
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já ficam disponíveis
automaticamente em toda Edge Function.

### PDF (Etapa 4)
`pdf-function/` continua sendo o único módulo em Node.js do projeto —
Puppeteer não roda em Deno Deploy/Edge Functions (não é possível abrir um
binário de Chromium nesse runtime). `generateAndStorePdf(companyId)`:
1. Busca o diagnóstico (precisa ter `html`).
2. Renderiza o PDF (`services/pdfRenderer.ts`, Puppeteer + `@sparticuz/chromium`).
3. Sobe pro Storage e salva `pdf_url` (`services/storageService.ts` + `services/diagnosticsRepo.ts`).
4. Chama `sendWhatsapp` e `sendEmail` em paralelo (`services/edgeFunctionsClient.ts`).

Deploy (exemplo Vercel):
```bash
cd pdf-function
npm install
vercel deploy
```
Variáveis de ambiente do projeto Node (Vercel):
```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key   (nunca no front-end!)
```
Note que **não são mais necessárias** `EVOLUTION_API_*` nem `RESEND_*`
neste ambiente — essas chaves ficam só nos secrets do Supabase agora.

### Pipeline completo automático (`/api/full-pipeline`)
Depois que `index.html` salva `companies`/`answers`, ele dispara em
segundo plano (`fetch(..., { keepalive: true })`, sem `await`) uma
chamada para `pdf-function/api/full-pipeline`, que roda tudo em sequência:

```
generateDiagnosis (IA) → generateAndStorePdf (PDF + Storage) → sendWhatsapp + sendEmail
```

(`pdf-function/fullPipeline.ts` é quem orquestra essa sequência —
reaproveita `callGenerateDiagnosis()` de `edgeFunctionsClient.ts` e o
`generateAndStorePdf()` que já existia.)

**Por que fire-and-forget:** IA + Puppeteer + notificações juntos podem
levar bem mais que "alguns segundos" — o usuário já recebeu a confirmação
de que os dados foram salvos, então a página redireciona pra
`obrigado.html` sem esperar esse pipeline terminar. `keepalive: true` é o
que garante que a requisição sobrevive ao redirecionamento (sem isso, o
navegador cancelaria a chamada assim que a página fosse descartada).

⚠️ **Configure `maxDuration` generoso pra essa função na Vercel**
(`pdf-function/vercel.json` já define 60s para `full-pipeline` e
`generate-pdf`) — o padrão da plataforma (10s no plano Hobby) não é
suficiente pro pipeline inteiro. Se o seu plano não permitir aumentar o
bastante (IA + Chromium frio + 2 notificações às vezes passam de 60s),
considere migrar esse endpoint pra um modelo de fila/worker em vez de uma
função HTTP síncrona — é a limitação mais real desta arquitetura hoje.

Se `PDF_FUNCTION_BASE_URL` não estiver configurado em `index.html`, o
formulário continua funcionando normalmente (salva os dados) — só não
dispara o pipeline automático, e fica um aviso no console do navegador.

### WhatsApp e e-mail (Etapas 5-6)
`sendWhatsapp` e `sendEmail` (Edge Functions) recebem `{ company_id }`,
buscam sozinhas o diagnóstico mais recente (precisa ter `pdf_url`), montam
a mensagem/e-mail e enviam. Sempre registram o resultado —
`whatsapp_status`/`email_status` = `'enviado'` ou `'erro: <detalhe>'`,
mais o respectivo `*_sent_at`. Nunca lançam erro pro chamador de um jeito
que derrube o outro canal — WhatsApp e e-mail são independentes.

### Painel administrativo (Etapas 7-8)
`admin/login.html` (Supabase Auth, sem cadastro público — contas criadas
manualmente em Dashboard → Authentication → Users → Add user) e
`admin/dashboard.html` (estatísticas, gráficos, tabela com busca/filtro/
paginação) e `admin/company.html?id=<uuid>` (detalhes completos de uma
empresa: dados, respostas, diagnóstico, relatório HTML embutido, PDF,
botões Baixar PDF / Reenviar WhatsApp / Reenviar e-mail / Excluir).

Os botões de reenvio chamam `pdf-function/api/resend-whatsapp` e
`resend-email`, que por sua vez chamam as Edge Functions — nunca falam
com a Evolution API/Resend diretamente.

Configuração (`admin/*.html`):
```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-KEY';
const PDF_FUNCTION_BASE_URL = 'https://SEU-PROJETO-VERCEL.vercel.app'; // só em company.html
```

## Passo a passo de deploy (do zero)

1. **Banco**: rode `supabase-table.sql` inteiro no SQL Editor do Supabase.
2. **Edge Functions**: `supabase functions deploy generateDiagnosis sendWhatsapp sendEmail`
   e configure os secrets (ver acima).
3. **pdf-function**: deploy em Node.js (Vercel/Cloud Run/Railway), com
   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` configurados.
4. **Formulário**: configure `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
   `PDF_FUNCTION_BASE_URL` em `index.html` e publique `index.html` +
   `obrigado.html`.
5. **Admin**: configure `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
   `PDF_FUNCTION_BASE_URL` nos 3 arquivos de `admin/` e publique junto.
6. Crie o primeiro usuário admin no Supabase Dashboard.

## Como testar

```bash
# gerar diagnóstico
curl -X POST https://SEU-PROJETO.supabase.co/functions/v1/generateDiagnosis \
  -H "Content-Type: application/json" -H "Authorization: Bearer SUA_ANON_KEY" \
  -d '{"company_id":"uuid-de-uma-empresa-que-respondeu"}'

# gerar PDF + disparar WhatsApp/e-mail
curl -X POST https://seu-projeto.vercel.app/api/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"company_id":"uuid-da-mesma-empresa"}'
```

## Próximas etapas (fora do escopo atual)
- Exportar a tabela de empresas (CSV/Excel).
- Papéis de acesso diferenciados no admin (ex.: admin vs. atendimento).
- Botão "Gerar diagnóstico"/"Gerar PDF" direto da tela de detalhes.
- Histórico completo de diagnósticos por empresa (hoje mostra só o mais recente).
- Testes automatizados (unitários para os serviços, e2e para o formulário).
- Migrar `/api/full-pipeline` para um modelo de fila/worker se os tempos
  de execução ficarem consistentemente acima do `maxDuration` disponível
  no plano de hospedagem.

## Notas
- O formulário faz validação client-side de todos os campos obrigatórios,
  etapa por etapa, antes de liberar o "Próximo".
- Mobile-first, 100% responsivo, com foco visível para acessibilidade (AA).
- Paleta: azul escuro `#062B45`, azul claro `#7DB0E3`, dourado `#C9A227`
  reservado apenas para os CTAs.
- Autosave: o progresso do formulário fica salvo no navegador (localStorage)
  e é restaurado se a página for recarregada.
- Logo e favicons embutidos em base64 diretamente no HTML — `index.html`
  e `obrigado.html` são arquivos autocontidos, sem depender de uma pasta
  `assets/` externa.
