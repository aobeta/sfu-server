const sockets = [];

async function startSocketServer() {
  socketServer = new socketIOServer(webServer, {
    log: true,
    serveClient: true,
    path: '/socket',
  });

  socketIOServer.on('connection');
}

function handleClientConnect(socket) {
  socket.on('joinRoom', room => {
    socket.join(room);
  });
}
