require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { router: apiRouter } = require('./routes/api');
const { initScheduler } = require('./services/scheduler');

const PORT = process.env.PORT || 3020;
const app = express();

const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    origin: [clientOrigin, /^http:\/\/127\.0\.0\.1:\d+$/],
    credentials: true
  })
);
app.use(express.json({ limit: '2mb' }));

app.use('/api', apiRouter);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
const fs = require('fs');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Doc Controller API http://0.0.0.0:${PORT}`);
  try {
    initScheduler();
  } catch (e) {
    console.error('Scheduler init failed', e);
  }
});

module.exports = app;
