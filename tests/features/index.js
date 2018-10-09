/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

require('dotenv/config');

const models = require('../../models'),
  config = require('../../config'),
  _ = require('lodash'),
  providerService = require('../../services/providerService'),
  waitTransaction = require('../utils/waitTransaction'),
  sender = require('../utils/sender'),
  spawn = require('child_process').spawn,
  expect = require('chai').expect,
  Promise = require('bluebird');

module.exports = (ctx) => {

  before (async () => {
    await models.accountModel.remove({});

    await ctx.amqp.channel.deleteQueue(`${config.rabbit.serviceName}.balance_processor`);
    ctx.balanceProcessorPid = spawn('node', ['index.js'], {env: process.env, stdio: 'inherit'});
    await Promise.delay(10000);

    await models.accountModel.create({
      address: ctx.accounts[0],
      balance: 0,
      isActive: true
    });
    await models.accountModel.create({
      address: ctx.accounts[1],
      balance: 0,
      isActive: true
    });

  });


   it('validate balance change on tx arrive', async () => {
     const instance = await providerService.get();


     let tx;
     let balance0;
     let balance1;
     await Promise.all([
       (async () => {
         tx = await waitTransaction(sender.sendTransaction.bind(sender, ctx.accounts[0], ctx.accounts[1], 10));
         balance0 = (await instance.getBalanceByAddress(ctx.accounts[0]));
         balance1 = (await instance.getBalanceByAddress(ctx.accounts[1]));
         await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${ctx.accounts[0]}`, new Buffer(JSON.stringify(tx)));
         await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${ctx.accounts[1]}`, new Buffer(JSON.stringify(tx)));
       })(),
       (async () => {
         await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`, {autoDelete: true, durable: false});
         await ctx.amqp.channel.bindQueue(
           `app_${config.rabbit.serviceName}_test_features.balance`, 'events', 
           `${config.rabbit.serviceName}_balance.${ctx.accounts[1]}`);
         await new Promise(res =>
           ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, 
             async data => {

               if (!data || !tx)
                 return;
               const message = JSON.parse(data.content.toString());

               expect(tx.id).to.equal(message.tx.id);
               expect(message.balance).to.eq(balance1.toString());
               expect(message.address).to.eq(ctx.accounts[1]);
               await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
               res();
             }, {noAck: true})
         );

       })(),
       (async () => {
         await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features2.balance`, {autoDelete: true, durable: false});
         await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features2.balance`,
           'events', `${config.rabbit.serviceName}_balance.${ctx.accounts[0]}`);
         await new Promise(res =>
           ctx.amqp.channel.consume(
             `app_${config.rabbit.serviceName}_test_features2.balance`,
             async data => {

               if (!data || !tx)
                 return;

               const message = JSON.parse(data.content.toString());

               expect(message.balance).to.eq(balance0.toString());
               expect(message.address).to.eq(ctx.accounts[0]);
               expect(_.isEqual(JSON.parse(JSON.stringify(tx)), message.tx)).to.equal(true);
               await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features2.balance`);
               res();
             }, {noAck: true})
         );

       })()
     ]);
   });


   it('validate balance on user registration', async () => {

     await models.accountModel.update({address: ctx.accounts[0]}, {
       $set: {
         balance: 0
       }
     });

     const instance = await providerService.get();
     let balance = await instance.getBalanceByAddress(ctx.accounts[0]);


     await Promise.all([
       (async () => {
         await Promise.delay(3000);
         await ctx.amqp.channel.publish('internal', `${config.rabbit.serviceName}_user.created`, new Buffer(JSON.stringify({address: ctx.accounts[0]})));
       })(),
       (async () => {
         await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`, {autoDelete: true, durable: false});
         await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${ctx.accounts[0]}`);
         await new Promise(res =>
           ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

             if (!data)
               return;

             const message = JSON.parse(data.content.toString());

             expect(message.balance).to.eq(balance.toString());
             expect(message.address).to.eq(ctx.accounts[0]);
             expect(message.tx).to.undefined;

             await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
             res();
           }, {noAck: true})
         );

       })()
     ]);
   });


  after (() => {
    ctx.balanceProcessorPid.kill();
  });



};
