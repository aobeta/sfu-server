// npm packages
const socket = require('socket.io-client');
const { types, version, detectDevice, Device, parseScalabilityMode } = require('mediasoup-client');

// private home-made libs
const $ = require('../lib/element');
const socketRequest = require('../lib/socketRequest');

// global variables
let _socket;
let _device;
const handlerName = detectDevice();
if (handlerName) {
  _device = new Device({ handlerName: 'Chrome74' }); // TODO resolve handler depending on browser.
} else {
}

const _localPeer = {
  sendTransport: null,
  recvTransport: null,
  audioProducer: null,
  videoProducer: null,
  rtpCapabilities: null,
  tracks: {
    audio: null,
    video: null,
  },
};

let _remoteParticipants = new Map();

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    await initializeDevice();
    await initializeTransports();
    await startProducing();
  } catch (e) {
    console.log('Init() error: ', e);
  }
}

async function startTransportIfNecessary() {
  if (_remoteParticipants.length > 0) {
    // then connect the transport and start producing.
    console.info('enough participants in the room.. connecting transport');
    await _localPeer.connectTransport();
  }
}

function connect() {
  _socket = socket({ autoConnect: true });
  _socket.request = socketRequest(_socket);

  setUpSocketListeners(_socket);

  return new Promise((resolve, reject) => {
    _socket.on('connect', async () => {
      console.log('connected to SOCKET.IO server');
      let { participants, error } = await _socket.request('joinRoom', window.__RoomId__);
      console.log('participants :: ', participants);
      if (error) {
        reject(error);
      } else {
        _remoteParticipants = new Map(
          participants.map(participant => [participant.id, participant])
        );

        participants.forEach(participant => {
          setUpNewParticipantVideoContainers(participant.id);
        });
        resolve();
      }
    });
  });
}

function setUpLocalVideo(track) {
  const stream = new MediaStream([track]);
  $('#local_video').srcObject = stream;
}

async function initializeDevice() {
  if (!_device) {
    alert('Device is not supported');
    throw new Error('Device is not supported');
  }

  let stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  });
  _localPeer.tracks.audio = stream.getAudioTracks()[0];
  _localPeer.tracks.video = stream.getVideoTracks()[0];
  await connect();

  setUpLocalVideo(_localPeer.tracks.video);

  // request rtp capabilities from server.
  const routerRtpCapabilities = await _socket.request('getRouterRtpCapabilites', window.__RoomId__);

  // load mediasoup device
  await _device.load({ routerRtpCapabilities });

  await _socket.request('informRtpCapabilites', window.__RoomId__, _device.rtpCapabilities);

  console.info('device successfully set up with server side router', routerRtpCapabilities);

  console.info('device can produce video?', _device.canProduce('video'));
  console.info('device can produce audio?', _device.canProduce('audio'));
}

async function initializeTransports() {
  const { sendTransport, recvTransport } = await _socket.request(
    'getTransports',
    window.__RoomId__
  );

  _localPeer.sendTransport = _device.createSendTransport(sendTransport);
  _localPeer.recvTransport = _device.createRecvTransport(recvTransport);

  _localPeer.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    console.info('[Send-Transport] transport connect event emmitted :: ', dtlsParameters);

    const { success } = await _socket.request(
      'send-transport-connect',
      window.__RoomId__,
      dtlsParameters
    );
    if (success) {
      callback();
    } else {
      errback();
    }

    /** If we decide to connect transports only when other participants join, then we will uncomment
     *  this logic below.
     */
    // await startTransportIfNecessary();
  });

  _localPeer.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    console.info('[Recv-Transport] transport connect event emmitted :: ', dtlsParameters);
    const { success, error } = await _socket.request(
      'recv-transport-connect',
      window.__RoomId__,
      dtlsParameters
    );

    if (success) {
      callback();
    } else {
      errback();
    }
  });

  _localPeer.sendTransport.on('produce', async (parameters, callback, errback) => {
    console.info('[Transport] transport produce event emmitted :: ', parameters);
    let { id, error } = await _socket.request(
      'send-transport-produce',
      window.__RoomId__,
      parameters
    );

    if (error) {
      errback(error);
    } else {
      callback({ id });
    }
  });
}

async function startProducing() {
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
  let consumers = await _socket.request('participant-ready', window.__RoomId__);

  for (let participantConsumers of consumers) {
    const participant = _remoteParticipants.get(participantConsumers.participantId);
    await setUpConsumers(participant, participantConsumers);
  }
}

function setUpSocketListeners() {
  onSocket('newParticipant', participant => {
    _remoteParticipants.set(participant.id, participant);
    setUpNewParticipantVideoContainers(participant.id);
  });

  onSocket('participant-disconnect', participantId => {
    const participantVideoContainer = $(`[data-participant="${participantId}"]`);
    participantVideoContainer.remove();
  });

  onSocket('participant-ready', participant => {
    _remoteParticipants.set(participant.id, participant);
  });

  onSocket('new-participant-consumers', consumers => {
    const participant = _remoteParticipants.get(consumers.participantId);
    const { audioConsumer, videoConsumer } = consumers;

    console.log('participant after setting up consumers ------> ', participant);

    setUpConsumers(participant, consumers);
  });
}

async function setUpConsumers(participant, { audioConsumer, videoConsumer, participantId }) {
  const audio = await _localPeer.recvTransport.consume(audioConsumer);
  const video = await _localPeer.recvTransport.consume(videoConsumer);
  Object.assign(participant, { audioConsumer: audio, videoConsumer: video });

  await _socket.request('audio-consumer-resume', window.__RoomId__, participantId);
  audio.resume();
  await _socket.request('video-consumer-resume', window.__RoomId__, participantId);
  video.resume();
  console.log('successfully resumed consumers. ready to get media stream tracks');
  console.log('audio consumer track :: ', audio.track);
  console.log('video consumer track :: ', video.track);

  setUpRemoteVideo([audio.track, video.track], participantId);
}

function setUpRemoteVideo(tracks, participantId) {
  const stream = new MediaStream(tracks);
  $(`#${participantId}`).srcObject = stream;
}

function setUpNewParticipantVideoContainers(participantId) {
  const remoteVideoContainer = $('.videoContainers');
  const participantContainer = document.createElement('div');
  participantContainer.innerHTML = `
    <div class="videoLabel">${participantId}</div>
    <video id="${participantId}" autoplay playsinline></video>
  `;

  participantContainer.dataset.participant = participantId;
  participantContainer.className = 'videoContainer';
  remoteVideoContainer.appendChild(participantContainer);
}

function onSocket(event, callback) {
  _socket.on(event, function() {
    let args = Array.from(arguments);
    const callbackfn = args[args.length - 1];
    args = args.slice(args.length - 2);
    console.info(`Socket.Event::[${event}] `, ...args);
    callback(...args, callbackfn);
  });
}
