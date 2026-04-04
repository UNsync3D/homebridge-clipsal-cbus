# homebridge-clipsal-cbus

A Homebridge plugin for the **Clipsal C-Bus 5500SHAC** home automation controller, integrating C-Bus lighting, blinds, fans, scenes, air conditioning and sensors into Apple HomeKit via Homebridge.

## Features

- 💡 **Lights & Dimmers** — on/off and brightness control
- 🌀 **Fans** — on/off control
- 🪟 **Blinds & Curtains** — open/close/position control via HomeKit WindowCovering
- 🎬 **Scenes** — trigger C-Bus scenes as HomeKit switches (Siri-compatible)
- ❄️ **Air Conditioning** — power, mode (Heat/Cool/Auto), current temperature display and target temperature control via Coolmaster bridge
- 🏃 **Motion Sensors** — PIR and occupancy sensors for HomeKit automations
- 🔥 **Smoke & Gas Alarms** — fire and carbon monoxide detection via HomeKit
- 🔄 **Real-time sync** — changes made on the Clipsal web UI or wall panels are reflected in HomeKit instantly via WebSocket

## How it works

The plugin connects to the Clipsal 5500SHAC unit using the same **WebSocket protocol** as the built-in web interface (`ws://host:port/scada-vis/objects/ws`). The C-Bus address encoding formula and command format were reverse engineered directly from the Clipsal firmware's JavaScript source code (`cbuslib.js`).

## Requirements

- [Homebridge](https://homebridge.io) v1.3.0 or later
- Node.js v14 or later
- Clipsal 5500SHAC on the same network as Homebridge
- `ws` npm package (installed automatically)

## Installation

### Via Homebridge UI (recommended)
Search for `homebridge-clipsal-cbus` in the **Plugins** tab and click Install.

### Manually
```bash
npm install -g homebridge-clipsal-cbus
```

## Configuration

Configure the plugin via the Homebridge UI Settings page, or add it manually to your `config.json`:

```json
{
  "platforms": [
    {
      "platform": "ClipsalCBus",
      "name": "Clipsal CBus",
      "host": "192.168.1.100",
      "port": 8087,
      "network": 0,
      "lights": [
        { "name": "Living Room", "group": 1, "dimmable": true },
        { "name": "Kitchen", "group": 2, "dimmable": false }
      ],
      "fans": [
        { "name": "Bathroom Fan", "group": 5 }
      ],
      "blinds": [
        { "name": "Living Curtain", "group": 40 },
        { "name": "Living Blind", "group": 41 }
      ],
      "scenes": [
        { "name": "Welcome Home", "group": 1 },
        { "name": "Goodnight", "group": 2 }
      ],
      "aircon": [
        {
          "name": "Living Room AC",
          "powerGroup": 0,
          "modeGroup": 3,
          "fanGroup": 2
        }
      ],
      "motion": [
        { "name": "Occupancy", "group": 18 },
        { "name": "Ensuite PIR", "group": 19 }
      ],
      "smoke": [
        { "name": "Fire Alarm", "group": 9, "type": "fire" },
        { "name": "Gas Alarm", "group": 10, "type": "gas" }
      ]
    }
  ]
}
```

## Configuration Reference

### Platform

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `host` | string | ✅ | | IP address of your Clipsal 5500SHAC unit |
| `port` | number | | `8087` | HTTP/WebSocket port |
| `network` | number | | `0` | C-Bus network ID |

### Lights

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name in HomeKit |
| `group` | number | ✅ | C-Bus group address (Application 56) |
| `dimmable` | boolean | | Enable brightness slider (default: `true`) |

### Fans

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name in HomeKit |
| `group` | number | ✅ | C-Bus group address (Application 56) |

### Blinds & Curtains

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name in HomeKit |
| `group` | number | ✅ | C-Bus group address (Application 56) |

### Scenes

Scenes are exposed as momentary switches in HomeKit — they turn on briefly then reset. This makes them compatible with Siri ("Hey Siri, turn on Welcome Home").

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name in HomeKit |
| `group` | number | ✅ | Trigger Control group address (Application 202) |

### Air Conditioning (Coolmaster)

Air conditioning is controlled via the Coolmaster bridge integrated into the 5500SHAC using C-Bus Application 48. Current and target temperatures are read from Application 250 (User Parameter).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name in HomeKit |
| `powerGroup` | number | ✅ | Coolmaster power group (App 48) |
| `modeGroup` | number | ✅ | Coolmaster mode group (App 48) |
| `fanGroup` | number | ✅ | Coolmaster fan group (App 48) |

**Standard Coolmaster group mapping:**

| Zone | Power | Mode | Fan | Temp Up | Temp Down |
|------|-------|------|-----|---------|-----------|
| Zone 1 | 0 | 3 | 2 | 16 | 17 |
| Zone 2 | 4 | 7 | 6 | 18 | 19 |
| Zone 3 | 8 | 11 | 10 | 20 | 21 |
| Zone 4 | 12 | 15 | 14 | 22 | 23 |

> **Note:** The physical zone assigned to each group number varies by installation. Use your Clipsal web interface's browser DevTools (Network → WS tab) to capture WebSocket messages and identify which group controls which room.

### Motion Sensors

Motion sensors listen for WebSocket updates from App 56 and update HomeKit in real time. Use them to trigger automations such as turning on lights when motion is detected.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name in HomeKit |
| `group` | number | ✅ | C-Bus group address (Application 56) |

### Smoke & Gas Alarms

Alarms listen for WebSocket updates from the C-Bus Security Application (App 208). Fire alarms appear as HomeKit Smoke Sensors; gas alarms appear as Carbon Monoxide Sensors.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Display name in HomeKit |
| `group` | number | ✅ | C-Bus group address (Application 208) |
| `type` | string | ✅ | `fire` or `gas` |

## Finding Your Group Numbers

The easiest way to find group numbers for your installation:

1. Open the Clipsal web interface (`http://<your-unit-ip>:8087/scada-vis/touch`)
2. Open browser Developer Tools (`Cmd+Option+I` on Mac)
3. Go to **Network** → **WS** tab
4. Click a device on the Clipsal page to control it
5. Read the `group` value from the WebSocket message

Alternatively, run this in the browser console to list all objects:

```javascript
var objs = objectStore.getObjects();
Object.keys(objs).forEach(function(id) {
  var obj = objs[id];
  console.log(obj.name, obj.address);
});
```

## C-Bus Technical Details

### WebSocket Protocol

The plugin connects to `ws://<host>:<port>/scada-vis/objects/ws` using an auth token obtained via HTTP POST. Commands use the same JSON format as the Clipsal web UI:

```json
{
  "address": 939524352,
  "datatype": 5,
  "value": 255,
  "type": "text",
  "update": false,
  "action": "write"
}
```

### Address Encoding

From `cbuslib.js` (`encodeObjectAddress`):

```
Standard:      address = (app << 24) | (network << 16) | (group << 8)
User Param:    address = (250 << 24) | group   ← no shift
4-part:        address = (app << 24) | (net << 16) | (unit << 8) | param
```

### Application Numbers

| Application | Number | Usage |
|-------------|--------|-------|
| Lighting | 56 | Lights, fans, blinds, motion sensors |
| Coolmaster | 48 | Air conditioning control |
| Trigger Control | 202 | Scenes |
| User Parameter | 250 | AC temperatures (integer values) |
| Security | 208 | Smoke and gas alarms |
| Unit Parameter | 255 | Hardware sensors (IEEE 754 float) |

## Troubleshooting

**Plugin not connecting:**
- Verify the Clipsal unit IP address is correct
- Ensure Homebridge and the Clipsal unit are on the same network
- Check port 8087 is accessible: `nc -zv <host> 8087`

**Devices not responding:**
- Check the Homebridge log for errors
- Verify group numbers by monitoring the WebSocket in browser DevTools

**AC zones controlling wrong rooms:**
- Use browser DevTools to capture WebSocket messages when controlling each AC zone
- Match the `group` value in the message to the correct zone name
- Clear the Homebridge cache and re-pair after changing AC zone configuration

**Accessories not appearing in Home app:**
- Remove and re-add the Homebridge Clipsal Cbus bridge in the Home app
- Use pin shown in the Homebridge UI

## Contributing

Pull requests welcome! Please open an issue first to discuss any major changes.

## License

MIT

## Acknowledgements

- [Homebridge](https://homebridge.io) — the platform that makes this possible
- Clipsal/Schneider Electric — for the 5500SHAC hardware
- The Homebridge community for plugin development guidance
