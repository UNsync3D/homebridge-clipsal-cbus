'use strict';

class LightAccessory {
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
      // Reuse cached accessory
      this.accessory = existingAccessory;
    } else {
      const uuid = this.api.hap.uuid.generate(`cbus-light-${config.group}`);
      this.accessory = new this.api.platformAccessory(config.name, uuid);
      this.accessory.category = this.api.hap.Categories.LIGHTBULB;
    }

    // Update accessory info
    const info = this.accessory.getService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, 'Clipsal')
      .setCharacteristic(Characteristic.Model, '5500SHAC')
      .setCharacteristic(Characteristic.SerialNumber, `CBus-Light-${config.group}`);

    // Get or add the lightbulb service
    this.service = this.accessory.getService(Service.Lightbulb)
      || this.accessory.addService(Service.Lightbulb, config.name);

    this._on         = false;
    this._brightness = 100;

    this.service.getCharacteristic(Characteristic.On)
      .onGet(() => this._on)
      .onSet(this._setOn.bind(this));

    if (config.dimmable !== false) {
      this.service.getCharacteristic(Characteristic.Brightness)
        .onGet(() => this._brightness)
        .onSet(this._setBrightness.bind(this));
    }

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
        this._brightness = Math.round((level / 255) * 100);
        this._on = this._brightness > 0;
        this.service.updateCharacteristic(this.Characteristic.On, this._on);
        if (this.config.dimmable !== false) {
          this.service.updateCharacteristic(this.Characteristic.Brightness, this._brightness);
        }
        this.log.info(`CBus: Light ${this.config.name} sync -> ${this._on ? this._brightness + '%' : 'OFF'}`);
      }
    });
  }

  async _setOn(value) {
    this.log.info(`CBus: Setting ${this.config.name} ${value ? 'ON' : 'OFF'}`);
    if (value) {
      const level = Math.round(((this._brightness || 100) / 100) * 255);
      await this.client.setLevel(56, this.config.group, level);
      this._on = true;
    } else {
      await this.client.setLevel(56, this.config.group, 0);
      this._on = false;
    }
  }

  async _setBrightness(value) {
    this.log.info(`CBus: Setting ${this.config.name} brightness ${value}%`);
    this._brightness = value;
    this._on         = value > 0;
    const level      = Math.round((value / 100) * 255);
    await this.client.setLevel(56, this.config.group, level);
  }

  async poll() {
    const pct = await this.client.getLevel(56, this.config.group);
    if (pct === null) return;
    this._brightness = Math.min(100, Math.max(0, pct));
    this._on         = this._brightness > 0;
    this.service.updateCharacteristic(this.Characteristic.On, this._on);
    if (this.config.dimmable !== false) {
      this.service.updateCharacteristic(this.Characteristic.Brightness, this._brightness);
    }
  }
}

module.exports = LightAccessory;
