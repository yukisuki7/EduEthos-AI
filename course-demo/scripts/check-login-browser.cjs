// Browser regression: successful login must reveal the workspace without reload.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const credentials = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    for (const account of credentials.accounts) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (process.argv.includes('--local-html')) {
        await page.route(credentials.url + '/', route => route.fulfill({contentType:'text/html', body:
          fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8').replace('<head>', "<head><script>window.EDUETHOS_ACCOUNT_MODE='isolated';</script>")}));
      }
      await page.goto(credentials.url + '/');
      await page.locator('#demo-username').fill(account.username);
      await page.locator('#demo-password').fill(account.password);
      await page.locator('.demo-login-form .entry-submit').click();
      await page.waitForFunction(() => {
        const app = Alpine.$data(document.body);
        return !app.loginBusy && app.demoUser && app.identityReady;
      });
      await page.waitForTimeout(400); // Allow pending Alpine hide/transition frames to finish.
      await assert.doesNotReject(() => page.locator('.app-shell').waitFor({state:'visible', timeout:3000}), 'workspace must appear after login without refresh');
      assert.equal(await page.locator('.modal-backdrop').first().isVisible(), false);
      const role = await page.evaluate(() => Alpine.$data(document.body).role);
      assert.equal(role, account.role);
      if (role === 'teacher') await page.locator('.analytics-view').first().waitFor({state:'visible'});
      assert.deepEqual(errors, []);
      await page.reload();
      await page.locator('.app-shell').waitFor({state:'visible'});
      assert.equal(await page.evaluate(() => Alpine.$data(document.body).role), role);
      await page.evaluate(() => Alpine.$data(document.body).logoutDemo());
      await page.locator('#demo-username').waitFor({state:'visible'});
      console.log(`${account.username}: login workspace, refresh session, logout passed`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error.message); process.exitCode = 1;});
