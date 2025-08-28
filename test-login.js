const { chromium } = require('playwright');

async function testLogin() {
  const browser = await chromium.launch({ 
    headless: true, // Running in headless mode
    slowMo: 100 // Small delay between actions
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login');
    
    console.log('Filling in credentials...');
    await page.fill('input[type="email"]', 'gabrielxz@yahoo.com');
    await page.fill('input[type="password"]', 'gideonxz');
    
    console.log('Clicking sign in button...');
    await page.click('button[type="submit"]');
    
    console.log('Waiting for navigation...');
    
    // Wait for either dashboard or stay on login (if auth failed)
    await Promise.race([
      page.waitForURL('**/dashboard', { timeout: 10000 }),
      page.waitForTimeout(10000)
    ]);
    
    const currentUrl = page.url();
    console.log('Current URL:', currentUrl);
    
    if (currentUrl.includes('dashboard')) {
      console.log('Successfully logged in! Taking dashboard screenshots...');
      await page.waitForTimeout(3000); // Wait for content to load
      
      // Take screenshots
      await page.screenshot({ path: '/tmp/dashboard-authenticated.png', fullPage: true });
      console.log('Dashboard screenshot saved to /tmp/dashboard-authenticated.png');
      
      // Try to scroll to see more content
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '/tmp/dashboard-scrolled.png' });
      console.log('Scrolled view saved to /tmp/dashboard-scrolled.png');
    } else {
      console.log('Login might have failed or redirected elsewhere');
      await page.screenshot({ path: '/tmp/login-attempt.png' });
      console.log('Screenshot saved to /tmp/login-attempt.png');
    }
    
  } catch (error) {
    console.error('Error during login:', error);
    await page.screenshot({ path: 'error-screenshot.png' });
  } finally {
    await browser.close();
  }
}

testLogin();