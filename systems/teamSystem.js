const { getStats } = require("./eloSystem");

function createBalancedTeams(playerIds) {

    // Sort by elo descending
    const sorted = [...playerIds].sort(
        (a, b) => (getStats(b)?.elo || 1000) - (getStats(a)?.elo || 1000)
    );

    const team1 = [];
    const team2 = [];

    // Basic balance by average elo
    sorted.forEach(id => {

        const avg1 = team1.reduce((a,p)=>a+(getStats(p.id)?.elo||1000),0)/(team1.length||1);
        const avg2 = team2.reduce((a,p)=>a+(getStats(p.id)?.elo||1000),0)/(team2.length||1);

        if (avg1 <= avg2) team1.push({ id });
        else team2.push({ id });
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

    // 🎲 Random among highest ELO players
    const randomIndex = Math.floor(Math.random() * highestPlayers.length);
    const captain = highestPlayers[randomIndex];

    captain.isCaptain = true;
}

module.exports = { createBalancedTeams };