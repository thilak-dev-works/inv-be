/* eslint-disable no-console */
const mongoose = require('mongoose');
const app = require('./app');
const config = require('./config/config');
const logger = require('./config/logger');

let isConnected; // Track MongoDB connection

async function connectToDatabase() {
  if (isConnected) {
    return;
  }
  await mongoose.connect(process.env.MONGODB_URI, config.mongoose.options);
  isConnected = mongoose.connection.readyState === 1; // Set to true if connected
  console.log('Connected to MongoDB');
}

// Middleware to ensure MongoDB connection is established
app.use(async (req, res, next) => {
  await connectToDatabase();
  next();
});

module.exports = app;
