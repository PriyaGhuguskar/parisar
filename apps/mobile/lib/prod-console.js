// Silence verbose console output in release builds.
//
// React Native release builds still forward console.* to the device log
// (logcat / Console.app), where any app on a rooted device or anyone with adb
// can read it. Our console.warn calls only log error messages, but backend
// error text can echo request values (phone numbers, ids), so in production
// only console.error remains — and it is the RN/Hermes crash path, not ours.
// Imported first from index.js so it runs before any other module.

if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
}
