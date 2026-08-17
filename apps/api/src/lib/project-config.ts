/**
 * Shallow-merge section patches into existing project.config.
 * Content/Video/AI tabs each send only their keys; siblings must survive.
 */
export function mergeProjectConfig(
  existing: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    base[key] = value;
  }
  return base;
}
