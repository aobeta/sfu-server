const socketIO = require('socket.io');

const _rooms = [];

function startSocketServer(webServer) {
  socketServer = new socketIO(webServer, {
    log: true,
    serveClient: false,
  });

  socketServer.on('connection', handleClientConnect);
}

function handleClientConnect(socket) {
  console.log('new client connected: ', socket.id);
  socket.on('joinRoom', room => {
    socket.join(room);
  });
}

module.exports = startSocketServer;
