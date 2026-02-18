const mongoose = require('mongoose');

const CONFIG = {
  // Connection pool settings
  MAX_POOL_SIZE: 10,
  MIN_POOL_SIZE: 2,
  SOCKET_TIMEOUT: 45000,
  SERVER_SELECTION_TIMEOUT: 5000
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/astrashield', {
      maxPoolSize: CONFIG.MAX_POOL_SIZE,
      minPoolSize: CONFIG.MIN_POOL_SIZE,
      socketTimeoutMS: CONFIG.SOCKET_TIMEOUT,
      serverSelectionTimeoutMS: CONFIG.SERVER_SELECTION_TIMEOUT,
      // Retry writes for improved resilience
      retryWrites: true,
      retryReads: true
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Connection pool: max=${CONFIG.MAX_POOL_SIZE}, min=${CONFIG.MIN_POOL_SIZE}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err.message);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected, attempting to reconnect...');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });
    
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    // Don't exit in development - allow retry
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
