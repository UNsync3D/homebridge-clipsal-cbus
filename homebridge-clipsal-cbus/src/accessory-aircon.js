'use strict';

class AirconAccessory {
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
      const uuid = this.api.hap.uuid.generate(`cbus-aircon-${config.powerGroup}`);
      this.accessory = new this.api.platformAccessory(config.name, uuid);
      this.accessory.category = this.api.hap.Categories.THERMOSTAT;
    }

    const info = this.accessory.getService(Service.AccessoryInformation);
    info
      .setCharacteristic(Characteristic.Manufacturer, 'Clipsal / Coolmaster')
      .setCharacteristic(Characteristic.Model, '5500SHAC')
      .setCharacteristic(Characteristic.SerialNumber, `CBus-AC-${config.powerGroup}`);

    this.service = this.accessory.getService(Service.Thermostat)
      || this.accessory.addService(Service.Thermostat, config.name);

    this._mode        = 0;
    this._currentTemp = 22;
    this._targetTemp  = 22;

    this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .onGet(() => Math.min(this._mode, 2));

    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onGet(() => this._mode)
      .onSet(this._setMode.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentTemperature)
      .onGet(() => this._currentTemp);

    this.service.getCharacteristic(Characteristic.TargetTemperature)
      .setProps({ minValue: 16, maxValue: 30, minStep: 1 })
      .onGet(() => Math.max(16, this._targetTemp))
      .onSet(this._setTargetTemp.bind(this));

    this.service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .setValue(Characteristic.TemperatureDisplayUnits.CELSIUS);

    this._listenForUpdates();
  }

  // Standard address (app48): app<<24 | group<<8
  _addr48(group) {
    return ((48 << 24) | (group << 8)) >>> 0;
  }

  // User Param address (app250): app<<24 | group (no shift!)
  _addr250(group) {
    return ((250 << 24) | group) >>> 0;
  }

  // 4-part measurement address (app255): app<<24 | net<<16 | unit<<8 | param
  _addr255(unit, param) {
    return ((255 << 24) | (0 << 16) | (unit << 8) | param) >>> 0;
  }

  // Zone-specific group lookups based on powerGroup index (0,4,8)
  // From Clipsal HTML cbustags
  _zoneIndex()     { return this.config.powerGroup / 4; } // 0,1,2

  // App48 groups
  _tempUpGroup()   { return 16 + this._zoneIndex() * 2; }
  _tempDownGroup() { return 17 + this._zoneIndex() * 2; }

  // App250 groups (User Parameter)
  _setTempGroup()  { return [13, 23, 33][this._zoneIndex()]; }
  _currTempGroup() { return [2, 3, 4][this._zoneIndex()]; }  // Aircon_X_CurrentTemp (app250)

  // Current temp address uses app250 User Param formula: (250<<24)|group (no shift)
  // Aircon_1_CurrentTemp=group2, Aircon_2=group3, Aircon_3=group4
  _currentTempAddr() {
    return this._addr250(this._currTempGroup());
  }

  // App250 set temp address
  _setTempAddr() {
    return this._addr250(this._setTempGroup());
  }

  _listenForUpdates() {
    if (!this.client.onMessage) return;

    const powerAddr   = this._addr48(this.config.powerGroup);
    const modeAddr    = this._addr48(this.config.modeGroup);
    const currTempAddr = this._currentTempAddr();
    const setTempAddr  = this._setTempAddr();

    this.log.info(`CBus: AC ${this.config.name} listening on power:${powerAddr} mode:${modeAddr} currTemp:${currTempAddr} setTemp:${setTempAddr}`);

    this.client.onMessage((evt) => {
      const addr = evt.dstraw;

      if (addr === powerAddr) {
        const level = parseInt(evt.datahex.substring(0, 2), 16);
        if (level === 0) {
          this._mode = 0;
          this.service.updateCharacteristic(this.Characteristic.CurrentHeatingCoolingState, 0);
          this.service.updateCharacteristic(this.Characteristic.TargetHeatingCoolingState, 0);
          this.log.info(`CBus: AC ${this.config.name} -> OFF`);
        } else {
          this.log.info(`CBus: AC ${this.config.name} -> ON`);
        }
      } else if (addr === modeAddr) {
        // Only sync mode if AC is currently on
        if (this._mode === 0) {
          this.log.debug(`CBus: AC ${this.config.name} ignoring mode update (AC is off)`);
          return;
        }
        const cbusMode = parseInt(evt.datahex.substring(0, 2), 16);
        const hkMode = this._cbusToHKMode(cbusMode, true);
        this._mode = hkMode;
        this.service.updateCharacteristic(this.Characteristic.CurrentHeatingCoolingState, Math.min(hkMode, 2));
        this.service.updateCharacteristic(this.Characteristic.TargetHeatingCoolingState, hkMode);
        this.log.info(`CBus: AC ${this.config.name} mode sync -> ${hkMode}`);
      } else if (addr === currTempAddr) {
        // Current temperature as integer from app250
        const temp = parseInt(evt.datahex.substring(6, 8), 16);
        if (temp > 0 && temp < 60) {
          this._currentTemp = temp;
          this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, temp);
          this.log.info(`CBus: AC ${this.config.name} current temp -> ${temp}°C`);
        }
      } else if (addr === setTempAddr) {
        // Target temperature from User Parameter (integer value)
        const temp = parseInt(evt.datahex.substring(6, 8), 16);
        if (temp >= 16 && temp <= 30) {
          this._targetTemp = temp;
          this.service.updateCharacteristic(this.Characteristic.TargetTemperature, temp);
          this.log.info(`CBus: AC ${this.config.name} target temp sync -> ${temp}°C`);
        }
      }
    });
  }

  _hkToCbusMode(hkMode) {
    const map = { 0: 0, 1: 10, 2: 20, 3: 50 };
    return map[hkMode] ?? 20;
  }

  _cbusToHKMode(cbusMode, power) {
    if (!power) return 0;
    const map = { 10: 1, 20: 2, 50: 3 };
    return map[cbusMode] ?? 0;
  }

  async _setMode(value) {
    this.log.info(`CBus: AC ${this.config.name} mode -> ${value}`);
    if (value === 0) {
      await this.client.setLevel(48, this.config.powerGroup, 0);
    } else {
      await this.client.setLevel(48, this.config.powerGroup, 255);
      await this.client.setLevel(48, this.config.modeGroup, this._hkToCbusMode(value));
    }
    this._mode = value;
    this.service.updateCharacteristic(
      this.Characteristic.CurrentHeatingCoolingState, Math.min(value, 2)
    );
  }

  async _setTargetTemp(value) {
    this.log.info(`CBus: AC ${this.config.name} temp -> ${value}°C (current: ${this._targetTemp}°C)`);
    const diff = Math.round(value - this._targetTemp);
    if (diff === 0) return;

    const group = diff > 0 ? this._tempUpGroup() : this._tempDownGroup();
    const steps = Math.abs(diff);

    for (let i = 0; i < steps; i++) {
      await this.client.setLevel(48, group, 1);
      await new Promise(r => setTimeout(r, 300));
    }
    this._targetTemp = value;
  }

  async poll() {}
}

module.exports = AirconAccessory;
