// How the share of games reaching a position shows beside the opening name (UI.40):
// "1 in N" or a percentage, chosen in the settings menu (SM.12).
export type ProbabilityFormat = "odds" | "percent";

export const probabilityFormatKey = "probability";

const thousands = new Intl.NumberFormat("en-GB");

// "1 in 2", "1 in 156", "1 in 8,130"; or "0.64%", "<0.01%". Null with no share to show.
export function formatProbability(probability: number | null | undefined, format: ProbabilityFormat) {
  if (probability == null || !(probability > 0)) return null;
  if (format === "percent") {
    const percent = (probability * 100).toFixed(2);
    return percent === "0.00" ? "<0.01%" : `${percent}%`;
  }
  // Whole numbers only: rough is fine, as cumProb is an estimate.
  return `1 in ${thousands.format(Math.round(1 / probability))}`;
}
