// pdf-function/services/pdfRenderer.ts
//
// Renderização do relatório HTML em PDF via Puppeteer + Chromium
// serverless. Continua sendo o único motivo pelo qual este módulo
// precisa rodar em Node.js (Deno Deploy não permite abrir um binário
// de Chromium).
//
// ⚠️ Usa @sparticuz/chromium-min (não a versão completa @sparticuz/chromium)
// porque a versão completa embute o binário do Chromium (~130MB) dentro
// da função — isso estoura o limite de tamanho de função da Vercel
// (50MB comprimido), fazendo arquivos internos (como libnss3.so) serem
// descartados silenciosamente no deploy, quebrando o Chromium em tempo
// de execução com "error while loading shared libraries: libnss3.so".
// A versão "-min" busca o pacote do Chromium de uma URL externa na
// primeira execução (fica em cache no /tmp entre execuções "quentes"),
// mantendo o tamanho da função dentro do limite.
//
// Otimização de performance (Etapa 9): em execuções "quentes" de uma
// função serverless (a mesma instância atendendo requisições seguidas),
// reabrir o Chromium do zero a cada chamada é o maior custo de tempo.
// Aqui o browser fica em cache no escopo do módulo e é reaproveitado
// enquanto a instância continuar viva — sem efeito colateral, porque
// cada renderização usa uma aba (`page`) nova e a fecha ao final.

import chromium from '@sparticuz/chromium-min';
import puppeteer, { Browser } from 'puppeteer-core';

// Pacote oficial do Chromium hospedado pelo próprio mantenedor do
// @sparticuz/chromium — a versão no nome do arquivo precisa bater com a
// versão do pacote em package.json (ver CHROMIUM_PACK_VERSION abaixo).
const CHROMIUM_PACK_VERSION = '149.0.0';
const REMOTE_CHROMIUM_URL =
  process.env.CHROMIUM_REMOTE_PACK_URL ||
  `https://github.com/Sparticuz/chromium/releases/download/v${CHROMIUM_PACK_VERSION}/chromium-v${CHROMIUM_PACK_VERSION}-pack.tar`;

let cachedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) {
    return cachedBrowser;
  }
  cachedBrowser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754 }, // proporção A4 em pixels (96dpi)
    executablePath: await chromium.executablePath(REMOTE_CHROMIUM_URL),
    headless: true,
  });
  return cachedBrowser;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // 'setContent()' só aceita 'load' | 'domcontentloaded' — usamos 'load'
    // para dar tempo do CSS ser aplicado, e esperamos explicitamente as
    // fontes do Google Fonts terminarem de carregar (o evento 'load'
    // sozinho não garante isso).
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    // Fecha só a aba — o browser em si fica vivo para a próxima chamada.
    await page.close();
  }
}
