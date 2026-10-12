import { ViewTransition } from "react";

const DIRECTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" } as const;

/** Must wrap page content, not the layout: layouts persist and never fire enter/exit. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={DIRECTION} exit={DIRECTION} default="none">
      {children}
    </ViewTransition>
  );
}
