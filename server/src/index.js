require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const { PORT, CLIENT_URL, NODE_ENV } = require('./config/env');
const { connectDB } = require('./config/db');
const { initSocket } = require('./config/socket');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const executionRoutes = require('./routes/executionRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const { init: initQueue } = require('./queues/executionQueue');
const { recoverStaleRunningExecutions } = require('./services/executionStatusService');

const app = express();
const server = http.createServer(app);

initSocket(server);

app.use(helmet());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(compression());
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

async function start() {
  await connectDB();
  await recoverStaleRunningExecutions({ emit: false });
  await initQueue();
  server.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT} (${NODE_ENV})`);
  });
}

start().catch((err) => {
  console.error('[Server] Startup failed:', err);
  process.exit(1);
});
