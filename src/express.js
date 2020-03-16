const express = require('express');
const path = require('path');

function startExpressApp() {
  const expressApp = express();
  expressApp.use(express.json()); // may not need this. but just in case
  expressApp.use(express.static(path.join(__dirname, 'dist')));

  expressApp.get('/test', (req, res) => res.send('hello from sfu-server'));

  // add request error handling to the end of the pipeline in case there is some error
  expressApp.use((error, req, res, next) => {
    if (error) {
      console.warn('Express app error,', error.message);

      error.status = error.status || (error.name === 'TypeError' ? 400 : 500);

      res.statusMessage = error.message;
      res.status(error.status).send(String(error));
    } else {
      next();
    }
  });

  return expressApp;
}

module.exports = {
  startExpressApp,
};
