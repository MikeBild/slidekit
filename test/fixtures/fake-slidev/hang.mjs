// Fake `slidev build` that never finishes — used to exercise the build timeout.
setInterval(() => {}, 1 << 30)
