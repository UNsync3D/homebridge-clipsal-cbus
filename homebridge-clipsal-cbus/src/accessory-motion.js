'use strict';

/**
 * Motion/Occupancy sensor accessory.
 * Read-only — listens for WebSocket updates from the Clipsal unit.
 * C-Bus group goes to level > 0 when motion detected, 0 when clear.
 */
class MotionAccessory {
  constructor(platform, config, existingAccessory) {
    this.platform = platform;
    this.api      = platform.api;
    this.log      = platform.log;
    this.client   = platform.client;
    this.config   = config;

    const { Service, Characteristic } = this.api.hap;
    this.Service        = Service;
    this.Characteristic = Characteristic;

    if (existingAccessory) {
      this.accessory = existingAccessory;
    } else {
      const uuid = this.api.hap.uuid.generate(`cbus-motion-${config.group}`);
      this.accessory = new this.api.platformAccessory(config.name, uuid);
      this.accessory.category = this.api.hap.Categories.SENSOR;
    }

    const info = this.accessory.getService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, 'Clipsal')
      .setCharacteristic(Characteristic.Model, '5500SHAC')
      .setCharacteristic(Characteristic.SerialNumber, `CBus-Motion-${config.group}`);

    this.service = this.accessory.getService(Service.MotionSensor)
      || this.accessory.addService(Service.MotionSensor, config.name);

    this._motion = false;

    this.service.getCharacteristic(Characteristic.MotionDetected)
      .onGet(() => this._motion);

    // Listen for WebSocket updates
    this._listenForUpdates();
  }

  _addr(app, group) {
    return ((app << 24) | (group << 8)) >>> 0;
  }

  _listenForUpdates() {
    if (!this.client.onMessage) return;

    const addr = this._addr(56, this.config.group);
    this.log.info(`CBus: Motion sensor ${this.config.name} listening on address ${addr}`);

    this.client.onMessage((evt) => {
      if (evt.dstraw === addr) {
        const level = parseInt(evt.datahex.substring(0, 2), 16);
        const motion = level > 0;
        if (motion !== this._motion) {
          this._motion = motion;
          this.service.updateCharacteristic(this.Characteristic.MotionDetected, motion);
          this.log.info(`CBus: Motion ${this.config.name} -> ${motion ? 'DETECTED' : 'CLEAR'}`);
        }
      }
    });
  }

  async poll() {}
}

module.exports = MotionAccessory;
