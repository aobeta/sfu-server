const socket = require('socket.io-client');
const $ = require('../lib/element');

const _connectBtn = $('#btn_connect');
const _connectMsg = $('#connection_status');

let _socket;

_connectBtn.addEventListener('click', connect);

function connect() {
  _socket = socket({ autoConnect: true });

  _socket.on('connect', () => console.log('connected to SOCKET.IO server'));
}
