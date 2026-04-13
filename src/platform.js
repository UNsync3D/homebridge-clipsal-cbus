'use strict';

const CBusClient      = require('./cbus-client');
const LightAccessory  = require('./accessory-light');
const FanAccessory    = require('./accessory-fan');
const BlindAccessory  = require('./accessory-blind');
const SceneAccessory  = require('./accessory-scene');
const AirconAccessory = require('./accessory-aircon');
const MotionAccessory = require('./accessory-motion');
const SmokeAccessory  = require('./accessory-smoke');

const PLUGIN_NAME   = 'homebridge-clipsal-cbus';
const PLATFORM_NAME = 'ClipsalCBus';

class CBusPlatform {
  constructor(log, config, api) {
    this.log               = log;
    this.config            = config;
    this.api               = api;
    this.cachedAccessories = new Map();
    this._registeredAccessories = [];

    if (!config) {
      log.warn('ClipsalCBus: No config found.');
      return;
    }

    this.client = new CBusClient(
      config.host,
      config.port    || 8087,
      config.network || 170,
      log
    );

    log.info(`ClipsalCBus: Using Clipsal unit at ${config.host} via TCP port 10001`);

    this.api.on('didFinishLaunching', () => {
      this._discoverDevices();
    });
  }

  configureAccessory(accessory) {
    this.log.debug(`ClipsalCBus: Restoring cached accessory: ${accessory.displayName}`);
    this.cachedAccessories.set(accessory.UUID, accessory);
  }

  _discoverDevices() {
    const allConfigs = this._buildAccessoryConfigs();
    const toRegister = [];

    for (const { type, config } of allConfigs) {
      const AccessoryClass = this._classForType(type);
      if (!AccessoryClass) continue;

      const uuid = this.api.hap.uuid.generate(
        `cbus-${type}-${config.group || config.powerGroup}`
      );

      const existing = this.cachedAccessories.get(uuid);

      if (existing) {
        this.log.info(`ClipsalCBus: Restoring [${type}] ${config.name}`);
        const acc = new AccessoryClass(this, config, existing);
        this._registeredAccessories.push(acc);
        this.cachedAccessories.delete(uuid);
      } else {
        this.log.info(`ClipsalCBus: Registering [${type}] ${config.name}`);
        const acc = new AccessoryClass(this, config);
        toRegister.push(acc.accessory);
        this._registeredAccessories.push(acc);
      }
    }

    if (toRegister.length > 0) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, toRegister);
    }

    // Remove stale accessories
    const stale = Array.from(this.cachedAccessories.values());
    if (stale.length > 0) {
      this.log.info(`ClipsalCBus: Removing ${stale.length} stale accessories`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
    }
  }

  _classForType(type) {
    return {
      light:  LightAccessory,
      fan:    FanAccessory,
      blind:  BlindAccessory,
      scene:  SceneAccessory,
      aircon: AirconAccessory,
      motion: MotionAccessory,
      smoke:  SmokeAccessory,
    }[type] || null;
  }

  _buildAccessoryConfigs() {
    const cfg = this.config;
    const result = [];
    (cfg.lights || []).forEach((c) => result.push({ type: 'light',  config: c }));
    (cfg.fans   || []).forEach((c) => result.push({ type: 'fan',    config: c }));
    (cfg.blinds || []).forEach((c) => result.push({ type: 'blind',  config: c }));
    (cfg.scenes || []).forEach((c) => result.push({ type: 'scene',  config: c }));
    (cfg.aircon  || []).forEach((c) => result.push({ type: 'aircon',  config: c }));
    (cfg.motion  || []).forEach((c) => result.push({ type: 'motion',  config: c }));
    (cfg.smoke   || []).forEach((c) => result.push({ type: 'smoke',   config: c }));
    return result;
  }
}

module.exports = CBusPlatform;
