/**
 * Chronobank/eth-balance-processor configuration
 * @module config
 * @returns {Object} Configuration
 */

require('dotenv').config();

const config = {
  mongo: {
    accounts: {
      uri: process.env.MONGO_ACCOUNTS_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/data',
      collectionPrefix: process.env.MONGO_ACCOUNTS_COLLECTION_PREFIX || process.env.MONGO_COLLECTION_PREFIX || 'waves'
    },
    data: {
      uri: process.env.MONGO_DATA_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/data',
      collectionPrefix: process.env.MONGO_DATA_COLLECTION_PREFIX || process.env.MONGO_COLLECTION_PREFIX || 'waves'
    }
  },	
  rabbit: {
    url: process.env.RABBIT_URI || 'amqp://localhost:5672',
    serviceName: process.env.RABBIT_SERVICE_NAME || 'app_waves'
  },
  node: {
    rpc: process.env.RPC || 'http://localhost:6869',
    network: process.env.NETWORK || 'testnet',
    blockGenerationTime: process.env.BLOCK_GENERATION_TIME || 60
  }
};

module.exports = config;