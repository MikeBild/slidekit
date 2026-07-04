// Fake `slidev build` that fails: write a recognizable secret to stderr, exit 1.
// The server must NOT leak this stderr to the HTTP client.
process.stderr.write('SECRET_STDERR_LEAK_MARKER build blew up\n')
process.exit(1)
