import puppeteer from 'puppeteer';

async function run() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent('<h1>Hello OG Image</h1>');
  const buffer = await page.screenshot({ type: 'png' });
  console.log('Puppeteer works, image size:', buffer.length);
  await browser.close();
}
run().catch(console.error);
