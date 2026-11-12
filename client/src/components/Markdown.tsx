import { Suspense, lazy } from "react";

// The markdown renderer (with code highlighting, maths and diagrams) is large,
// so it downloads only when the first assistant answer is shown.
const Streamdown = lazy(() => import("streamdown").then((module) => ({ default: module.Streamdown })));

/** Renders assistant markdown; shows the plain text while the renderer loads. */
export function Markdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div style={{ whiteSpace: "pre-wrap" }}>{children}</div>}>
      <Streamdown>{children}</Streamdown>
    </Suspense>
  );
}
