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

  socket.on('joinRoom', async (roomId, callback) => {
    console.log('user wants to connect with specific room --> ', roomId);
    // join room so that we can communicate with other people in the room.
    try {
      await new Promise(r => socket.join(roomId, r));
      await createOrJoinRoom(roomId, socket.id);
      callback({ success: true });
    } catch (e) {
      callback({ success: false, error: e.message });
    }
  });

  socket.on('getRouterRtpCapabilites', (roomId, callback) => {
    const room = _rooms.get(roomId);
    if (!room) {
      callback({ error: 'no room with that Id was found' });
      return;
    } else {
      callback(room.router.rtpCapabilities);
    }
  });

  socket.on('getTransports', (roomId, callback) => {
    const room = _rooms.get(roomId);
    const participant = room.participants.get(socket.id);
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

  //other listeners
}

async function createOrJoinRoom(roomId, participantId) {
  if (_rooms.has(roomId)) {
    // room already exists, add participant to the room
    const room = _rooms.get(roomId);
    await room.addNewParticipant(participantId);
    return room;
  } else {
    // room doesnt exist. create a new room, with a new participant in it.
    const router = await createNewRouter();
    const room = new Room({
      router,
      roomId,
    });

    await room.addNewParticipant(participantId);
    // save the room for later reference
    _rooms.set(roomId, room);
    return room;
  }
}

class Room {
  constructor({ router, roomId }) {
    this.id = roomId;
    this.router = router;
    this.participants = new Map();
  }

  async addNewParticipant(participantId) {
    // create the transports that the participant will need
    const [sendTransport, recvTransport] = await createNewTransports(
      this.router,
    );
    // create participant object
    const participant = new Participant({
      participantId,
      sendTransport,
      recvTransport,
    });
    // add to list of participants.
    this.participants.set(participantId, participant);
  }
}

class Participant {
  constructor({ participantId, sendTransport, recvTransport }) {
    this.id = participantId;
    this.sendTransport = sendTransport;
    this.recvTransport = recvTransport;
    this.audioProducer;
    this.videoProducer;
    this.consumers = [];
  }
}

module.exports = startSocketServer;
