const mediasoup = require('mediasoup');

const socketIOServer = require('socket.io');

const { startWebServer } = require('./src/webserver');
const { startExpressApp } = require('./src/express');
const { exec } = require('child_process');

(async function() {
  try {
    let app = startExpressApp();
    const path = await startWebServer(app);
    exec(`open ${path}/`);
  } catch (e) {
    console.log(e);
  }
})();
