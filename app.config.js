// Everything about the app still lives in app.json. This file exists for
// one reason: where the web build will be hosted is not a property of the
// app, it is a property of the place it is going.
//
//   npm run build:web      -> served from the root of an address
//   npm run build:pages    -> served from a folder, for GitHub Pages
//
// Keeping it out of app.json means the ordinary build keeps working at a
// plain address, which is what the Wi-Fi link on the office network is.
const app = require('./app.json');

const baseUrl = (process.env.KBH_BASE_URL ?? '').replace(/\/$/, '');

module.exports = {
  ...app.expo,
  experiments: {
    ...app.expo.experiments,
    ...(baseUrl ? { baseUrl } : {}),
  },
};
