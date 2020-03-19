// npm packages
const socket = require('socket.io-client');
const {
  types,
  version,
  detectDevice,
  Device,
  parseScalabilityMode,
} = require('mediasoup-client');

// private home-made libs
const $ = require('../lib/element');
const socketRequest = require('../lib/socketRequest');

// dom elements
const _connectBtn = $('#btn_connect');
const _connectMsg = $('#connection_status');

// global variables
let _socket;
let _device = new Device({ handlerName: 'Chrome74' }); // TODO resolve handler depending on browser.
let _localPeer = {
  sendTransport: null,
  recvTransport: null,
  audioProducer: null,
  videoProducer: null,
};

_connectBtn.addEventListener('click', connect);

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    let stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    let audioTrack = stream.getAudioTracks()[0];
    let videoTrack = stream.getVideoTracks()[0];

    await connect();

    // request rtp capabilities from server.
    const routerRtpCapabilities = await _socket.request(
      'getRouterRtpCapabilites',
      window.__RoomId__,
    );

    // load mediasoup device
    await _device.load({ routerRtpCapabilities });

    console.info(
      'device successfully set up with server side router',
      routerRtpCapabilities,
    );

    console.info('device can produce video?', _device.canProduce('video'));
    console.info('device can produce audio?', _device.canProduce('audio'));

    const { sendTransport, recvTransport } = await _socket.request(
      'getTransports',
      window.__RoomId__,
    );

    console.log(sendTransport);

    _localPeer.sendTransport = _device.createSendTransport(sendTransport);
    _localPeer.recvTransport = _device.createRecvTransport(recvTransport);

    _localPeer.sendTransport.on(
      'connect',
      async ({ dtlsParameters }, callback, errback) => {
        console.info(
          '[Transport] transport connect event emmitted :: ',
          dtlsParameters,
        );
      },
    );

    _localPeer.sendTransport.on(
      'produce',
      async (parameters, callback, errback) => {
        console.info(
          '[Transport] transport produce event emmitted :: ',
          parameters,
        );
      },
    );

    _localPeer.videoProducer = await _localPeer.sendTransport.produce({
      track: videoTrack,
      //   encodings: [
      //     { maxBitrate: 100000 },
      //     { maxBitrate: 300000 },
      //     { maxBitrate: 900000 },
      //   ],
      //   codecOptions: {
      //     videoGoogleStartBitrate: 1000,
      //   },
    });

    _localPeer.audioProducer = await _localPeer.sendTransport.produce({
      track: audioTrack,
      //   encodings: [
      //     { maxBitrate: 100000 },
      //     { maxBitrate: 300000 },
      //     { maxBitrate: 900000 },
      //   ],
      //   codecOptions: {
      //     videoGoogleStartBitrate: 1000,
      //   },
    });
  } catch (e) {
    console.log('getUsermedia error: ', e);
  }
}

function connect() {
  _socket = socket({ autoConnect: true });
  _socket.request = socketRequest(_socket);

  return new Promise(resolve => {
    _socket.on('connect', async () => {
      console.log('connected to SOCKET.IO server');
      let roomResult = await _socket.request('joinRoom', window.__RoomId__);
      console.log('room result: ', roomResult);
      resolve();
    });
  });
}
