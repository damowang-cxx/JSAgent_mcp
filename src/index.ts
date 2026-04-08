const [major = 0, minor = 0] = process.versions.node.split('.').map((part) => Number.parseInt(part, 10));

if (major < 20 || (major === 20 && minor < 19)) {
  console.error(`js-reverser-mcp requires Node.js >= 20.19. Current version: ${process.version}`);
  process.exit(1);
}

await import('./main.js');
