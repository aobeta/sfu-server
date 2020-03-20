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
      console.log('socket rooms joined after join() :', socket.rooms);
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
    console.info(`client with id ${participantId} has disconnected. reason: ${reason}`);
    const room = Array.from(_rooms.values()).find(room => room.participants.has(participantId));
    if (room) {
      // first cleanup the participant
      const participant = room.participants.get(participantId);
      participant.cleanupResources();
      room.participants.delete(participant.id);

      // then cleanup the room if necessary.
      if (room.participants.size === 0) {
        room.cleanupResources();
        _rooms.delete(room.id);
        console.info('rooms left :: ', _rooms.size);
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

  socket.on('participant-ready', (roomId, callback) => {
    const participant = getParticipant(roomId, participantId);
    if (!participant) {
      console.error(`socket:${participantId}::event[participant-ready] : no participant found`);
      return;
    }

    participant.ready = true;
    console.log('client ready emmitted by :: ', participantId);
    socket.to(roomId).emit('participant-ready', participant.serialize());
    callback();
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
      this.participants.delete(participantId);
    }
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
    this.sendTransport = sendTransport;
    this.recvTransport = recvTransport;
    this.audioProducer;
    this.videoProducer;
    this.consumers = [];
  }

  cleanupResources() {
    this.sendTransport.close();
    this.recvTransport.close();

    if (this.audioProducer) this.audioProducer.close();
    if (this.videoProducer) this.audioProducer.close();

    //TODO handle cleanup of consumers
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
