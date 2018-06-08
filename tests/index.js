/**
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */
const config = require('./config'),
  Promise = require('bluebird'),
  mongoose = require('mongoose');

mongoose.Promise = Promise;
mongoose.accounts = mongoose.createConnection(config.mongo.accounts.uri);
mongoose.connect(config.mongo.data.uri, {useMongoClient: true});

const expect = require('chai').expect,
  accountModel = require('../models/accountModel'),
  amqp = require('amqplib'),
  WebSocket = require('ws'),
  saveAccountForAddress = require('./helpers/saveAccountForAddress'),
  connectToQueue = require('./helpers/connectToQueue'),
  clearQueues = require('./helpers/clearQueues'),
  consumeMessages = require('./helpers/consumeMessages'),
  consumeStompMessages = require('./helpers/consumeStompMessages'),
  requests = require('./services/nodeRequests'),
  Stomp = require('webstomp-client'),
  BigNumber = require('bignumber.js'),
  ASSET_NAME = 'LLLLLLLLLLL',
  createIssue = require('./helpers/createIssue'),
  signPrivateTransaction = require('./services/signPrivateTransaction');
  

let accounts, amqpInstance, assetId;

describe('core/balance processor', function () {

  before(async () => {
    await accountModel.remove();
    amqpInstance = await amqp.connect(config.rabbit.url);

    accounts = config.dev.accounts;
    await saveAccountForAddress(accounts[0]);
    await clearQueues(amqpInstance);
    
  });

  after(async () => {
    return mongoose.disconnect();
  });

  afterEach(async () => {
    await clearQueues(amqpInstance);
  });

  it('send message about new account and check this balance', async () => {
    const channel = await amqpInstance.createChannel(); 
    await channel.assertExchange('internal', 'topic', {durable: false});
    await channel.publish('internal', `${config.rabbit.serviceName}_user.created`, 
      new Buffer(JSON.stringify({
        address: accounts[0]
      }))
    );
   await Promise.delay(4000);
    const account = await accountModel.findOne({address: accounts[0]});
    expect(account.balance.toNumber()).to.be.greaterThan(0);
  });

  it('create assetId', async () => {
    assetId = await createIssue(ASSET_NAME, accounts[0]);
  });

  it('send 100 waves from account0 to account1 and validate message', async () => {
    const initBalance = new BigNumber(await requests.getBalanceByAddress(accounts[0]));

    const checkMessage = (content) => {
      expect(content).to.contain.all.keys(
        'address',
        'balance',
        'assets',
        'tx'
      );
      expect(content.address).to.equal(accounts[0]);
      expect(initBalance.minus(new BigNumber(content.balance)).toNumber()).to.not.equal(0);
      return true;
    };

     let tx = await requests.signTransaction(
       config.dev.apiKey, accounts[1], 100, accounts[0]);
    return await Promise.all([
      (async () => {
        await requests.sendTransaction(config.dev.apiKey, tx);
      })(),
      (async () => {
        const channel = await amqpInstance.createChannel();  
        await connectToQueue(channel);
        return await consumeMessages(1, channel, async (message) => {
          const content = JSON.parse(message.content);
          const newTx = await requests.getTransaction(tx.id);        
          if (content.tx === newTx.signature)
            return checkMessage(content);
          return false;
        });
      })(),
      (async () => {
        const ws = new WebSocket('ws://localhost:15674/ws');
        const client = Stomp.over(ws, {heartbeat: false, debug: false});
        return await consumeStompMessages(1, client, async (message) => {
          const content = JSON.parse(message.body);
          const newTx = await requests.getTransaction(tx.id);
          if (content.tx === newTx.signature)
            return checkMessage(content);
          return false;
        });
      })()
    ]);
  });

/*
  it('send 100 waves from account1 to account0 and validate message', async () => {
    const initBalance = new BigNumber(await requests.getBalanceByAddress(accounts[0]));

    const checkMessage = (content) => {
      expect(content).to.contain.all.keys(
        'address',
        'balance',
        'assets',
        'tx'
      );
      expect(content.address).to.equal(accounts[0]);
      expect(new BigNumber(content.balance).minus(initBalance).toNumber()).to.greaterThan(100);
      return true;
    };

    let tx;

    return await Promise.all([
      (async () => {
        tx = signPrivateTransaction(config.dev.privateKeys[1], {
          senderPublicKey: config.dev.publicKeys[1],
          recipient: accounts[0],
          fee: 100000,
          amount: 100,
          type: 4,
          timestamp: Date.now()
        });
        tx = await requests.sendTransaction(config.dev.apiKey, tx);
        
      })(),
      (async () => {
        const channel = await amqpInstance.createChannel();  
        await connectToQueue(channel);
        return await consumeMessages(1, channel, async (message) => {
          const content = JSON.parse(message.content);
          const newTx = await requests.getTransaction(tx.id);
          
          if (content.tx === newTx.signature) {
            return checkMessage(content);
          }
          return false;
        });
      })()
    ]);
  });


  it('send 100 assets from account0 to account 1 and validate message', async () => {
    const initAssetBalance = new BigNumber(await requests.getBalanceByAddressAndAsset(accounts[0], assetId));
    const initBalance = new BigNumber(await requests.getBalanceByAddress(accounts[0]));
    
    const checkMessage = (content) => {        
      expect(content).to.contain.all.keys(
        'address',
        'balance',
        'assets',
        'tx'
      );
      expect(content.address).to.equal(accounts[0]);
      expect(initBalance.minus(content.balance).toNumber()).to.not.equal(0);
      expect(initAssetBalance.minus(content.assets[assetId]).toNumber()).to.equal(100);
      return true;
    };

    const tx = await requests.signAssetTransaction(config.dev.apiKey, accounts[1], 100, accounts[0], assetId);
    

    return await Promise.all([
      (async () => {
        await requests.sendAssetTransaction(config.dev.apiKey, tx);
      })(),
      (async () => {
        const channel = await amqpInstance.createChannel();  
        await connectToQueue(channel);
        return await consumeMessages(1, channel, async (message) => {
          const content = JSON.parse(message.content);
          const newTx = await requests.getTransaction(tx.id);          
          if (content.tx === newTx.signature)
            return checkMessage(content);
          return false;
        });
      })()
    ]);
  });


  it('send alias transaction and validate message', async () => {
    const initBalance = new BigNumber(await requests.getBalanceByAddress(accounts[0]));
    const checkMessage = (content) => {        
      expect(content).to.contain.all.keys(
        'address',
        'balance',
        'assets',
        'tx'
      );
      expect(content.address).to.equal(accounts[0]);
      expect(initBalance.minus(content.balance).toNumber()).to.greaterThan(0);
      return true;
    };

    const alias = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const tx = await requests.signAliasTransaction(config.dev.apiKey, accounts[0], 100000, alias);

    return await Promise.all([
      (async () => {
        await requests.sendAliasTransaction(config.dev.apiKey, tx);
      })(),
      (async () => {
        const channel = await amqpInstance.createChannel();  
        await connectToQueue(channel);
        return await consumeMessages(1, channel, async (message) => {
          const content = JSON.parse(message.content);
          const newTx = await requests.getTransaction(tx.id);          
          if (content.tx === newTx.signature)
            return checkMessage(content);
          return false;
        });
      })()
    ]);
  });

  it('delete accounts and 0 messages', async () => {
    await accountModel.remove();
    
    const transferTx = await requests.signTransaction(
      config.dev.apiKey, accounts[1], 100, accounts[0]);

    return await Promise.all([
      (async () => {
        await requests.sendTransaction(config.dev.apiKey, transferTx);
      })(),
      (async () => {
        await Promise.delay(12000);
        const channel = await amqpInstance.createChannel();  
        const queue = await connectToQueue(channel);
        expect(queue.messageCount).to.equal(0);
      })()
    ]);
  });
*/
});
