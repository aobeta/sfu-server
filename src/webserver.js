const http = require('http');
const https = require('https');
const fs = require('fs');
const config = require('../config');

async function startWebServer(expressApp) {
  const { sslKey, sslCert, useSsl } = config;
  if (useSsl) {
    if (!fs.existsSync(sslKey) || !fs.existsSync(sslCert)) {
      console.error('SSL files are not found. check your config.js file');
      process.exit(0);
    }
    const tls = {
      cert: fs.readFileSync(sslCert),
      key: fs.readFileSync(sslKey),
    };
    webServer = https.createServer(tls, expressApp);
  } else {
    webServer = http.createServer(expressApp);
  }

  webServer.on('error', err => {
    console.error('starting web server failed:', err.message);
  });

  return new Promise(resolve => {
    let { listenIp, listenPort, useSsl } = config;
    listenPort = listenPort || process.env.PORT;
    const protocol = useSsl ? 'https' : 'http';
    const path = `${protocol}://${listenIp}:${listenPort}`;

    webServer.listen(listenPort, () => {
      console.log('server is running at path %s', path);
      resolve(path);
    });
  });
}

module.exports = {
  startWebServer,
};
