/**
 * Middleware service for handling user balance.
 * Update balances for accounts, which addresses were specified
 * in received transactions from blockParser via amqp
 *
 * @module Chronobank/waves-balance-processor
 * @requires config
 * @requires models/accountModel
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const config = require('./config'),
  mongoose = require('mongoose'),
  _ = require('lodash'),
  Promise = require('bluebird');

mongoose.Promise = Promise;
mongoose.accounts = mongoose.createConnection(config.mongo.accounts.uri, {useMongoClient: true});


const accountModel = require('./models/accountModel'),
  UserCreatedService = require('./services/UserCreatedService'),
  updateBalance = require('./utils/updateBalance'),
  bunyan = require('bunyan'),
  log = bunyan.createLogger({name: 'core.balanceProcessor'}),
  amqp = require('amqplib');


/**
 * @param {Object of TxModel} tx
 * @param {Object of RabbitMqChannel} channel
 */
const processTx = async (tx, channel) => {
  log.info('in balance', tx.id);
  const txAccounts = _.filter([tx.sender, tx.recipient], item => item !== undefined);        
  let accounts = tx ? await accountModel.find({address: {$in: txAccounts}}) : [];
  for (let account of accounts) {
    if (!tx.assetId)
      account = await updateBalance(account.address);
    else 
      account = await updateBalance(account.address, tx.assetId);

    await  channel.publish('events', 
      `${config.rabbit.serviceName}_balance.${account.address}`, 
      new Buffer(JSON.stringify(
        _.chain(account)
          .pick(['address', 'balance', 'assets'])
          .merge({tx: tx.hash})
          .value()
      ))
    );
  }
};


mongoose.accounts.on('disconnected', function () {
  log.error('mongo disconnected!');
  process.exit(0);
});


let init = async () => {
  let conn = await amqp.connect(config.rabbit.url)
    .catch(() => {
      log.error('rabbitmq is not available!');
      process.exit(0);
    });

  let channel = await conn.createChannel();

  channel.on('close', () => {
    log.error('rabbitmq process has finished!');
    process.exit(0);
  });

  const userCreatedService = new UserCreatedService(channel, config.rabbit.serviceName);
  await userCreatedService.start();

  await channel.assertExchange('events', 'topic', {durable: false});
  await channel.assertQueue(`app_${config.rabbit.serviceName}.balance_processor`);
  await channel.bindQueue(`app_${config.rabbit.serviceName}.balance_processor`, 'events', `${config.rabbit.serviceName}_transaction.*`);

  channel.prefetch(2);
  channel.consume(`app_${config.rabbit.serviceName}.balance_processor`, async (data) => {
    try {
      let tx = JSON.parse(data.content.toString());
      log.info('balance', tx.hash);
      if (tx.blockNumber !== -1) 
        await processTx(tx, channel);
    } catch (e) {
      log.error(e);
    }

    channel.ack(data);
  });
};

module.exports = init();
