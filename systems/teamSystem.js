const { getStats } = require("./eloSystem");

function createBalancedTeams(playerIds) {

    const sorted = [...playerIds].sort(
        (a, b) => (getStats(b)?.elo || 1000) - (getStats(a)?.elo || 1000)
    );

    const team1 = [];
    const team2 = [];

    sorted.forEach(id => {
        const avg1 = team1.reduce((a,p)=>a+(getStats(p.id)?.elo||1000),0)/(team1.length||1);
        const avg2 = team2.reduce((a,p)=>a+(getStats(p.id)?.elo||1000),0)/(team2.length||1);

        if (avg1 <= avg2) team1.push({ id });
        else team2.push({ id });
    });

    // Captain = highest elo in team
    const captain1 = team1.sort((a,b)=> (getStats(b.id)?.elo||1000)-(getStats(a.id)?.elo||1000))[0];
    const captain2 = team2.sort((a,b)=> (getStats(b.id)?.elo||1000)-(getStats(a.id)?.elo||1000))[0];

    captain1.isCaptain = true;
    captain2.isCaptain = true;

    return { team1, team2 };
}

module.exports = { createBalancedTeams };