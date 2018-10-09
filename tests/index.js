/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

require('dotenv/config');
process.env.LOG_LEVEL = 'error';

const config = require('./config'),
  models = require('../models'),
  fuzzTests = require('./fuzz'),
  providerService = require('../services/providerService'),
  performanceTests = require('./performance'),
  featuresTests = require('./features'),
  blockTests = require('./blocks'),
  Promise = require('bluebird'),
  mongoose = require('mongoose'),
  amqp = require('amqplib'),
  spawn = require('child_process').spawn,
  ctx = {};

mongoose.Promise = Promise;
mongoose.connect(config.mongo.accounts.uri, {useMongoClient: true});


describe('core/balanceProcessor', function () {

  before(async () => {
    models.init();
    ctx.accounts = config.dev.accounts;
    ctx.amqp = {};
    ctx.amqp.instance = await amqp.connect(config.rabbit.url);
    ctx.amqp.channel = await ctx.amqp.instance.createChannel();
    await ctx.amqp.channel.assertExchange('events', 'topic', {durable: false});
    await ctx.amqp.channel.assertExchange('internal', 'topic', {durable: false});
    await ctx.amqp.channel.assertQueue(`${config.rabbit.serviceName}_current_provider.get`, 
      {durable: false});
    await ctx.amqp.channel.bindQueue(`${config.rabbit.serviceName}_current_provider.get`, 
      'internal', `${config.rabbit.serviceName}_current_provider.get`);

    ctx.amqp.channel.consume(`${config.rabbit.serviceName}_current_provider.get`, 
      async () => {
        ctx.amqp.channel.publish('internal', 
          `${config.rabbit.serviceName}_current_provider.set`, 
          new Buffer(JSON.stringify({index: 0})))
        ;
      }, {noAck: true});



    await providerService.setRabbitmqChannel(ctx.amqp.channel, config.rabbit.serviceName);

    ctx.checkerPid = spawn('node', ['tests/utils/proxyChecker.js'], {
      env: process.env, stdio: 'inherit'
    });
    await Promise.delay(5000);
  });

  after (async () => {
    mongoose.disconnect();
    await ctx.amqp.instance.close();
    await ctx.checkerPid.kill();
  });



  describe('block', () => blockTests(ctx));
  describe('features', () => featuresTests(ctx));
  describe('fuzz', () => fuzzTests(ctx));
  describe('performance', () => performanceTests(ctx));
});
