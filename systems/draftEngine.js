const { getStats } = require("./eloSystem");

// ============================
// CHAMPIONS LIST
// ============================

const champions = {
    melee: [
        "Bakko","Croak","Freya","Jamila",
        "Raigon","Rook","Ruh'kaan","Shifu Thorn"
    ],
    range: [
        "Alysia","Ashka","Destiny","Ezmo",
        "Iva","Jade","Jumong","Shen Rao",
        "Taya","Varesh"
    ],
    support: [
        "Blossom","Lucie","Oldur","Peal",
        "Pestilus","Poloma","Sirius","Ulric","Zander"
    ]
};

let bannedChampions = [];
let currentDraft = null;

// ============================
// TEAM BALANCING
// ============================

function averageElo(team) {
    if (team.length === 0) return 1000;

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

// ============================
// DRAFT START
// ============================

function startDraft(players) {

    const [team1, team2] = makeBalancedTeams(players);

    const captain1 = getCaptain(team1);
    const captain2 = getCaptain(team2);

    currentDraft = {
        team1,
        team2,
        captain1,
        captain2,
        phase: "ban-phase"
    };

    bannedChampions = [];

    return currentDraft;
}

function getCurrentDraft() {
    return currentDraft;
}

function resetDraft() {
    currentDraft = null;
    bannedChampions = [];
}

// ============================
// BAN SYSTEM
// ============================

function getChampions() {
    return champions;
}

function banChampion(name) {
    if (!bannedChampions.includes(name)) {
        bannedChampions.push(name);
    }
}

function getBannedChampions() {
    return bannedChampions;
}

function resetBans() {
    bannedChampions = [];
}

// ============================
// EXPORTS
// ============================

module.exports = {
    startDraft,
    getCurrentDraft,
    resetDraft,
    getChampions,
    banChampion,
    getBannedChampions,
    resetBans
};