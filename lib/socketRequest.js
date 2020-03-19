module.exports = function socketRequest(socket) {
  return function(event, args) {
    return new Promise(resolve => socket.emit(event, args, resolve));
  };
};
