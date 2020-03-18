const mediasoup = require('mediasoup');
const config = require('../config');

let _worker;
let _routers = new Map();
let _mediaCodecs = mediasoup.getSupportedRtpCapabilities().codecs.filter(
  // have to filter out codecs the other two 'audio/CN' codecs to avoid duplicate prefferredPayloadTypes error
  codec =>
    codec.mimeType === 'audio/CN' &&
    codec.clockRate !== 16000 &&
    codec.clockRate !== 8000,
);

async function createWorker() {
  _worker = await mediasoup.createWorker({
    logLevel: 'debug',
  });
  return _worker;
}

async function createNewRouter() {
  // create worker if it hasnt been created already.
  if (!_worker) await createWorker();

  const router = await _worker.createRouter({ _mediaCodecs });
  _routers.set(router.id, router);
  return router;
}

async function createNewTransport(router) {
  return router.createWebRtcTransport({ ...config.webRtcTransport });
}

async function createNewTransports(router) {
  return [
    router.createWebRtcTransport({ ...config.webRtcTransport }),
    router.createWebRtcTransport({ ...config.webRtcTransport }),
  ];
}

function getRouter(routerId) {
  return _routers.get(routerId);
}

function getRouters() {
  return _routers;
}

function getWorker() {
  return _worker;
}

module.exports = {
  createWorker,
  getWorker,
  createNewRouter,
  createNewTransport,
  createNewTransports,
};
