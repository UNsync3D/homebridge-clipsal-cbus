#!/bin/bash
# Homebridge Clipsal CBus Plugin Installer

PLUGIN_DIR="/var/lib/homebridge/node_modules/homebridge-clipsal-cbus"
SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing homebridge-clipsal-cbus..."

# Remove old install
rm -rf "$PLUGIN_DIR"

# Create directories
mkdir -p "$PLUGIN_DIR/src"
mkdir -p "$PLUGIN_DIR/homebridge-ui/public"
mkdir -p "$PLUGIN_DIR/node_modules"

# Copy files
cp "$SOURCE_DIR/package.json" "$PLUGIN_DIR/"
cp "$SOURCE_DIR/config.schema.json" "$PLUGIN_DIR/"
cp "$SOURCE_DIR/README.md" "$PLUGIN_DIR/"
cp "$SOURCE_DIR/src/"*.js "$PLUGIN_DIR/src/"
cp "$SOURCE_DIR/homebridge-ui/server.js" "$PLUGIN_DIR/homebridge-ui/"
cp "$SOURCE_DIR/homebridge-ui/public/index.html" "$PLUGIN_DIR/homebridge-ui/public/"
cp "$SOURCE_DIR/homebridge-ui/public/.gitkeep" "$PLUGIN_DIR/homebridge-ui/public/"

# Install ws dependency
echo "Installing ws package..."
/opt/homebridge/bin/node /opt/homebridge/bin/npm install ws --prefix "$PLUGIN_DIR"

echo "Done! Restarting Homebridge..."
sudo systemctl restart homebridge
echo "Homebridge restarted."
