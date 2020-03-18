const express = require('express');
const path = require('path');

function startExpressApp({ webRoot }) {
  const expressApp = express();
  expressApp.use(express.json()); // may not need this. but just in case
  expressApp.use(express.static(webRoot));

  expressApp.get('*', (req, res) => {
    // this is an SPA so just return the index html file for any paths that are not handled by
    // express.static middleware.
    res.sendFile(path.join(webRoot, 'index.html'));
  });

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
