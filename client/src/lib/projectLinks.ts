/**
 * Project names as written in the sheets, claims and requests, turned into
 * one key per project and a link to that project's page. Tiny and pure so
 * the router and any table can use it.
 */

/** "Kakinada  Port", "KAKINADA-PORT" -> "kakinada port". Empty or N/A -> null. */
export function projectKey(name: string | null | undefined): string | null {
  const k = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!k || ["na", "n a", "nil", "nill", "none", "null", "no", "tbd", "tba", "0", "not applicable"].includes(k)) return null;
  return k;
}

/**
 * Link to one project's details page. Spellings that group together share
 * one link. Null when the name is blank or N/A-like.
 */
export function projectHref(name: string | null | undefined): string | null {
  const key = projectKey(name);
  return key ? `/travel/bi/projects/p/${key.replace(/ /g, "-")}` : null;
}

/** The project key back from the last part of a projectHref link. */
export function projectKeyFromSlug(slug: string): string | null {
  let s = slug;
  try { s = decodeURIComponent(slug); } catch { /* keep as is */ }
  return projectKey(s.replace(/-/g, " "));
}
