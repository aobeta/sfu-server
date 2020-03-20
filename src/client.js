// npm packages
const socket = require('socket.io-client');
const { types, version, detectDevice, Device, parseScalabilityMode } = require('mediasoup-client');

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
  connectTransport: null,
  tracks: {
    audio: null,
    video: null,
  },
};

_connectBtn.addEventListener('click', connect);

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    let stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    _localPeer.tracks.audio = stream.getAudioTracks()[0];
    _localPeer.tracks.video = stream.getVideoTracks()[0];
    await connect();

    // request rtp capabilities from server.
    const routerRtpCapabilities = await _socket.request(
      'getRouterRtpCapabilites',
      window.__RoomId__,
    );

    // load mediasoup device
    await _device.load({ routerRtpCapabilities });

    console.info('device successfully set up with server side router', routerRtpCapabilities);

    console.info('device can produce video?', _device.canProduce('video'));
    console.info('device can produce audio?', _device.canProduce('audio'));

    const { sendTransport, recvTransport } = await _socket.request(
      'getTransports',
      window.__RoomId__,
    );

    console.log(sendTransport);

    _localPeer.sendTransport = _device.createSendTransport(sendTransport);
    _localPeer.recvTransport = _device.createRecvTransport(recvTransport);

    _localPeer.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      console.info('[Transport] transport connect event emmitted :: ', dtlsParameters);

      _localPeer.connectTransport = async function() {
        const { success } = await _socket.request(
          'send-transport-connect',
          window.__RoomId__,
          dtlsParameters,
        );
        console.log('successfully able to connect send transport? :', success);
        if (success) {
          callback();
        } else {
          errback();
        }
      };

      await startTransportIfNecessary();
    });

    _localPeer.sendTransport.on('produce', async (parameters, callback, errback) => {
      console.info('[Transport] transport produce event emmitted :: ', parameters);
      let { id, error } = await _socket.request(
        'send-transport-produce',
        window.__RoomId__,
        parameters,
      );

      if (error) {
        errback(error);
      } else {
        callback({ id });
      }
    });

    _localPeer.audioProducer = await _localPeer.sendTransport.produce({
      track: _localPeer.tracks.video,
      //   encodings: [
      //     { maxBitrate: 100000 },
      //     { maxBitrate: 300000 },
      //     { maxBitrate: 900000 },
      //   ],
      //   codecOptions: {
      //     videoGoogleStartBitrate: 1000,
      //   },
    });
    console.log('created audio producer');

    _localPeer.videoProducer = await _localPeer.sendTransport.produce({
      track: _localPeer.tracks.audio,
      //   encodings: [
      //     { maxBitrate: 100000 },
      //     { maxBitrate: 300000 },
      //     { maxBitrate: 900000 },
      //   ],
      //   codecOptions: {
      //     videoGoogleStartBitrate: 1000,
      //   },
    });
    console.log('created videoProducer');
  } catch (e) {
    console.log('getUsermedia error: ', e);
  }
}

async function startTransportIfNecessary() {
  const count = await _socket.request('getRoomParticipants', window.__RoomId__);
  console.log('[PARTICIPANT COUNT] : ', count);
  if (count > 1) {
    // then connect the transport and start producing.
    console.info('enough participants in the room.. connecting transport');
    await _localPeer.connectTransport();
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
