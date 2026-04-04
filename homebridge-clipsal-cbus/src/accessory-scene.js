'use strict';

class SceneAccessory {
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
      const uuid = this.api.hap.uuid.generate(`cbus-scene-${config.group}`);
      this.accessory = new this.api.platformAccessory(config.name, uuid);
      this.accessory.category = this.api.hap.Categories.PROGRAMMABLE_SWITCH;
    }

    const info = this.accessory.getService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, 'Clipsal')
      .setCharacteristic(Characteristic.Model, '5500SHAC')
      .setCharacteristic(Characteristic.SerialNumber, `CBus-Scene-${config.group}`);

    this.switchService = this.accessory.getService(Service.Switch)
      || this.accessory.addService(Service.Switch, config.name);

    this._on = false;

    this.switchService.getCharacteristic(Characteristic.On)
      .onGet(() => this._on)
      .onSet(async (value) => {
        if (value) {
          this.log.info(`CBus: Triggering scene: ${config.name}`);
          await this.client.triggerScene(config.group);
          this._on = true;
          setTimeout(() => {
            this._on = false;
            this.switchService.updateCharacteristic(Characteristic.On, false);
          }, 1000);
        }
      });
  }

  async poll() {}
}

module.exports = SceneAccessory;
