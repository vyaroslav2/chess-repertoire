export function getSmoothedWinRate(whiteWins: number, draws: number, totalGames: number, anchor = 50, prior = 0.52) {
    const realScore = whiteWins + (0.5 * draws);
    const fakeScore = anchor * prior; 
    return (realScore + fakeScore) / (totalGames + anchor);
}
