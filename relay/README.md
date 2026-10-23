# Upload relay

Send photos from your iPhone to CleanFrame's wallpaper list.

The TV shows a QR code. Your iPhone opens a page served by this relay, you frame the photo, and the phone prepares every image the wallpaper needs (the full photo, thumbnail and the blurred glass materials). The TV downloads its own copy and keeps it, so wallpapers keep working when the Mac is asleep. The relay only needs to be running while you upload.

## Run it

Needs Node 18 or newer. No packages to install.

```sh
cd CleanFrame
npm run relay
```

It prints two addresses:

* **Browser preview of the TV app**, for example `http://192.168.1.20:4796/tv/`. Open it in a desktop browser, go to Settings, Background, Upload a photo, and scan the code with your iPhone. This is the full flow without touching the TV.
* **Relay address for the TV build**. Put it in `app/assets/relay.js` before packaging the app for the TV.

Your phone must be on the same Wi-Fi as the Mac. The first time, macOS may ask whether Node can accept incoming connections. Allow it.

Photos are kept in `relay/data/` as a backup. Delete that folder any time.

## Options

* `PORT=5000 npm run relay` changes the port.
* `CLEANFRAME_HOST=192.168.1.20 npm run relay` sets the address in the QR code, if the Mac has several network connections and picks the wrong one.

## Keep it running

To start the relay whenever the Mac starts, add it to Homebridge's machine the same way you run other always on services, or use a LaunchAgent. Ask Claude to set that up when you're ready.

## On the TV

* `config.xml` now asks for the internet privilege so the app can reach the relay.
* Uploaded photos live in the app's own storage. Removing them happens in Wallpaper: focus a photo, press Right, then OK on Remove photo. The photo in use can't be removed until you pick another.
* Reinstalling CleanFrame with a different identity clears uploaded photos. Updating in place keeps them.
