import { Suspense, lazy } from "react";
import { assistantRehypePlugins } from "@/lib/markdownSafety";

// The markdown renderer (with code highlighting, maths and diagrams) is large,
// so it downloads only when the first assistant answer is shown.
const Streamdown = lazy(() =>
  import("streamdown").then((module) => {
    const plugins = assistantRehypePlugins(module.defaultRehypePlugins);
    return { default: (props: { children: string }) => <module.Streamdown rehypePlugins={plugins}>{props.children}</module.Streamdown> };
  }),
);

/** Renders assistant markdown; shows the plain text while the renderer loads. */
export function Markdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div style={{ whiteSpace: "pre-wrap" }}>{children}</div>}>
      <Streamdown>{children}</Streamdown>
    </Suspense>
  );
}
