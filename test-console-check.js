const { chromium } = require('playwright');

async function checkConsole() {
  const browser = await chromium.launch({ 
    headless: true
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      text: msg.text()
    });
  });

  // Capture page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.toString());
  });

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login');
    await page.waitForTimeout(2000);
    
    console.log('Logging in...');
    await page.fill('input[type="email"]', 'gabrielxz@yahoo.com');
    await page.fill('input[type="password"]', 'gideonxz');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('Successfully on dashboard');
    
    // Wait for page to fully load
    await page.waitForTimeout(3000);
    
    // Check for console logs
    console.log('\n=== Console Logs ===');
    if (consoleLogs.length === 0) {
      console.log('No console messages');
    } else {
      consoleLogs.forEach(log => {
        console.log(`[${log.type}] ${log.text}`);
      });
    }
    
    // Check for page errors
    console.log('\n=== Page Errors ===');
    if (pageErrors.length === 0) {
      console.log('No page errors');
    } else {
      pageErrors.forEach(error => {
        console.log(error);
      });
    }
    
    // Check if all expected elements are present
    console.log('\n=== Element Checks ===');
    const elements = {
      'Navigation': 'nav',
      'Fitness Fight Club Title': 'h1:has-text("Fitness Fight Club")',
      'Connect Strava Button': 'button:has-text("Connect Strava")',
      'Glass Card': '.glass-card'
    };
    
    for (const [name, selector] of Object.entries(elements)) {
      const exists = await page.locator(selector).count() > 0;
      console.log(`${name}: ${exists ? '✓' : '✗'}`);
    }
    
    // Check computed styles
    console.log('\n=== Style Checks ===');
    const bodyStyles = await page.evaluate(() => {
      const body = document.body;
      const computed = window.getComputedStyle(body);
      return {
        background: computed.background,
        color: computed.color,
        minHeight: computed.minHeight
      };
    });
    console.log('Body styles:', bodyStyles);
    
  } catch (error) {
    console.error('Error during check:', error);
  } finally {
    await browser.close();
  }
}

checkConsole();