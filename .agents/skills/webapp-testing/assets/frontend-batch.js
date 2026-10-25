// Adapt these IDs, paths and business expectations to the target application.
// LP_FRONTEND_URL and LP_TOKEN are supplied to the Lightpanda process environment.
// This script is one independent browser session, not a continuation of an MCP suite.
const page = new Page();
await page.goto('$LP_FRONTEND_URL');
page.waitForSelector('#login-token');
page.fill({selector: '#login-token', value: '$LP_TOKEN'});
page.click({selector: '#login-submit'});
page.waitForSelector('#order-search');
page.fill({selector: '#order-search', value: 'webtest-native-batch'});
page.click({selector: '#order-search-submit'});
page.waitForScript("document.getElementById('order-list').textContent.includes('webtest-native-batch')");
return {status: 'pass', assertions: [{id: 'order-search-result', status: 'pass'}]};
