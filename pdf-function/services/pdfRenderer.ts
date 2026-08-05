// pdf-function/services/pdfRenderer.ts
//
// Renderização do relatório HTML em PDF via Puppeteer + Chromium
// serverless (@sparticuz/chromium). Continua sendo o único motivo pelo
// qual este módulo precisa rodar em Node.js (Deno Deploy não permite
// abrir um binário de Chromium).
//
// Otimização de performance (Etapa 9): em execuções "quentes" de uma
// função serverless (a mesma instância atendendo requisições seguidas),
// reabrir o Chromium do zero a cada chamada é o maior custo de tempo.
// Aqui o browser fica em cache no escopo do módulo e é reaproveitado
// enquanto a instância continuar viva — sem efeito colateral, porque
// cada renderização usa uma aba (`page`) nova e a fecha ao final.

import chromium from '@sparticuz/chromium';
import puppeteer, { Browser } from 'puppeteer-core';

let cachedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (cachedBrowser && cachedBrowser.connected) {
    return cachedBrowser;
  }
  cachedBrowser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  return cachedBrowser;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // O relatório é autocontido (CSS e logo embutidos em base64), então
    // não depende de nada externo além das fontes do Google Fonts — por
    // isso esperamos a rede ficar ociosa antes de gerar o PDF.
    await page.setContent(html, { waitUntil: 'networkidle0' });
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
