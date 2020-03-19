const mediasoup = require('mediasoup');
const config = require('../config');

let _worker;
let _routers = new Map();

let _mediaCodecs = config.router.mediaCodecs;

async function createWorker() {
  _worker = await mediasoup.createWorker({
    logLevel: 'debug',
  });
  return _worker;
}

async function createNewRouter() {
  // create worker if it hasnt been created already.
  if (!_worker) await createWorker();

  const router = await _worker.createRouter({ mediaCodecs: _mediaCodecs });
  _routers.set(router.id, router);
  return router;
}

async function createNewTransport(router) {
  return await router.createWebRtcTransport({ ...config.webRtcTransport });
}

async function createNewTransports(router) {
  return [
    await router.createWebRtcTransport({ ...config.webRtcTransport }),
    await router.createWebRtcTransport({ ...config.webRtcTransport }),
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
