export function toPathMap(
  probes: Array<{
    path: string;
    value: unknown;
  }>
): Record<string, unknown> {
  return Object.fromEntries(probes.map((probe) => [probe.path, probe.value]));
}
