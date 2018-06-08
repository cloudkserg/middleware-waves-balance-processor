/**
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */
const nodeRequests = require('../../services/nodeRequests'),
  request = require('request-promise'),
  config = require('../config'),
  _ = require('lodash'),
  {URL} = require('url'),
  bunyan = require('bunyan'),
  Promise = require('bluebird'),
  log = bunyan.createLogger({
    name: 'wavesBlockprocessor.nodeSenderService'
  });


const privatePost = (query, body, apiKey) => makeRequest(query, 'POST', body, {
  'X-API-Key': apiKey
});

const get = query => makeRequest(query, 'GET');

const makeRequest = (path, method, body, headers = {}) => {
  const options = {
    method,
    body,
    uri: new URL(path, config.node.rpc),
    json: true,
    headers
  };
  return request(options).catch(async (e) => await errorHandler(e));
};

const errorHandler = async (err) => {
  if (err.name && err.name === 'StatusCodeError')
    await Promise.delay(10000);
  log.error(err);
};

const getTransaction = async (id) => {
  const result = await get(`/transactions/info/${id}`);
  return result;
};

/**
 * 
 * @param {String} apiKey 
 * @param {String} toAddress 
 * @param {Number} amount 
 * @param {String} fromAddress 
 * @return {Promise return Object}
 */
const signTransaction = async (apiKey, toAddress, amount, fromAddress) => {
  return await privatePost('transactions/sign', {
    type: 4,
    sender: fromAddress,
    recipient: toAddress,

    amount: amount,
    fee: 100000,
    attachment: 'string'
  }, apiKey);
};

/**
 * 
 * @param {String} apiKey 
 * @param {String} toAddress 
 * @param {Number} amount 
 * @param {String} fromAddress 
 * @param {String} assetId
 * @return {Promise return Object}
 */
const signAssetTransaction = async (apiKey, toAddress, amount, fromAddress, assetId) => {
  return await privatePost('assets/transfer', {
    assetId,
    sender: fromAddress,
    recipient: toAddress,

    amount: amount,
    fee: 100000,
    attachment: 'string'
  }, apiKey);
};

/**
 * 
 */
const signIssueTransaction = async (apiKey, name, description, sender, fee, decimals, quantity, reissuable) => {
  let tx = {
    name,
    description,
    sender,
    fee,
    decimals,
    quantity,
    reissuable,
    timestamp: Date.now()
  };
  return await privatePost('assets/issue', tx, apiKey);
};

/**
 * 
 * @param {String} apiKey 
 * @param {Object} tx
 * @return {Promise return Object}
 */
const sendIssueTransaction = async (apiKey, tx) => {
  return await privatePost('assets/broadcast/issue', tx, apiKey);
};

/**
 * only for test
 * @param {String} apiKey 
 * @param {Object} tx 
 * @return {Promise}
 */
const sendTransaction = async (apiKey, tx) => {
  return await privatePost('transactions/broadcast', tx, apiKey);
};

/**
 * only for test
 * @param {String} apiKey
 * @param {Object} tx
 * @return {Promise}
 */
const sendAssetTransaction = async (apiKey, tx) => {
  return await privatePost('assets/broadcast/transfer', tx, apiKey);
};

/**
 * 
 * @param {String} apiKey 
 * @param {String} sender 
 * @param {Number} fee 
 * @param {String} alias
 * @return {Promise return Object tx} 
 */
const signAliasTransaction = async (apiKey, sender, fee, alias) => {
  const tx = {
    sender, fee, alias
  };
  return await privatePost('alias/create', tx, apiKey);
};

/**
 * 
 * @param {String} apiKey 
 * @param {Object} tx
 * @return {Promise return Object tx} 
 */
const sendAliasTransaction = async (apiKey, tx) => {
  return await privatePost('alias/broadcast/create', tx, apiKey);
};




module.exports = _.merge(nodeRequests, {
  //for tests only
  signTransaction,
  sendTransaction,
  signAssetTransaction,
  signIssueTransaction,
  sendIssueTransaction,
  sendAssetTransaction,

  signAliasTransaction,
  sendAliasTransaction,
  getTransaction
});
