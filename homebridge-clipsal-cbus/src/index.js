'use strict';

const CBusPlatform = require('./platform');

const PLUGIN_NAME = 'homebridge-clipsal-cbus';
const PLATFORM_NAME = 'ClipsalCBus';

module.exports = (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, CBusPlatform);
};
