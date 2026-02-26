const { getStats } = require("./eloSystem");

function createBalancedTeams(playerIds) {

    // Sort by ELO descending
    const sorted = [...playerIds].sort(
        (a, b) => (getStats(b)?.elo || 1000) - (getStats(a)?.elo || 1000)
    );

    const team1 = [];
    const team2 = [];

    // Alternate distribution (safe 3v3)
    sorted.forEach((id, index) => {
        if (index % 2 === 0) {
            team1.push({ id });
        } else {
            team2.push({ id });
        }
    });

    assignCaptain(team1);
    assignCaptain(team2);

    return { team1, team2 };
}

function assignCaptain(team) {

    const maxElo = Math.max(
        ...team.map(p => getStats(p.id)?.elo || 1000)
    );

    const highestPlayers = team.filter(
        p => (getStats(p.id)?.elo || 1000) === maxElo
    );

    const randomIndex = Math.floor(Math.random() * highestPlayers.length);
    const captain = highestPlayers[randomIndex];

    captain.isCaptain = true;
}

module.exports = { createBalancedTeams };