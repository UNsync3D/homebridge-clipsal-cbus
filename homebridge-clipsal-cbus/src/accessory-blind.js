'use strict';

class BlindAccessory {
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
      const uuid = this.api.hap.uuid.generate(`cbus-blind-${config.group}`);
      this.accessory = new this.api.platformAccessory(config.name, uuid);
      this.accessory.category = this.api.hap.Categories.WINDOW_COVERING;
    }

    const info = this.accessory.getService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, 'Clipsal')
      .setCharacteristic(Characteristic.Model, '5500SHAC')
      .setCharacteristic(Characteristic.SerialNumber, `CBus-Blind-${config.group}`);

    this.service = this.accessory.getService(Service.WindowCovering)
      || this.accessory.addService(Service.WindowCovering, config.name);

    this._position = 100;

    this.service.getCharacteristic(Characteristic.CurrentPosition)
      .onGet(() => this._position);

    this.service.getCharacteristic(Characteristic.TargetPosition)
      .onGet(() => this._position)
      .onSet(this._setPosition.bind(this));

    this.service.getCharacteristic(Characteristic.PositionState)
      .onGet(() => Characteristic.PositionState.STOPPED);

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
        this._position = Math.round((level / 255) * 100);
        this.service.updateCharacteristic(this.Characteristic.CurrentPosition, this._position);
        this.service.updateCharacteristic(this.Characteristic.TargetPosition, this._position);
        this.log.info(`CBus: Blind ${this.config.name} sync -> ${this._position}%`);
      }
    });
  }

  _percentToCbus(percent) {
    if (percent === 0) return 0;
    if (percent === 100) return 255;
    return Math.round((percent / 100) * 255);
  }

  async _setPosition(value) {
    this.log.info(`CBus: Setting blind ${this.config.name} to ${value}%`);
    const level = this._percentToCbus(value);
    await this.client.setLevel(56, this.config.group, level);
    this._position = value;
    setTimeout(() => {
      this.service.updateCharacteristic(this.Characteristic.CurrentPosition, value);
    }, 500);
  }

  async poll() {
    const pct = await this.client.getLevel(56, this.config.group);
    if (pct === null) return;
    this._position = Math.min(100, Math.max(0, pct));
    this.service.updateCharacteristic(this.Characteristic.CurrentPosition, this._position);
    this.service.updateCharacteristic(this.Characteristic.TargetPosition, this._position);
  }
}

module.exports = BlindAccessory;
