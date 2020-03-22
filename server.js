const mediasoup = require('mediasoup');
const path = require('path');

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

    // setTimeout(() => exec(`open ${serverPath}/`), 1500);
  } catch (e) {
    console.log(e);
  }
})();
