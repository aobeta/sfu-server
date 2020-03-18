const mediasoup = require('mediasoup');
const path = require('path');

const { startWebServer } = require('./src/webserver');
const { startExpressApp } = require('./src/express');
const startSocketServer = require('./src/socketServer');
const { exec } = require('child_process');

(async function() {
  try {
    let app = startExpressApp({ webRoot: path.join(__dirname, '/dist') });
    const { path: serverPath, webServer } = await startWebServer(app);
    startSocketServer(webServer);
    exec(`open ${serverPath}/`);
  } catch (e) {
    console.log(e);
  }
})();
