# Multidisplay

An RGB LED display made of 64×64 HUB75 panels - a 6-sided cube, or a flat
"wall" of up to six panels in any layout - driven directly by a Raspberry Pi.

Everything lives in [`pi-native/`](pi-native/README.md): a Node.js app that
computes every effect on the Pi, drives the panels through `rpi-led-matrix`,
and serves a control page (with a live 3D preview) to any phone or computer on
the network. It also plays internet radio and an Auto-DJ through a Bluetooth
speaker, with music-reactive effects.

**Live demo:** https://chaoticatom.github.io/Multidisplay/ runs the same
effect engine in the browser, with no Pi behind it. The files at the repo root
(`app.js`, `index.html`, `sim-engine.js`, `effects.json`, ...) are build
output from `pi-native/sim/deploy.js` - don't edit them by hand.

See [`pi-native/README.md`](pi-native/README.md) for setup, panel wiring, WiFi
and Bluetooth.
