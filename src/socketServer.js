const socketIO = require('socket.io');
const { createNewRouter } = require('./SfuWorker');

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
}

async function createOrJoinRoom(roomId, participantId) {
  if (_rooms.has(roomId)) {
    // room already exists, add participant to the room
    const room = _rooms.get(roomId);
    room.participants.push(new Participant({ participantId }));
    return room;
  } else {
    // room doesnt exist. create a new room, with a new participant in it.
    const router = await createNewRouter();
    const room = new Room({
      router,
      roomId,
      initialParticipantId: participantId,
    });
    // save the room for later reference
    _rooms.set(roomId, room);
    return room;
  }
}

class Room {
  constructor({ router, roomId, initialParticipantId }) {
    this.id = roomId;
    this.router = router;
    this.participants = [
      new Participant({ participantId: initialParticipantId }),
    ];
  }
}

class Participant {
  constructor({ participantId }) {
    this.id = participantId;
    this.transports = [];
    this.producers = [];
    this.consumers = [];
  }
}

module.exports = startSocketServer;
