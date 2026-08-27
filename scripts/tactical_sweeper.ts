console.warn("tactical_sweeper.ts is deprecated; use deep_verify.ts with an explicit repertoireId.");
void import("./deep_verify").then(({ main }) => main(process.argv.slice(2), undefined, "tactical-sweeper"));
