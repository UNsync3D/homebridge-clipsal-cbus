'use strict';

/**
 * Smoke / Gas alarm accessory.
 * Read-only — listens for WebSocket updates from the Clipsal security application (App 208).
 * Exposed as SmokeSensor or CarbonMonoxideSensor in HomeKit.
 */
class SmokeAccessory {
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
      const uuid = this.api.hap.uuid.generate(`cbus-smoke-${config.type}-${config.group}`);
      this.accessory = new this.api.platformAccessory(config.name, uuid);
      this.accessory.category = this.api.hap.Categories.SENSOR;
    }

    const info = this.accessory.getService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, 'Clipsal')
      .setCharacteristic(Characteristic.Model, '5500SHAC')
      .setCharacteristic(Characteristic.SerialNumber, `CBus-Alarm-${config.group}`);

    // Use SmokeSensor for fire, CarbonMonoxideSensor for gas
    if (config.type === 'gas') {
      this.service = this.accessory.getService(Service.CarbonMonoxideSensor)
        || this.accessory.addService(Service.CarbonMonoxideSensor, config.name);
      this._alarmChar = Characteristic.CarbonMonoxideDetected;
      this._normalVal = Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL;
      this._alarmVal  = Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL;
    } else {
      this.service = this.accessory.getService(Service.SmokeSensor)
        || this.accessory.addService(Service.SmokeSensor, config.name);
      this._alarmChar = Characteristic.SmokeDetected;
      this._normalVal = Characteristic.SmokeDetected.SMOKE_NOT_DETECTED;
      this._alarmVal  = Characteristic.SmokeDetected.SMOKE_DETECTED;
    }

    this._alarm = false;

    this.service.getCharacteristic(this._alarmChar)
      .onGet(() => this._alarm ? this._alarmVal : this._normalVal);

    this._listenForUpdates();
  }

  // Security application uses App 208
  _addr(group) {
    return ((208 << 24) | (group << 8)) >>> 0;
  }

  _listenForUpdates() {
    if (!this.client.onMessage) return;

    const addr = this._addr(this.config.group);
    this.log.info(`CBus: Alarm ${this.config.name} listening on address ${addr}`);

    this.client.onMessage((evt) => {
      if (evt.dstraw === addr) {
        const level = parseInt(evt.datahex.substring(0, 2), 16);
        const alarm = level > 0;
        if (alarm !== this._alarm) {
          this._alarm = alarm;
          this.service.updateCharacteristic(
            this._alarmChar,
            alarm ? this._alarmVal : this._normalVal
          );
          this.log.info(`CBus: Alarm ${this.config.name} -> ${alarm ? 'ALARM' : 'CLEAR'}`);
        }
      }
    });
  }

  async poll() {}
}

module.exports = SmokeAccessory;
