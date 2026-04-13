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

    this._mode           = 0;
    this._currentTemp    = 22;
    this._targetTemp     = 22;
    this._pendingPowerOn = false;
    this._cmdLockUntil   = 0;

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
      .updateValue(Characteristic.TemperatureDisplayUnits.CELSIUS);

    this._listenForUpdates();
  }

  _addr48(group) {
    return ((48 << 24) | (group << 8)) >>> 0;
  }

  _addr250(group) {
    return ((250 << 24) | group) >>> 0;
  }

  _zoneIndex()     { return this.config.powerGroup / 4; }
  _tempUpGroup()   { return 16 + this._zoneIndex() * 2; }
  _tempDownGroup() { return 17 + this._zoneIndex() * 2; }
  _setTempGroup()  { return [13, 23, 33][this._zoneIndex()]; }
  _currTempGroup() { return [2, 3, 4][this._zoneIndex()]; }

  _currentTempAddr() { return this._addr250(this._currTempGroup()); }
  _setTempAddr()     { return this._addr250(this._setTempGroup()); }

  _isLocked() {
    return Date.now() < this._cmdLockUntil;
  }

  _lockForCmd() {
    this._cmdLockUntil = Date.now() + 3000;
  }

  _updateHomeKit(target, current, temp, setTemp) {
    this.service.getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
      .updateValue(target);
    this.service.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
      .updateValue(current);
    if (temp !== null) {
      this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
        .updateValue(temp);
    }
    if (setTemp !== null) {
      this.service.getCharacteristic(this.Characteristic.TargetTemperature)
        .updateValue(setTemp);
    }
  }

  _listenForUpdates() {
    if (!this.client.onMessage) return;

    const powerAddr    = this._addr48(this.config.powerGroup);
    const modeAddr     = this._addr48(this.config.modeGroup);
    const currTempAddr = this._currentTempAddr();
    const setTempAddr  = this._setTempAddr();

    this.log.info(`CBus: AC ${this.config.name} listening on power:${powerAddr} mode:${modeAddr} currTemp:${currTempAddr} setTemp:${setTempAddr}`);

    this.client.onMessage((evt) => {
      const addr = evt.dstraw;

      const isTempAddr = (addr === currTempAddr || addr === setTempAddr);
      if (!isTempAddr && this._isLocked()) {
        this.log.debug(`CBus: AC ${this.config.name} ignoring broadcast (command lock active)`);
        return;
      }

      if (addr === powerAddr) {
        const level = parseInt(evt.datahex.substring(0, 2), 16);
        if (level === 0) {
          this._mode = 0;
          this._pendingPowerOn = false;
          this.log.info(`CBus: AC ${this.config.name} -> OFF`);
          this._updateHomeKit(0, 0, null, null);
        } else {
          this._pendingPowerOn = true;
          this.log.info(`CBus: AC ${this.config.name} -> ON (waiting for mode broadcast)`);
        }

      } else if (addr === modeAddr) {
        const cbusMode = parseInt(evt.datahex.substring(0, 2), 16);

        if (!this._pendingPowerOn && this._mode === 0) {
          this.log.debug(`CBus: AC ${this.config.name} ignoring mode (off, no pending power-on)`);
          return;
        }

        const hkMode = this._cbusToHKMode(cbusMode);
        this._mode = hkMode;
        this._pendingPowerOn = false;
        this.log.info(`CBus: AC ${this.config.name} mode sync cbus:${cbusMode} -> hk:${hkMode}`);
        this._updateHomeKit(hkMode, Math.min(hkMode, 2), null, null);

      } else if (addr === currTempAddr) {
        const temp = parseInt(evt.datahex.substring(6, 8), 16);
        if (temp > 0 && temp < 60) {
          this._currentTemp = temp;
          this.log.info(`CBus: AC ${this.config.name} current temp -> ${temp}C`);
          this._updateHomeKit(this._mode, Math.min(this._mode, 2), temp, null);
        }

      } else if (addr === setTempAddr) {
        const temp = parseInt(evt.datahex.substring(6, 8), 16);
        if (temp >= 16 && temp <= 30) {
          this._targetTemp = temp;
          this.log.info(`CBus: AC ${this.config.name} target temp -> ${temp}C`);
          this._updateHomeKit(this._mode, Math.min(this._mode, 2), null, temp);
        }
      }
    });
  }

  _hkToCbusMode(hkMode) {
    const map = { 0: 0, 1: 10, 2: 20, 3: 50 };
    return map[hkMode] ?? 20;
  }

  _cbusToHKMode(cbusMode) {
    const map = { 0: 0, 10: 1, 20: 2, 30: 2, 40: 2, 50: 3 };
    return map[cbusMode] ?? 0;
  }

  async _setMode(value) {
    this.log.info(`CBus: AC ${this.config.name} set mode -> ${value}`);
    this._lockForCmd();
    if (value === 0) {
      await this.client.setLevel(48, this.config.powerGroup, 0);
    } else {
      await this.client.setLevel(48, this.config.powerGroup, 255);
      await this.client.setLevel(48, this.config.modeGroup, this._hkToCbusMode(value));
    }
    this._mode = value;
    this.service.getCharacteristic(this.Characteristic.CurrentHeatingCoolingState)
      .updateValue(Math.min(value, 2));
  }

  async _setTargetTemp(value) {
    this.log.info(`CBus: AC ${this.config.name} set temp -> ${value}C`);
    const diff = Math.round(value - this._targetTemp);
    if (diff === 0) return;
    this._lockForCmd();
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
