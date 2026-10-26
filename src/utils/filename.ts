/** Makes a project name safe to use as a downloaded file's base name. */
export function slugifyFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_]+/g, "_") || "project";
}
