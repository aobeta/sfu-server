module.exports = function socketRequest(socket) {
  return function() {
    const args = Array.from(arguments);
    return new Promise(resolve => socket.emit(...args, resolve));
  };
};
