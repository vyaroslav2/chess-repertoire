// Temporary: move numbers and moves together in the real move list. Delete when done.
import localFont from "next/font/local";
import GridDemo from "./GridDemo";

// For comparison only: Eval Mono with JetBrains Mono's slashed zero (scripts/build_eval_font.py).
const evalMonoSlashed = localFont({ src: "./EvalMonoSlashed-Light.woff2", weight: "300" });

export default function GridPage() {
  return <GridDemo slashedFont={evalMonoSlashed.style.fontFamily} />;
}
