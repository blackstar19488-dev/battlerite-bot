const { getStats } = require("./eloSystem");

let currentDraft = null;

function averageElo(team) {
    return team.reduce((sum, id) => {
        const stats = getStats(id);
        return sum + (stats?.elo || 1000);
    }, 0) / team.length;
}

function makeBalancedTeams(players) {
    const sorted = [...players].sort((a, b) => {
        return (getStats(b)?.elo || 1000) - (getStats(a)?.elo || 1000);
    });

    const team1 = [];
    const team2 = [];

    sorted.forEach(player => {
        if (averageElo(team1) <= averageElo(team2)) {
            team1.push(player);
        } else {
            team2.push(player);
        }
    });

    return [team1, team2];
}

function getCaptain(team) {
    return team.sort((a, b) => {
        return (getStats(b)?.elo || 1000) - (getStats(a)?.elo || 1000);
    })[0];
}

function startDraft(players) {

    const [team1, team2] = makeBalancedTeams(players);

    const captain1 = getCaptain(team1);
    const captain2 = getCaptain(team2);

    currentDraft = {
        team1,
        team2,
        captain1,
        captain2,
        phase: "waiting"
    };

    return currentDraft;
}

function getCurrentDraft() {
    return currentDraft;
}

function resetDraft() {
    currentDraft = null;
}

module.exports = {
    startDraft,
    getCurrentDraft,
    resetDraft
};