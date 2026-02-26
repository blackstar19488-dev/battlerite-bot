// COMPETITIVE DRAFT ENGINE

const { getStats } = require("./eloSystem");

const champions = [
    "Bakko","Croak","Freya","Jamila","Raigon","Rook","Ruh'kaan","Shifu Thorn",
    "Alysia","Ashka","Destiny","Ezmo","Iva","Jade","Jumong","Shen Rao","Taya","Varesh",
    "Blossom","Lucie","Oldur","Peal","Pestilus","Poloma","Sirius","Ulric","Zander"
];

let draft = null;

/* ======================
   TEAM BALANCE
====================== */

function makeBalancedTeams(players) {
    const sorted = [...players].sort((a,b)=> (getStats(b)?.elo||1000)-(getStats(a)?.elo||1000));
    const team1 = [];
    const team2 = [];

    sorted.forEach((p,i)=>{
        if(i%2===0) team1.push(p);
        else team2.push(p);
    });

    return [team1,team2];
}

function getCaptain(team){
    return team.sort((a,b)=> (getStats(b)?.elo||1000)-(getStats(a)?.elo||1000))[0];
}

/* ======================
   START DRAFT
====================== */

function startDraft(players){

    const [team1,team2] = makeBalancedTeams(players);

    const captain1 = getCaptain(team1);
    const captain2 = getCaptain(team2);

    draft = {
        team1,
        team2,
        captain1,
        captain2,
        bans:[],
        picks:{},
        phase:"ban1",
        turn: captain1
    };

    return draft;
}

function getDraft(){
    return draft;
}

function resetDraft(){
    draft=null;
}

/* ======================
   DRAFT FLOW
====================== */

function getAvailableChampions(){
    if(!draft) return [];
    return champions.filter(c => 
        !draft.bans.includes(c) && !draft.picks[c]
    );
}

function banChampion(champ){
    if(!draft) return;
    draft.bans.push(champ);
}

function pickChampion(champ){
    if(!draft) return;
    draft.picks[champ]=draft.turn;
}

function nextPhase(){

    if(!draft) return;

    switch(draft.phase){

        case "ban1":
            draft.phase="ban2";
            draft.turn=draft.captain2;
            break;

        case "ban2":
            draft.phase="pick1";
            draft.turn=draft.captain1;
            break;

        case "pick1":
            draft.phase="pick2a";
            draft.turn=draft.captain2;
            break;

        case "pick2a":
            draft.phase="pick2b";
            draft.turn=draft.captain2;
            break;

        case "pick2b":
            draft.phase="pick3a";
            draft.turn=draft.captain1;
            break;

        case "pick3a":
            draft.phase="pick3b";
            draft.turn=draft.captain1;
            break;

        case "pick3b":
            draft.phase="pick4";
            draft.turn=draft.captain2;
            break;

        case "pick4":
            draft.phase="finished";
            break;
    }

    return draft.phase;
}

module.exports = {
    startDraft,
    getDraft,
    resetDraft,
    getAvailableChampions,
    banChampion,
    pickChampion,
    nextPhase
};