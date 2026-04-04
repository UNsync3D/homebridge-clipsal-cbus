'use strict';

class FanAccessory {
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
      const uuid = this.api.hap.uuid.generate(`cbus-fan-${config.group}`);
      this.accessory = new this.api.platformAccessory(config.name, uuid);
      this.accessory.category = this.api.hap.Categories.FAN;
    }

    const info = this.accessory.getService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, 'Clipsal')
      .setCharacteristic(Characteristic.Model, '5500SHAC')
      .setCharacteristic(Characteristic.SerialNumber, `CBus-Fan-${config.group}`);

    this.service = this.accessory.getService(Service.Fan)
      || this.accessory.addService(Service.Fan, config.name);

    this._on = false;

    this.service.getCharacteristic(Characteristic.On)
      .onGet(() => this._on)
      .onSet(this._setOn.bind(this));

    this._listenForUpdates();
  }

  _addr(group) {
    return ((56 << 24) | (group << 8)) >>> 0;
  }

  _listenForUpdates() {
    if (!this.client.onMessage) return;
    const addr = this._addr(this.config.group);
    this.client.onMessage((evt) => {
      if (evt.dstraw === addr && evt.sender !== 'homebridge') {
        const level = parseInt(evt.datahex.substring(0, 2), 16);
        this._on = level > 0;
        this.service.updateCharacteristic(this.Characteristic.On, this._on);
        this.log.info(`CBus: Fan ${this.config.name} sync -> ${this._on ? 'ON' : 'OFF'}`);
      }
    });
  }

  async _setOn(value) {
    this.log.info(`CBus: Setting fan ${this.config.name} ${value ? 'ON' : 'OFF'}`);
    await this.client.setLevel(56, this.config.group, value ? 255 : 0);
    this._on = value;
  }

  async poll() {
    const pct = await this.client.getLevel(56, this.config.group);
    if (pct === null) return;
    this._on = pct > 0;
    this.service.updateCharacteristic(this.Characteristic.On, this._on);
  }
}

module.exports = FanAccessory;
