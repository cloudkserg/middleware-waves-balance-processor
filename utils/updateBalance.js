/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */
const requests = require('../services/nodeRequests'),
  accountModel = require('../models/accountModel'),
  bunyan = require('bunyan'),
  log = bunyan.createLogger({name: 'utils.updateBalance'});
	
module.exports = async (address, assetId, updateAllAssets = false) => {
  const balance = await requests.getBalanceByAddress(address),
    fields = {balance};

  if (assetId)
    fields['assets'] = {
      [`${assetId}`]: await requests.getBalanceByAddressAndAsset(address, assetId)
    };
	
  if (updateAllAssets)
    fields['assets'] = await requests.getAllAssetBalanceByAddress(address);

  return await accountModel.findOneAndUpdate(
    {address: address}, 
    {$set: fields}, 
    {upsert: true, new: true}
  ).catch(log.error);
};
