const socketIO = require('socket.io');
const { createNewRouter, createNewTransports } = require('./SfuWorker');

let _socketServer;
const _rooms = new Map();

function startSocketServer(webServer) {
  _socketServer = new socketIO(webServer, {
    log: true,
    serveClient: false,
  });

  _socketServer.on('connection', handleClientConnect);
}

function handleClientConnect(socket) {
  console.log('new client connected: ', socket.id);
  const participantId = socket.id;

  socket.on('joinRoom', async (roomId, callback) => {
    console.log('user wants to connect with specific room --> ', roomId, _rooms.size);
    // join room so that we can communicate with other people in the room.
    try {
      await new Promise((r, rj) =>
        socket.join(roomId, err => {
          if (err) rj(err);
          else r();
        })
      );

      const [room, participant] = await createOrJoinRoom(roomId, participantId);
      const participants = Array.from(room.participants.values())
        .filter(p => p.id !== participantId) // only send all participants in the room except for you.
        .map(participant => participant.serialize());

      callback({ participants });
      // notify everyone else in the room that there is a new participant.
      socket.to(roomId).emit('newParticipant', participant.serialize());
    } catch (e) {
      callback({
        error: e.message,
      });
    }
  });

  socket.on('getRouterRtpCapabilites', (roomId, callback) => {
    const room = _rooms.get(roomId);
    if (!room) {
      callback({
        error: 'no room with that Id was found',
      });
      return;
    } else {
      callback(room.router.rtpCapabilities);
    }
  });

  socket.on('getTransports', (roomId, callback) => {
    const room = _rooms.get(roomId);
    const participant = room.participants.get(participantId);
    const { sendTransport, recvTransport } = participant;

    callback({
      sendTransport: {
        id: sendTransport.id,
        iceParameters: sendTransport.iceParameters,
        iceCandidates: sendTransport.iceCandidates,
        dtlsParameters: sendTransport.dtlsParameters,
        sctpParamters: sendTransport.sctpParamters,
      },
      recvTransport: {
        id: recvTransport.id,
        iceParameters: recvTransport.iceParameters,
        iceCandidates: recvTransport.iceCandidates,
        dtlsParameters: recvTransport.dtlsParameters,
        sctpParamters: recvTransport.sctpParamters,
      },
    });
  });

  socket.on('disconnect', reason => {
    console.info(
      `----[ ]----- client with id ${participantId} has disconnected. reason: ${reason}`
    );
    const room = Array.from(_rooms.values()).find(room => room.participants.has(participantId));
    console.log('--> found room : ', room.id);
    if (room) {
      // first cleanup the participant
      room.removeParticipant(participantId);
      socket.to(room.id).emit('participant-disconnect', participantId);

      console.log('Number of participants in room ---> ', room.participants.size);

      // then cleanup the room if necessary.
      if (room.participants.size === 0) {
        room.cleanupResources();
        _rooms.delete(room.id);
      }
    } else {
      console.error(`no room was found for participant with Id: ${participantId}`);
    }
  });

  // for now only returns count of participants. may return an array of participants in the future.
  socket.on('getRoomParticipants', (roomId, callback) => {
    const room = _rooms.get(roomId);
    callback(room.participants.size);
  });

  socket.on('send-transport-connect', async (roomId, dtlsParameters, callback) => {
    const room = _rooms.get(roomId);
    const participant = room.participants.get(participantId);

    try {
      await participant.sendTransport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (e) {
      callback({ success: false, error: e.message });
    }
  });

  socket.on('recv-transport-connect', async (roomId, dtlsParameters, callback) => {
    const room = _rooms.get(roomId);
    const participant = room.participants.get(participantId);

    try {
      await participant.recvTransport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (e) {
      callback({ success: false, error: e.message });
    }
  });

  socket.on('send-transport-produce', async (roomId, parameters, callback) => {
    const room = _rooms.get(roomId);
    const participant = room.participants.get(participantId);
    try {
      if (parameters.kind == 'video') {
        participant.videoProducer = await participant.sendTransport.produce(parameters);
        callback({ id: participant.videoProducer.id });
      } else {
        participant.audioProducer = await participant.sendTransport.produce(parameters);
        callback({ id: participant.audioProducer.id });
      }
    } catch (e) {
      console.error(
        `Error in socket event "send-transport-produce" roomId: ${roomId},  participant: ${participantId}, error:  ${e.stack}`
      );
      callback({ error: e.message });
    }
  });

  socket.on('informRtpCapabilites', (roomId, rtpCapabilities, callback) => {
    const room = _rooms.get(roomId);
    const participant = room.participants.get(participantId);
    participant.rtpCapabilities = rtpCapabilities;

    callback();
  });

  socket.on('participant-ready', async (roomId, callback) => {
    const room = _rooms.get(roomId);
    const participant = room.participants.get(participantId);
    if (!participant) {
      console.error(`socket:${participantId}::event[participant-ready] : no participant found`);
      return;
    }

    participant.ready = true;
    console.log('client ready emmitted by :: ', participantId);
    // socket.to(roomId).emit('participant-ready', participant.serialize());
    const consumers = await createConsumersForParticipant(room, participant);
    callback(
      consumers.map(({ participantId, audioConsumer, videoConsumer }) => ({
        participantId,
        audioConsumer: {
          id: audioConsumer.id,
          kind: audioConsumer.kind,
          producerId: audioConsumer.producerId,
          rtpParameters: audioConsumer.rtpParameters,
        },
        videoConsumer: {
          id: videoConsumer.id,
          kind: videoConsumer.kind,
          producerId: videoConsumer.producerId,
          rtpParameters: videoConsumer.rtpParameters,
        },
      }))
    );
    createConsumersForOtherParticipants(room, participant, socket);
  });

  socket.on('audio-consumer-resume', async (roomId, otherParticipantId, callback) => {
    const participant = getParticipant(roomId, participantId);
    const { audioConsumer } = participant.consumers.get(otherParticipantId);

    await audioConsumer.resume();
    callback();
  });

  socket.on('video-consumer-resume', async (roomId, otherParticipantId, callback) => {
    const participant = getParticipant(roomId, participantId);
    const { videoConsumer } = participant.consumers.get(otherParticipantId);

    await videoConsumer.resume();
    callback();
  });
}

async function createConsumersForParticipant(room, currentParticipant) {
  const otherParticipants = Array.from(room.participants.values()).filter(
    p => p.id !== currentParticipant.id
  );
  const consumers = [];
  const paused = true;
  const rtpCapabilities = currentParticipant.rtpCapabilities;

  for (let participant of otherParticipants) {
    let audioConsumer;
    let videoConsumer;
    const audioProducer = participant.audioProducer;
    const videoProducer = participant.videoProducer;

    if (room.router.canConsume({ producerId: audioProducer.id, rtpCapabilities })) {
      audioConsumer = await currentParticipant.recvTransport.consume({
        producerId: audioProducer.id,
        rtpCapabilities,
        paused,
      });
    }

    if (room.router.canConsume({ producerId: videoProducer.id, rtpCapabilities })) {
      videoConsumer = await currentParticipant.recvTransport.consume({
        producerId: videoProducer.id,
        rtpCapabilities,
        paused,
      });
    }

    consumers.push({
      participantId: participant.id,
      audioConsumer,
      videoConsumer,
    });
  }

  currentParticipant.consumers = new Map(consumers.map(cons => [cons.participantId, cons]));
  return consumers;
}

async function createConsumersForOtherParticipants(room, currentParticipant, participantSocket) {
  const otherParticipants = Array.from(room.participants.values()).filter(
    p => p.id !== currentParticipant.id
  );
  const paused = true;
  const audioProducer = currentParticipant.audioProducer;
  const videoProducer = currentParticipant.videoProducer;

  otherParticipants.forEach(async participant => {
    let audioConsumer;
    let videoConsumer;
    const rtpCapabilities = participant.rtpCapabilities;

    if (room.router.canConsume({ producerId: audioProducer.id, rtpCapabilities })) {
      audioConsumer = await participant.recvTransport.consume({
        producerId: audioProducer.id,
        rtpCapabilities,
        paused,
      });
    }

    if (room.router.canConsume({ producerId: videoProducer.id, rtpCapabilities })) {
      videoConsumer = await participant.recvTransport.consume({
        producerId: videoProducer.id,
        rtpCapabilities,
        paused,
      });
    }

    const newConsumers = {
      participantId: currentParticipant.id,
      audioConsumer,
      videoConsumer,
    };

    participant.consumers.set(currentParticipant.id, newConsumers);

    participantSocket.to(participant.id).emit('new-participant-consumers', {
      participantId: currentParticipant.id,
      audioConsumer: {
        id: audioConsumer.id,
        kind: audioConsumer.kind,
        producerId: audioConsumer.producerId,
        rtpParameters: audioConsumer.rtpParameters,
      },
      videoConsumer: {
        id: videoConsumer.id,
        kind: videoConsumer.kind,
        producerId: videoConsumer.producerId,
        rtpParameters: videoConsumer.rtpParameters,
      },
    });
  });
}

async function createOrJoinRoom(roomId, participantId) {
  if (_rooms.has(roomId)) {
    // room already exists, add participant to the room
    const room = _rooms.get(roomId);
    const participant = await room.addNewParticipant(participantId);
    return [room, participant];
  } else {
    // room doesnt exist. create a new room, with a new participant in it.
    const router = await createNewRouter();
    const room = new Room({
      router,
      roomId,
    });

    const participant = await room.addNewParticipant(participantId);
    // save the room for later reference
    _rooms.set(roomId, room);
    return [room, participant];
  }
}

function getParticipant(roomId, participantId) {
  const room = _rooms.get(roomId);
  if (room) {
    const participant = room.participants.get(participantId);
    return participant;
  }

  return null;
}

class Room {
  constructor({ router, roomId }) {
    this.id = roomId;
    this.router = router;
    this.participants = new Map();
  }

  async addNewParticipant(participantId) {
    // create the transports that the participant will need
    const [sendTransport, recvTransport] = await createNewTransports(this.router);
    // create participant object
    const participant = new Participant({
      participantId,
      sendTransport,
      recvTransport,
    });
    // add to list of participants.
    this.participants.set(participantId, participant);

    return participant;
  }

  async removeParticipant(participantId) {
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.cleanupResources();
      this.cleanUpParticipantConsumers(participant);
      this.participants.delete(participantId);
    }
  }

  /**
   * cleans up all the consumers for this participant, that other participants have created
   * @param {*} participant participant for whose consumers we will be closing in other participants.
   */
  cleanUpParticipantConsumers(participant) {
    const otherParticipants = Array.from(this.participants.values()).filter(
      p => p.id !== participant.id
    );
    otherParticipants.forEach(otherParticipant =>
      otherParticipant.cleanUpParticipantConsumers(participant.id)
    );
  }

  async cleanupResources() {
    this.router.close();
  }
}

class Participant {
  constructor({ participantId, sendTransport, recvTransport }) {
    this.id = participantId;
    this.timeJoined = new Date().getTime();
    this.ready = false;
    this.rtpCapabilities = null;
    this.sendTransport = sendTransport;
    this.recvTransport = recvTransport;
    this.audioProducer;
    this.videoProducer;
    this.consumers = new Map();
  }

  cleanupResources() {
    this.sendTransport.close();
    this.recvTransport.close();

    if (this.audioProducer) this.audioProducer.close();
    if (this.videoProducer) this.audioProducer.close();

    const participantIds = Array.from(this.consumers.keys());
    for (let participantId of participantIds) {
      this.cleanUpParticipantConsumers(participantId);
    }
  }

  cleanUpParticipantConsumers(participantId) {
    const participantConsumers = this.consumers.get(participantId);
    if (participantConsumers) {
      const { audioConsumer, videoConsumer, participantId } = participantConsumers;
      if (videoConsumer) videoConsumer.close();
      if (audioConsumer) audioConsumer.close();

      this.consumers.delete(participantId);
    }
  }

  serialize() {
    return {
      id: this.id,
      timeJoined: this.timeJoined,
      isReady: this.ready,
      producers: {
        video: this.videoProducer ? this.videoProducer.id : null,
        audio: this.audioProducer ? this.audioProducer.id : null,
      },
    };
  }
}

module.exports = startSocketServer;
