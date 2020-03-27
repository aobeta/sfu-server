const path = require('path');
const config = require('./config');

const { startWebServer } = require('./src/webserver');
const { startExpressApp } = require('./src/express');
const startSocketServer = require('./src/socketServer');
const { createWorker } = require('./src/SfuWorker');
const { exec } = require('child_process');

(async function() {
  try {
    let app = startExpressApp({ webRoot: path.join(__dirname, '/dist') });
    const { path: serverPath, webServer } = await startWebServer(app);
    startSocketServer(webServer);
    createWorker();
    console.log('opening browser...');

    if (config.openBrowserOnStart) setTimeout(() => exec(`open ${serverPath}/`), 1500);
  } catch (e) {
    console.log(e);
  }
})();
