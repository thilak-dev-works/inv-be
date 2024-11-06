const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');
let server;
const uri = 'mongodb+srv://thilaksubramani17:kNmNuGsQ9OfvisQ7@thilak17.boal2.mongodb.net/?authSource=admin&replicaSet=atlas-gvvwy9-shard-0&retryWrites=true&w=majority&appName=thilak17%2Fbestingems';

// Only start the server if running locally
if (process.env.NODE_ENV !== 'production') {
  mongoose.connect(uri, config.mongoose.options).then(() => {
    logger.info('Connected to MongoDB');
    server = app.listen(8000, () => {
      logger.info('Listening to port 8000');
    });
  });
}

// Export the app for Vercel
module.exports = app;

// Graceful shutdown handlers
const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};
const unexpectedErrorHandler = error => {
  logger.error(error);
  exitHandler();
};
process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);
process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
});