process.on("unhandledRejection", (err) => log("ERROR", err));
process.on("uncaughtException",  (err) => log("ERROR", err));
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const fs = require("fs");
function log(level, ...args) { console.log(`[${new Date().toISOString()}] [${level}]`, ...args); }

const client = new Client({ intents: [
  GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildVoiceStates
] });

// ─── DATA PATHS ──────────────────────────────────────────────────────
const DATA_DIR = "/data";
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {} }
const useDD = fs.existsSync(DATA_DIR);
const p = (f) => useDD ? `${DATA_DIR}/${f}` : `./${f}`;
const statsFile=p("stats.json"), backupFile=p("stats.backup.json"), historyFile=p("history.json"), seasonFile=p("season.json"), bannedFile=p("banned.json");
const proStatsFile=p("stats-pro.json"), proBackupFile=p("stats-pro.backup.json"), proHistoryFile=p("history-pro.json"), proSeasonFile=p("season-pro.json");

// ─── STATS ───────────────────────────────────────────────────────────
let stats = fs.existsSync(statsFile) ? JSON.parse(fs.readFileSync(statsFile)) : {};
let matchHistory = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile)) : [];
let season = fs.existsSync(seasonFile) ? JSON.parse(fs.readFileSync(seasonFile)) : { startDate: new Date().toISOString(), matchCount: 0 };
let proStats = fs.existsSync(proStatsFile) ? JSON.parse(fs.readFileSync(proStatsFile)) : {};
let proMatchHistory = fs.existsSync(proHistoryFile) ? JSON.parse(fs.readFileSync(proHistoryFile)) : [];
let proSeason = fs.existsSync(proSeasonFile) ? JSON.parse(fs.readFileSync(proSeasonFile)) : { startDate: new Date().toISOString(), matchCount: 0 };
let bannedPlayers = new Set(fs.existsSync(bannedFile) ? JSON.parse(fs.readFileSync(bannedFile)) : []);
const placementFile = p("placement.json");
let placementPlayers = new Set(fs.existsSync(placementFile) ? JSON.parse(fs.readFileSync(placementFile)) : []);
async function savePlacement(){try{await fs.promises.writeFile(placementFile,JSON.stringify([...placementPlayers]));}catch(e){}}

// ─── PRO ACTIVITY & AFK TRACKING ─────────────────────────────────────
const proActivityFile = p("pro-activity.json");
let proActivity = fs.existsSync(proActivityFile) ? JSON.parse(fs.readFileSync(proActivityFile)) : {}; // {playerId: {lastGame:ts, decayCount:N, afks:[ts1,ts2,...]}}
async function saveProActivity(){try{await fs.promises.writeFile(proActivityFile,JSON.stringify(proActivity,null,2));}catch(e){}}
function ensureProActivity(id){if(!proActivity[id])proActivity[id]={lastGame:Date.now(),decayCount:0,afks:[]};}

// Save helpers
let _saveTimer=null,_saving=false,_proSaveTimer=null,_proSaving=false;
function saveStats(){if(_saveTimer)clearTimeout(_saveTimer);_saveTimer=setTimeout(async()=>{await _doSave();},500);}
async function saveStatsNow(){if(_saveTimer)clearTimeout(_saveTimer);await _doSave();}
async function _doSave(){if(_saving)return;_saving=true;try{await fs.promises.writeFile(statsFile,JSON.stringify(stats,null,2));}catch(e){log("ERROR","save stats:",e);}_saving=false;}
async function saveHistory(){try{await fs.promises.writeFile(historyFile,JSON.stringify(matchHistory,null,2));}catch(e){}}
async function saveSeason(){try{await fs.promises.writeFile(seasonFile,JSON.stringify(season,null,2));}catch(e){}}
function saveProStats(){if(_proSaveTimer)clearTimeout(_proSaveTimer);_proSaveTimer=setTimeout(async()=>{await _doProSave();},500);}
async function saveProStatsNow(){if(_proSaveTimer)clearTimeout(_proSaveTimer);await _doProSave();}
async function _doProSave(){if(_proSaving)return;_proSaving=true;try{await fs.promises.writeFile(proStatsFile,JSON.stringify(proStats,null,2));}catch(e){log("ERROR","save pro:",e);}_proSaving=false;}
async function saveProHistory(){try{await fs.promises.writeFile(proHistoryFile,JSON.stringify(proMatchHistory,null,2));}catch(e){}}
async function saveProSeason(){try{await fs.promises.writeFile(proSeasonFile,JSON.stringify(proSeason,null,2));}catch(e){}}
async function saveBanned(){try{await fs.promises.writeFile(bannedFile,JSON.stringify([...bannedPlayers]));}catch(e){}}

const defaultStats = () => ({ elo:1000,mmr:1000,wins:0,losses:0,games:0,bestStreak:0,currentStreak:0,peakElo:1000,betWins:0,betLosses:0,betStreak:0,bestBetStreak:0,betScore:0,clutchWins:0 });
const defaultProStats = () => ({ elo:1000,mmr:1000,wins:0,losses:0,games:0,bestStreak:0,currentStreak:0,peakElo:1000,clutchWins:0 });

function ensurePlayer(id) {
  if (!stats[id]) { stats[id] = defaultStats(); saveStats(); }
  const s = stats[id];
  if (s.mmr===undefined) s.mmr=s.elo;
  if (s.bestStreak===undefined) s.bestStreak=0;
  if (s.currentStreak===undefined) s.currentStreak=0;
  if (s.peakElo===undefined) s.peakElo=s.elo;
  if (s.betWins===undefined) s.betWins=0;
  if (s.betLosses===undefined) s.betLosses=0;
  if (s.betStreak===undefined) s.betStreak=0;
  if (s.bestBetStreak===undefined) s.bestBetStreak=0;
  if (s.betScore===undefined) s.betScore=0;
  if (s.clutchWins===undefined) s.clutchWins=0;
  const cs=(s.betWins||0)-(s.betLosses||0);
  if(s.betScore!==cs) s.betScore=cs;
}

function ensureProPlayer(id) {
  if (!proStats[id]) {
    let e=1000;
    if(stats[id]){if(stats[id].elo>1050)e=1050;else if(stats[id].elo>=1000)e=1020;else e=1000;}
    proStats[id] = { elo:e,mmr:e,wins:0,losses:0,games:0,bestStreak:0,currentStreak:0,peakElo:e,clutchWins:0 };
    saveProStats();
  }
  const s=proStats[id];
  if(s.mmr===undefined)s.mmr=s.elo;
  if(s.peakElo===undefined)s.peakElo=s.elo;
  if(s.bestStreak===undefined)s.bestStreak=0;
  if(s.currentStreak===undefined)s.currentStreak=0;
  if(s.clutchWins===undefined)s.clutchWins=0;
}

// ─── MODE HELPER ─────────────────────────────────────────────────────
function M(isPro) {
  return {
    isPro, stats: isPro?proStats:stats, history: isPro?proMatchHistory:matchHistory,
    season: isPro?proSeason:season, ensure: isPro?ensureProPlayer:ensurePlayer,
    save: isPro?saveProStatsNow:saveStatsNow, saveHist: isPro?saveProHistory:saveHistory,
    saveSeas: isPro?saveProSeason:saveSeason, lobbies: isPro?proLobbies:lobbies,
    tag: isPro?" Pro":"", prefix: isPro?"P":"L",
    color: isPro?0x8B0000:0x5865F2, resultColor: isPro?0xDAA520:0xFEE75C,
    histCh: isPro?"history-match-pro":"history-match-lobbyelo",
    genCh: isPro?"general-pro-chat":"general-chat-elb",
    qCh: isPro?"queue-elb-pro":"queue-lobby-elo",
    ladCh: isPro?"top-20-ladder-pro":"top-20-ladder",
  };
}

// ─── CONFIG ──────────────────────────────────────────────────────────
const CHAMP_CATEGORIES = {
  "⚔️ Melee":["Bakko","Croak","Freya","Jamila","Raigon","Rook","RuhKaan","Shifu","Thorn"],
  "🏹 Range":["Alysia","Ashka","Destiny","Ezmo","Iva","Jade","Jumong","ShenRao","Taya","Varesh"],
  "💚 Support":["Blossom","Lucie","Oldur","Pearl","Pestilus","Poloma","Sirius","Ulric","Zander"]
};
const CHAMPS=Object.values(CHAMP_CATEGORIES).flat();
const DRAFT_TIMER=75, LOBBY_TIMEOUT=200, MAX_LOBBIES=3, CANCEL_VOTES=4;
const ADMIN_IDS=["341553327412346880","279249193195929601"];
const MAPS=["Blackstone Arena Day","Dragon Garden Night","Mount Araz Night"];
// Pro weights: Mount Araz -10% relative to the others
// Normal: 33/33/33. Pro: Blackstone 36.67, Dragon 36.67, Mount Araz 26.67 (~-10%)
function pickMap(isPro){
  if(!isPro)return MAPS[Math.floor(Math.random()*MAPS.length)];
  // Weighted: Blackstone=1, Dragon=1, Mount Araz=0.73 (10% less)
  const weights=[1,1,0.73],total=weights.reduce((a,b)=>a+b,0);
  let r=Math.random()*total;
  for(let i=0;i<MAPS.length;i++){r-=weights[i];if(r<=0)return MAPS[i];}
  return MAPS[0];
}
const DRAFT_SEQ=[
  {type:"ban",team:"A",global:true},{type:"ban",team:"B",global:true},
  {type:"ban",team:"A",global:false},{type:"ban",team:"B",global:false},
  {type:"pick",team:"A"},{type:"pick",team:"B"},
  {type:"pick",team:"B"},{type:"pick",team:"A"},
  {type:"ban",team:"B",global:false},{type:"ban",team:"A",global:false},
  {type:"pick",team:"A"},{type:"pick",team:"B"},
];

const CHAMP_EMOJIS={"Bakko":"<:br_bakko:1487982030846300262>","Croak":"<:br_croak:1487986958314639522>","Freya":"<:br_freya:1487989636738580550>","Jamila":"<:br_jamila:1487989574163501086>","Raigon":"<:br_raigon:1487989416344551444>","Rook":"<:br_rook:1487989394760663040>","RuhKaan":"<:br_ruhkaan:1487989373327904900>","Shifu":"<:br_shifu:1487989321502953482>","Thorn":"<:br_thorn:1487989266343661759>","Alysia":"<:br_alysia:1487986771634556998>","Ashka":"<:br_ashka:1487986842232950927>","Destiny":"<:br_destiny:1487987038518120528>","Ezmo":"<:br_ezmo:1487989656225186002>","Iva":"<:br_iva:1487989609173352479>","Jade":"<:br_jade:1487989589640609862>","Jumong":"<:br_jumong:1487989551652667582>","ShenRao":"<:br_shenrao:1487989343929892894>","Taya":"<:br_taya:1487989283611742348>","Varesh":"<:br_varesh:1487989222882283551>","Blossom":"<:br_blossom:1487986904589668382>","Lucie":"<:br_lucie:1487989530563706992>","Oldur":"<:br_oldur:1487989510682837093>","Pearl":"<:br_pearl:1487989489409458177>","Pestilus":"<:br_pestilus:1487989472191709234>","Poloma":"<:br_poloma:1487989438784082001>","Sirius":"<:br_sirius:1487989302515335450>","Ulric":"<:br_ulric:1487989243664928919>","Zander":"<:br_zander:1487989197817249845>"};
function champEmoji(n){return CHAMP_EMOJIS[n]||"";}
function champDisplay(n){return CHAMP_EMOJIS[n]?`${CHAMP_EMOJIS[n]} **${n}**`:`**${n}**`;}
function champBanDisplay(n,g){const e=CHAMP_EMOJIS[n]||"";return `${e} ~~${n}~~${g?" *(global)*":""}`;}
function champEmojiId(n){const m=(CHAMP_EMOJIS[n]||"").match(/<:\w+:(\d+)>/);return m?m[1]:null;}

// ─── ROLES ───────────────────────────────────────────────────────────
let inQueueRole=null, inGameRole=null;
async function ensureRoles(guild) {
  if(!guild)return;
  inQueueRole=guild.roles.cache.find(r=>r.name==="IN QUEUE");
  if(!inQueueRole){inQueueRole=await guild.roles.create({name:"IN QUEUE",color:0x57F287,hoist:true,mentionable:false}).catch(()=>null);}
  inGameRole=guild.roles.cache.find(r=>r.name==="IN GAME");
  if(!inGameRole){inGameRole=await guild.roles.create({name:"IN GAME",color:0xED4245,hoist:true,mentionable:false}).catch(()=>null);}
}
async function addRole(g,u,r){if(!r||!g)return;const m=await g.members.fetch(u).catch(()=>null);if(m)await m.roles.add(r).catch(()=>{});}
async function removeRole(g,u,r){if(!r||!g)return;const m=await g.members.fetch(u).catch(()=>null);if(m&&m.roles.cache.has(r.id))await m.roles.remove(r).catch(()=>{});}

// ─── STATE ───────────────────────────────────────────────────────────
let queue=[],proQueue=[],_queueLock=false,_proQueueLock=false;
const proQueueJoinTime={}; // {playerId: timestamp} for 1h auto-leave

// ─── DODGE SYSTEM (Pro only) ─────────────────────────────────────────
const DODGE_PROTECTED_ID="110378344192675840"; // Gerninja - cannot be dodged
const PRIORITY_USER_ID="341553327412346880"; // Silent priority — never excluded from Pro matches due to dodge conflicts
const dodgeFile=p("dodge.json");
let dodges=fs.existsSync(dodgeFile)?JSON.parse(fs.readFileSync(dodgeFile)):{}; // {userId: [dodgedId1, dodgedId2, ...]}
async function saveDodges(){try{await fs.promises.writeFile(dodgeFile,JSON.stringify(dodges,null,2));}catch(e){log("ERROR","saveDodges:",e);}}
function getDodgeCount(playerId){
  // How many users have dodged this player
  let count=0;
  for(const uid of Object.keys(dodges))if((dodges[uid]||[]).includes(playerId))count++;
  return count;
}
function getAllDodgedInPro(){
  // Returns set of playerIds who appear in proQueue and have at least 1 dodge against them
  const result=new Set();
  for(const id of proQueue)if(getDodgeCount(id)>0)result.add(id);
  return result;
}
function findValidScrimGroup(){
  // Find 6 players in proQueue where no one dodges another in the group
  // Returns the array of 6 player IDs that can form a match, or null if impossible
  if(proQueue.length<6)return null;
  // Check for dodge conflict — PRIORITY_USER_ID never conflicts (silent priority)
  const hasConflict=(a,b)=>{
    if(a===PRIORITY_USER_ID||b===PRIORITY_USER_ID)return false;
    return (dodges[a]||[]).includes(b)||(dodges[b]||[]).includes(a);
  };
  const tryGreedy=(startList)=>{
    const selected=[];
    for(const id of startList){
      if(selected.length>=6)break;
      let conflict=false;
      for(const sel of selected){
        if(hasConflict(id,sel)){conflict=true;break;}
      }
      if(!conflict)selected.push(id);
    }
    return selected.length===6?selected:null;
  };
  // If priority user is in queue, always try with them FIRST
  if(proQueue.includes(PRIORITY_USER_ID)){
    const rest=proQueue.filter(id=>id!==PRIORITY_USER_ID);
    let result=tryGreedy([PRIORITY_USER_ID,...rest]);
    if(result)return result;
  }
  // Try original order first
  let result=tryGreedy(proQueue);
  if(result)return result;
  // Try non-dodged first (less conflicts likely)
  const dodgedSet=getAllDodgedInPro();
  const nonDodged=proQueue.filter(id=>!dodgedSet.has(id));
  const dodged=proQueue.filter(id=>dodgedSet.has(id));
  // Priority user comes first even if technically dodged
  if(proQueue.includes(PRIORITY_USER_ID)){
    const others=[...nonDodged,...dodged].filter(id=>id!==PRIORITY_USER_ID);
    result=tryGreedy([PRIORITY_USER_ID,...others]);
    if(result)return result;
  }
  result=tryGreedy([...nonDodged,...dodged]);
  return result;
}

// ─── SCRIM SYSTEM (dynamic lobbies) ──────────────────────────────────
const RAY_ID="245671110744473600";
const MAX_SCRIM_LOBBIES=5;
const scrimFile=p("scrim.json");
// New state: array of lobbies + createButton message id
let scrim=fs.existsSync(scrimFile)?JSON.parse(fs.readFileSync(scrimFile)):{
  lobbies:[], // array of {id, creatorId, roleId, dateStr, timeStr, teamA, teamB, messageId, status, replays, drafts}
  createBtnMsgId:null,
  archivedCount:0
};
// Default fields:
// id: hex string "A3F7"
// creatorId: discord user id
// roleId: discord role id "Admin Lobby #A3F7"
// dateStr: "DD/MM" or null
// timeStr: "HH:MM" or null
// teamA, teamB: arrays of ids (max 3 each)
// messageId: id of main message in ray-scrim-queue
// status: "open" (accepting joins) | "ready" (6/6, waiting for time) | "validated" (time reached, match in progress) | "archived"
// replays: array of url strings
// drafts: array of image urls (uploaded screenshots)
async function saveScrim(){try{await fs.promises.writeFile(scrimFile,JSON.stringify(scrim,null,2));}catch(e){log("ERROR","saveScrim:",e);}}
function generateScrimId(){return Math.random().toString(16).slice(2,6).toUpperCase();}
function findScrim(id){return scrim.lobbies.find(l=>l.id===id);}
function activeScrims(){return scrim.lobbies.filter(l=>l.status!=="archived");}
// Migrate: ensure all lobbies have a captains array
for(const _l of scrim.lobbies){if(!Array.isArray(_l.captains))_l.captains=[];}
// Central auth check for scrim actions: Ray + server admins + lobby creator + lobby captains
function isScrimAuthorized(userId,lobby){
  if(!lobby)return false;
  if(userId===RAY_ID||ADMIN_IDS.includes(userId))return true;
  if(userId===lobby.creatorId)return true;
  if(Array.isArray(lobby.captains)&&lobby.captains.includes(userId))return true;
  return false;
}
let _proPlacementDelay=null; // {timeout, channel, startTime}
const queueMessages={},proQueueMessages={};
let ladderMsg=null,ladderChannel=null,betLadderMsg=null,betLadderChannel=null,proLadderMsg=null,proLadderChannel=null;
const lobbies=new Map(),proLobbies=new Map();

function createLobby(lobbyId,isPro=false) {
  const off=(lobbyId-1)*2;
  return {
    lobbyId,isPro,teamNumA:off+1,teamNumB:off+2,
    active:false,phase:null,expected:[],teamA:[],teamB:[],captains:[],
    captainA:null,captainB:null,draftStep:0,available:[...CHAMPS],globalBans:[],
    bans:{A:[],B:[]},picks:{A:[],B:[]},votes:{A:new Set(),B:new Set()},cancelVotes:new Set(),
    channel:null,draftChannel:null,chatA:null,chatB:null,
    lobbyVoice:null,category:null,voiceA:null,voiceB:null,
    boardMsg:null,announceMsg:null,lobbyPingMsg:null,activeCategory:null,
    timerInterval:null,timerTimeout:null,timerSeconds:DRAFT_TIMER,lobbyTimeout:null,
    map:null,bets:{A:[],B:[]},betMsg:null,betsClosed:false,betTimeout:null,
    _boardQueue:Promise.resolve()
  };
}

function getFreeLobbySlot(lm){for(let i=1;i<=3;i++)if(!lm.has(i))return i;return null;}
function allSlotsActive(lm){return lm.has(1)&&lm.has(2)&&lm.has(3);}

// Trigger lobby start for a queue — handles placement delay for pro
function tryStartLobby(channel,isPro){
  const q=isPro?proQueue:queue;
  const lm=isPro?proLobbies:lobbies;
  if(q.length<6)return;
  const slot=getFreeLobbySlot(lm);
  if(!slot)return;

  // For pro: check dodge conflicts AND placement priority
  if(isPro){
    // 1. Try to find a valid group of 6 with NO mutual dodge conflicts
    const validGroup=findValidScrimGroup();
    if(!validGroup){
      // No valid group exists — wait for a new player to arrive
      log("INFO","Pro queue: no valid group of 6 (dodge conflicts), waiting...");
      return;
    }

    // 2. Apply placement priority within the valid group
    const placementsInGroup=validGroup.filter(id=>placementPlayers.has(id));
    if(placementsInGroup.length>0){
      // Try to find a valid group of 6 NON-placement players first
      const nonPlacementOnly=q.filter(id=>!placementPlayers.has(id));
      if(nonPlacementOnly.length>=6){
        // Try to form a valid non-placement group
        const tryNonPlacement=()=>{
          const sel=[];
          for(const id of nonPlacementOnly){
            if(sel.length>=6)break;
            let conflict=false;
            for(const s of sel)if((dodges[id]||[]).includes(s)||(dodges[s]||[]).includes(id)){conflict=true;break;}
            if(!conflict)sel.push(id);
          }
          return sel.length===6?sel:null;
        };
        const npGroup=tryNonPlacement();
        if(npGroup){
          // Reorder queue: chosen 6 first, rest after (placements pushed to back)
          const newQ=[...npGroup,...q.filter(id=>!npGroup.includes(id))];
          proQueue.length=0;proQueue.push(...newQ);
          refreshQueue(channel,true).catch(()=>{});
          startLobby(channel,slot,true).catch(e=>log("ERROR","startLobby:",e));
          return;
        }
      }
      // Otherwise start 15s delay (if not already running)
      if(_proPlacementDelay)return;
      channel.send(`⏳ **Lobby ready with ${placementsInGroup.length} placement player(s)** — waiting 15 seconds for a non-placement player to join...`).catch(()=>{});
      _proPlacementDelay=setTimeout(async()=>{
        _proPlacementDelay=null;
        // Re-validate after delay
        const validG=findValidScrimGroup();
        if(!validG)return;
        const slot2=getFreeLobbySlot(proLobbies);
        if(!slot2)return;
        // Reorder so validG is at the front
        const newQ=[...validG,...proQueue.filter(id=>!validG.includes(id))];
        proQueue.length=0;proQueue.push(...newQ);
        startLobby(channel,slot2,true).catch(e=>log("ERROR","startLobby:",e));
      },15000);
      return;
    }
    // No placements but valid group → reorder and start
    const newQ=[...validGroup,...q.filter(id=>!validGroup.includes(id))];
    proQueue.length=0;proQueue.push(...newQ);
    startLobby(channel,slot,true).catch(e=>log("ERROR","startLobby:",e));
    return;
  }
  // Normal case (non-pro): start immediately
  startLobby(channel,slot,isPro).catch(e=>log("ERROR","startLobby:",e));
}
function findLobbyByDraftChannel(chId){
  for(const[,l]of lobbies)if(l.draftChannel&&l.draftChannel.id===chId)return l;
  for(const[,l]of proLobbies)if(l.draftChannel&&l.draftChannel.id===chId)return l;
  return null;
}
function findLobbyByPlayer(uid){
  for(const[,l]of lobbies)if(l.active&&(l.teamA.includes(uid)||l.teamB.includes(uid)))return l;
  for(const[,l]of proLobbies)if(l.active&&(l.teamA.includes(uid)||l.teamB.includes(uid)))return l;
  return null;
}
function findLobbyByExpected(uid){
  for(const[,l]of lobbies)if(l.active&&l.expected.includes(uid))return l;
  for(const[,l]of proLobbies)if(l.active&&l.expected.includes(uid))return l;
  return null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────
function stepOf(l){return DRAFT_SEQ[l.draftStep]??null;}
function captainOf(l){const s=stepOf(l);if(!s)return null;return s.team==="A"?l.captainA:l.captainB;}
function teamLabel(l,side){const t=l.isPro?" Pro":"";return side==="A"?`Team ${l.teamNumA}${t}`:`Team ${l.teamNumB}${t}`;}
function stopTimer(l){clearInterval(l.timerInterval);clearTimeout(l.timerTimeout);l.timerInterval=null;l.timerTimeout=null;}
function timerBar(sec){const f=Math.max(0,Math.round(sec/DRAFT_TIMER*15));const e=sec<=15?"🔴":sec<=35?"🟡":"🟢";return `${e} ${"▰".repeat(f)}${"▱".repeat(15-f)} **${sec}s**`;}
function progressBar(l){return DRAFT_SEQ.map((x,i)=>i<l.draftStep?(x.type==="ban"?"🔴":"🔵"):i===l.draftStep?"⚪":"▱").join("")+`  *${l.draftStep+1}/${DRAFT_SEQ.length}*`;}

// ─── ELO ─────────────────────────────────────────────────────────────
function calculateElo(pElo,oElo,won){
  const K=pElo<1200?30:20;
  const E=1/(1+Math.pow(10,(oElo-pElo)/400));
  let c=Math.round(K*(won?1-E:0-E));
  if(c===0)c=won?1:-1;
  return {newElo:Math.max(100,pElo+c),change:c};
}

function balance(players,st){
  players.forEach(id=>{if(!st[id])st[id]={elo:1000};});
  const combos=[];
  for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)for(let k=j+1;k<players.length;k++)combos.push([i,j,k]);
  let bd=Infinity,bA=[],bB=[];
  for(const[i,j,k]of combos){
    const A=[players[i],players[j],players[k]],B=players.filter((_,idx)=>![i,j,k].includes(idx));
    const d=Math.abs(A.reduce((s,id)=>s+(st[id]?.elo??1000),0)-B.reduce((s,id)=>s+(st[id]?.elo??1000),0));
    if(d<bd){bd=d;bA=A;bB=B;}
  }
  return {A:bA,B:bB};
}
function pickCaptain(team,st){return team.reduce((b,id)=>(st[id]?.elo??0)>(st[b]?.elo??0)?id:b,team[0]);}

// ─── LADDER EMBEDS ───────────────────────────────────────────────────
function ladderEmbed(st,seasonData,title,color){
  const players=Object.entries(st).filter(([,s])=>s.games>0).sort(([,a],[,b])=>b.elo-a.elo).slice(0,20);
  if(!players.length)return new EmbedBuilder().setTitle(title).setColor(color).setDescription("*No players ranked yet.*").setTimestamp();
  const medals=["🥇","🥈","🥉"];
  const lines=players.map(([id,s],i)=>{
    const wr=s.wins+s.losses===0?0:Math.round(s.wins/(s.wins+s.losses)*100);
    return i<3?`${medals[i]} **#${i+1} — <@${id}>**\n┣ \`${s.elo} ELO\`  •  \`${s.wins}W / ${s.losses}L\`  •  \`${wr}% WR\`  •  \`${s.games} games\`\n`
      :`**#${i+1}** — <@${id}>  •  \`${s.elo} ELO\`  •  \`${s.wins}W / ${s.losses}L\`  •  \`${wr}% WR\``;
  });
  const desc=lines.slice(0,3).join("\n")+(players.length>3?"\n**━━━━━━━━━━━━━━━━━━━━━━━━**\n"+lines.slice(3).join("\n"):"");
  return new EmbedBuilder().setTitle(title).setColor(color).setDescription(desc)
    .setFooter({text:`Season started ${new Date(seasonData.startDate).toLocaleDateString()} • ${seasonData.matchCount} matches played`}).setTimestamp();
}
function betLadderEmbed(){
  const players=Object.entries(stats).filter(([,s])=>(s.betWins||0)+(s.betLosses||0)>0)
    .map(([id,s])=>({id,bW:s.betWins||0,bL:s.betLosses||0,sc:s.betScore||0})).sort((a,b)=>b.sc-a.sc).slice(0,20);
  if(!players.length)return new EmbedBuilder().setTitle("🎰  LobbyELO — Top 20 Bettors").setColor(0xF1C40F).setDescription("*No bets yet.*").setTimestamp();
  const medals=["🥇","🥈","🥉"];
  const lines=players.map((p,i)=>{
    const wr=p.bW+p.bL===0?0:Math.round(p.bW/(p.bW+p.bL)*100);
    const t=i===0?" 🔮 **The Visionary**":"";
    return i<3?`${medals[i]} **#${i+1} — <@${p.id}>**${t}\n┣ \`${p.bW}W / ${p.bL}L\`  •  \`${wr}% WR\`  •  \`Score: ${p.sc}\`\n`
      :`**#${i+1}** — <@${p.id}>  •  \`${p.bW}W / ${p.bL}L\`  •  \`${wr}% WR\`  •  \`Score: ${p.sc}\``;
  });
  return new EmbedBuilder().setTitle("🎰  LobbyELO — Top 20 Bettors").setColor(0xF1C40F)
    .setDescription(lines.slice(0,3).join("\n")+(players.length>3?"\n**━━━━━━━━━━━━━━━━━━━━━━━━**\n"+lines.slice(3).join("\n"):""))
    .setFooter({text:"Score = +1 per win, -1 per loss • Top 1 = The Visionary 🔮"}).setTimestamp();
}

async function updateLadder(){
  if(!ladderChannel)return;
  try{const e=ladderEmbed(stats,season,"🏆  LobbyELO — Top 20 Ladder",0xFEE75C);
    if(ladderMsg){await ladderMsg.edit({embeds:[e]}).catch(async()=>{ladderMsg=await ladderChannel.send({embeds:[e]}).catch(()=>null);});}
    else{const ms=await ladderChannel.messages.fetch({limit:20});const ex=ms.find(m=>m.author.id===client.user.id&&m.embeds[0]?.title?.includes("Ladder"));
      if(ex){ladderMsg=ex;await ladderMsg.edit({embeds:[e]}).catch(()=>{});}else{ladderMsg=await ladderChannel.send({embeds:[e]}).catch(()=>null);}}
  }catch(e){log("WARN","updateLadder:",e);}
}
async function updateProLadder(){
  if(!proLadderChannel)return;
  try{const e=ladderEmbed(proStats,proSeason,"👑  PRO LADDER — Top 20 Elite",0xDAA520);
    if(proLadderMsg){await proLadderMsg.edit({embeds:[e]}).catch(async()=>{proLadderMsg=await proLadderChannel.send({embeds:[e]}).catch(()=>null);});}
    else{const ms=await proLadderChannel.messages.fetch({limit:20});const ex=ms.find(m=>m.author.id===client.user.id&&m.embeds[0]?.title?.includes("PRO"));
      if(ex){proLadderMsg=ex;await proLadderMsg.edit({embeds:[e]}).catch(()=>{});}else{proLadderMsg=await proLadderChannel.send({embeds:[e]}).catch(()=>null);}}
  }catch(e){log("WARN","updateProLadder:",e);}
}
async function updateBetLadder(){
  if(!betLadderChannel)return;
  try{const e=betLadderEmbed();
    if(betLadderMsg){await betLadderMsg.edit({embeds:[e]}).catch(async()=>{betLadderMsg=await betLadderChannel.send({embeds:[e]}).catch(()=>null);});}
    else{const ms=await betLadderChannel.messages.fetch({limit:20});const ex=ms.find(m=>m.author.id===client.user.id&&m.embeds[0]?.title?.includes("Bettors"));
      if(ex){betLadderMsg=ex;await betLadderMsg.edit({embeds:[e]}).catch(()=>{});}else{betLadderMsg=await betLadderChannel.send({embeds:[e]}).catch(()=>null);}}
  }catch(e){log("WARN","updateBetLadder:",e);}
}

// ─── QUEUE UI ────────────────────────────────────────────────────────
// ─── SCRIM LOBBY EMBED & BUTTONS ─────────────────────────────────────
function formatTime12h(timeStr){
  if(!timeStr||typeof timeStr!=="string")return timeStr||"";
  const m=timeStr.match(/^(\d{1,2}):(\d{2})$/);if(!m)return timeStr;
  let h=parseInt(m[1],10);const mm=m[2];if(isNaN(h)||h<0||h>23)return timeStr;
  const suf=h>=12?"PM":"AM";h=h%12;if(h===0)h=12;
  return `${h}:${mm} ${suf}`;
}
function parseTimeInput(str){
  if(!str||typeof str!=="string")return null;
  const s=str.trim().toUpperCase().replace(/\s+/g," ");
  let m=s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if(m){let h=parseInt(m[1],10);const mm=parseInt(m[2],10);
    if(h<1||h>12||mm<0||mm>59)return null;
    if(m[3]==="PM"&&h!==12)h+=12;if(m[3]==="AM"&&h===12)h=0;
    return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;}
  m=s.match(/^(\d{1,2}):(\d{2})$/);
  if(m){const h=parseInt(m[1],10),mm=parseInt(m[2],10);
    if(h<0||h>23||mm<0||mm>59)return null;
    return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;}
  return null;
}
function scrimUnixSeconds(lobby){
  if(!lobby.dateStr||!lobby.timeStr)return null;
  const dm=lobby.dateStr.split("/");if(dm.length!==2)return null;
  const day=parseInt(dm[0],10),mon=parseInt(dm[1],10);
  const hm=lobby.timeStr.split(":");if(hm.length!==2)return null;
  const hh=parseInt(hm[0],10),mm=parseInt(hm[1],10);
  if([day,mon,hh,mm].some(x=>isNaN(x)))return null;
  const nowParisParts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",year:"numeric"}).formatToParts(new Date());
  let year=parseInt(nowParisParts.find(p=>p.type==="year").value,10);
  const buildUnix=(y)=>{
    const wantAsUtc=Date.UTC(y,mon-1,day,hh,mm,0);
    let guess=wantAsUtc;
    for(let i=0;i<3;i++){
      const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date(guess));
      const pm={};parts.forEach(p=>pm[p.type]=p.value);
      const parisWallAsUtc=Date.UTC(parseInt(pm.year),parseInt(pm.month)-1,parseInt(pm.day),parseInt(pm.hour==="24"?"0":pm.hour),parseInt(pm.minute),0);
      const offset=parisWallAsUtc-guess;
      const next=wantAsUtc-offset;
      if(next===guess)break;
      guess=next;
    }
    return Math.floor(guess/1000);
  };
  let unix=buildUnix(year);
  const nowSec=Math.floor(Date.now()/1000);
  if(nowSec-unix>86400)unix=buildUnix(year+1);
  return unix;
}
function scrimTimestampStr(lobby){
  const u=scrimUnixSeconds(lobby);
  if(!u)return lobby.dateStr&&lobby.timeStr?`**${lobby.dateStr} — ${formatTime12h(lobby.timeStr)}**`:"*No date/time set*";
  return `<t:${u}:F> (<t:${u}:R>)`;
}
async function maybeAutoValidate(lobby,scrimChannel){
  if(lobby.status!=="open"&&lobby.status!=="ready")return false;
  if(lobby.teamA.length+lobby.teamB.length<6)return false;
  const u=scrimUnixSeconds(lobby);
  if(!u)return false;
  if(Math.floor(Date.now()/1000)<u)return false;
  lobby.status="validated";
  await saveScrim();
  if(scrimChannel)await updateScrimLobbyMessage(scrimChannel,lobby);
  const guild=scrimChannel?.guild;
  if(guild){
    const genCh=guild.channels.cache.find(c=>c.name==="general-scrim-chat"&&c.isTextBased());
    if(genCh){
      const all=[...lobby.teamA,...lobby.teamB];
      const embed=new EmbedBuilder().setTitle(`🎯  Scrim #${lobby.id} — Session starting!`).setColor(0x57F287)
        .setDescription(`📅 ${scrimTimestampStr(lobby)}\n\n**🔵 Team 1:**\n${lobby.teamA.map(id=>`<@${id}>`).join("\n")}\n\n**🔴 Team 2:**\n${lobby.teamB.map(id=>`<@${id}>`).join("\n")}`)
        .setTimestamp();
      await genCh.send({content:all.map(id=>`<@${id}>`).join(" "),embeds:[embed],allowedMentions:{users:all}}).catch(()=>{});
    }
  }
  return true;
}

function scrimLobbyEmbed(lobby){
  const captains=Array.isArray(lobby.captains)?lobby.captains:[];
  const slot=(id,n)=>{
    if(!id)return `\`${n}\`  *empty*`;
    const cr=captains.includes(id)?"👑 ":"";
    return `\`${n}\`  ${cr}<@${id}>`;
  };
  const t1=[slot(lobby.teamA[0],1),slot(lobby.teamA[1],2),slot(lobby.teamA[2],3)].join("\n\n");
  const t2=[slot(lobby.teamB[0],1),slot(lobby.teamB[1],2),slot(lobby.teamB[2],3)].join("\n\n");
  const total=lobby.teamA.length+lobby.teamB.length;
  const t1Count=lobby.teamA.length,t2Count=lobby.teamB.length;
  const whenStr=lobby.dateStr&&lobby.timeStr?`📅 ${scrimTimestampStr(lobby)}`:"📅 *No date/time set*";
  let title=`🎯  SCRIM #${lobby.id}`;
  let statusStr;
  if(lobby.status==="validated")statusStr=`✅ Session in progress`;
  else if(lobby.status==="ready")statusStr=`✅ 6/6 — Waiting for scheduled time`;
  else statusStr=`${total}/6 players`;
  const captainsLine=captains.length>0?`\n👑 **Captains:** ${captains.map(id=>`<@${id}>`).join(", ")}`:"";
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(lobby.status==="validated"?0x57F287:lobby.status==="ready"?0xF1C40F:0x5865F2)
    .setDescription(`${whenStr}\n👑 **Lobby Admin:** <@${lobby.creatorId}>${captainsLine}\n\n━━━━━━━━━━━━━━━━━━━━━━`)
    .addFields({name:`🔵 TEAM 1 — ${t1Count}/3`,value:t1,inline:true},{name:"\u200b",value:"\u200b",inline:true},{name:`🔴 TEAM 2 — ${t2Count}/3`,value:t2,inline:true})
    .setFooter({text:statusStr});
}
function scrimLobbyBtns(lobby){
  const t1Full=lobby.teamA.length>=3,t2Full=lobby.teamB.length>=3;
  const canJoin=lobby.status==="open"||lobby.status==="ready";
  const row1=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`scrim_${lobby.id}_joinA`).setLabel("🔵 Join Team 1").setStyle(ButtonStyle.Primary).setDisabled(t1Full||!canJoin),
    new ButtonBuilder().setCustomId(`scrim_${lobby.id}_joinB`).setLabel("🔴 Join Team 2").setStyle(ButtonStyle.Danger).setDisabled(t2Full||!canJoin),
    new ButtonBuilder().setCustomId(`scrim_${lobby.id}_leave`).setLabel("❌ Leave").setStyle(ButtonStyle.Secondary).setDisabled(lobby.status==="archived"||lobby.status==="validated"));
  const row2=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`scrim_${lobby.id}_setdate`).setLabel("📅 Set date/time").setStyle(ButtonStyle.Secondary).setDisabled(lobby.status!=="open"&&lobby.status!=="ready"));
  if(lobby.status==="validated"){
    row2.addComponents(
      new ButtonBuilder().setCustomId(`scrim_${lobby.id}_uploaddraft`).setLabel(`📸 Upload Draft ${(lobby.drafts||[]).length+1}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`scrim_${lobby.id}_end`).setLabel("🏁 End scrim session").setStyle(ButtonStyle.Success)
    );
  }
  return [row1,row2];
}
function createScrimBtnRow(){
  const disabled=activeScrims().length>=MAX_SCRIM_LOBBIES;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("scrim_create").setLabel(disabled?"🔒 Max 5 lobbies reached":"➕ Create new scrim").setStyle(ButtonStyle.Success).setDisabled(disabled));
}
async function refreshCreateScrimBtn(channel){
  try{
    const embed=new EmbedBuilder().setTitle("🎯  SCRIM HUB").setColor(0x57F287)
      .setDescription(`Click below to create a new scrim lobby. Max **${MAX_SCRIM_LOBBIES}** active lobbies at once.\n\n**Active lobbies:** ${activeScrims().length}/${MAX_SCRIM_LOBBIES}`);
    if(scrim.createBtnMsgId){
      const msg=await channel.messages.fetch(scrim.createBtnMsgId).catch(()=>null);
      if(msg){await msg.edit({embeds:[embed],components:[createScrimBtnRow()]}).catch(()=>{});return;}
    }
    const newMsg=await channel.send({embeds:[embed],components:[createScrimBtnRow()]}).catch(()=>null);
    if(newMsg){scrim.createBtnMsgId=newMsg.id;await saveScrim();}
  }catch(e){log("ERROR","refreshCreateScrimBtn:",e);}
}
async function updateScrimLobbyMessage(channel,lobby){
  try{
    if(!lobby.messageId)return;
    const msg=await channel.messages.fetch(lobby.messageId).catch(()=>null);
    if(msg)await msg.edit({embeds:[scrimLobbyEmbed(lobby)],components:scrimLobbyBtns(lobby)}).catch(()=>{});
  }catch(e){log("ERROR","updateScrimLobbyMessage:",e);}
}

// ─── SCRIM HISTORY EMBED & BUTTONS ───────────────────────────────────
function scrimHistoryEmbed(lobby){
  const whenStr=lobby.dateStr&&lobby.timeStr?`📅 ${scrimTimestampStr(lobby)}`:"📅 *No date/time*";
  const drafts=(lobby.drafts||[]).length>0?(lobby.drafts||[]).map((u,i)=>`[Draft ${i+1}](${u})`).join(" • "):"*No draft uploaded*";
  const replays=(lobby.replays||[]).length>0?`${(lobby.replays||[]).length} replay(s) available`:"*No replay uploaded*";
  const e=new EmbedBuilder().setTitle(`🏁  Scrim #${lobby.id} — Recap`).setColor(0x57F287)
    .setDescription(`${whenStr}\n\n👑 **Lobby Admin:** <@${lobby.creatorId}>`)
    .addFields(
      {name:"🔵 Team 1",value:lobby.teamA.map(id=>`<@${id}>`).join("\n")||"—",inline:true},
      {name:"\u200b",value:"\u200b",inline:true},
      {name:"🔴 Team 2",value:lobby.teamB.map(id=>`<@${id}>`).join("\n")||"—",inline:true},
      {name:"📸 Drafts",value:drafts,inline:false},
      {name:"📺 Replays",value:replays,inline:false}
    ).setTimestamp();
  if(lobby.drafts&&lobby.drafts[0])e.setImage(lobby.drafts[0]);
  return e;
}
function scrimHistoryBtns(lobby){
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`scrim_${lobby.id}_addreplay`).setLabel("➕ Add Replay").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`scrim_${lobby.id}_uploaddraft`).setLabel(`📸 Upload Draft ${(lobby.drafts||[]).length+1}`).setStyle(ButtonStyle.Secondary)
  )];
}

function queueEmbed(isPro){
  const m=M(isPro),lm=m.lobbies,q=isPro?proQueue:queue;
  const slot=getFreeLobbySlot(lm);
  const next=slot?`Lobby #${slot}${m.tag}`:null;
  const placementInQ=isPro?q.filter(id=>placementPlayers.has(id)).length:0;
  const dodgedInQ=isPro?q.filter(id=>getDodgeCount(id)>0).length:0;
  const totalSlots=6+placementInQ+dodgedInQ;
  const hasNonPriority=placementInQ>0||dodgedInQ>0;

  if(isPro){
    // ESPORT Tournament Broadcast style for Pro Queue
    const ELB="<:ELBPRO:1496812452845977662>";
    const BANNER_URL="https://i.imgur.com/sU6QjlJ.jpeg";
    const bar="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
    let body;
    if(!next){
      body=`${bar}\n⏳  **All PRO lobbies in progress**\n${bar}`;
    }else if(q.length===0){
      body=`${bar}\n▶  **${next}**  ·  Queue Open\n${bar}\n\n*Empty queue — Click **Join** to enter the arena.*\n*Only players with the **Pro** role can queue.*\n\n${bar}\n   **0 / 6  PLAYERS READY**\n${bar}`;
    }else{
      const rows=q.map((id,i)=>{
        const isPlace=placementPlayers.has(id);
        const dCount=getDodgeCount(id);
        const elo=m.stats[id]?.elo??1000;
        const eloStr=`\`${String(elo).padStart(4," ")} ELO\``;
        const rank=`**${String(i+1).padStart(2,"0")}**`;
        let marker="";
        if(isPlace)marker="  🔴 *(non-priority)*";
        else if(dCount>0)marker=`  🚫 *(dodged ${dCount}x)*`;
        return `┃ ${rank}  <@${id}>${marker}  ·  ${eloStr}`;
      }).join("\n");
      const status=q.length>=6?"⚡  **MATCH READY**":`**${q.length} / ${totalSlots}  PLAYERS READY**`;
      body=`${bar}\n▶  **${next}**  ·  ${q.length>=6?"Lobby Starting":"Queue Open"}\n${bar}\n\n${rows}\n\n${bar}\n   ${status}${hasNonPriority?"   ·   *non-priority in queue*":""}\n${bar}`;
    }
    return new EmbedBuilder()
      .setColor(0x8B0000)
      .setAuthor({name:"BATTLERITE PRO · Tournament Mode"})
      .setTitle(`${ELB}  PRO QUEUE  ${ELB}`)
      .setDescription(body)
      .setThumbnail(BANNER_URL)
      .setFooter({text:"⚔️  Click JOIN to enter the arena"});
  }

  // Normal queue — unchanged visual
  const title=`⚔️ Battlerite 3v3 — Queue${next?` (${next})`:""}`;
  let desc;
  if(!next)desc=`*⏳ All lobbies are in progress. Please wait.*`;
  else if(q.length===0)desc="*Queue is empty — click **Join** to enter!*";
  else desc=q.map((id,i)=>{
    return `**${i+1}.** <@${id}> — \`${(m.stats[id]?.elo??1000)} ELO\``;
  }).join("\n");
  return new EmbedBuilder().setTitle(title).setColor(m.color).setDescription(desc).setFooter({text:`${q.length} / 6 players`});
}
function queueBtns(isPro,disabled=false){
  const lm=isPro?proLobbies:lobbies;const blocked=allSlotsActive(lm);const pre=isPro?"pq_":"q_";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(pre+"join").setLabel("✅  Join").setStyle(ButtonStyle.Success).setDisabled(disabled||blocked),
    new ButtonBuilder().setCustomId(pre+"leave").setLabel("❌  Leave").setStyle(ButtonStyle.Danger).setDisabled(disabled));
}
async function refreshQueue(channel,isPro,locked=false){
  return repushQueue(channel,isPro,locked);
}

// Delete ALL queue messages in the channel, then post ONE new queue message at the bottom
async function repushQueue(channel,isPro,locked=false){
  const msgs=isPro?proQueueMessages:queueMessages;
  // Delete every queue message in this channel (both tracked and orphan)
  try{
    const recent=await channel.messages.fetch({limit:50});
    const allQueueMsgs=recent.filter(m=>m.author.id===client.user.id&&m.embeds.length>0&&(m.embeds[0].title?.includes("QUEUE")||m.embeds[0].title?.includes("Queue")));
    for(const[,m]of allQueueMsgs)await m.delete().catch(()=>{});
  }catch(e){}
  delete msgs[channel.id];
  // Post the single new message
  msgs[channel.id]=await channel.send({embeds:[queueEmbed(isPro)],components:[queueBtns(isPro,locked)]});
}

// ─── DRAFT BOARD ─────────────────────────────────────────────────────
function boardEmbed(lobby){
  const s=stepOf(lobby);if(!s)return new EmbedBuilder().setTitle("Draft complete").setColor(0x57F287);
  const isBan=s.type==="ban",isG=isBan&&s.global,sec=lobby.timerSeconds,cap=captainOf(lobby),m=M(lobby.isPro);

  if(lobby.isPro){
    // ESPORT Tournament Broadcast style for Pro Draft
    const ELB="<:ELBPRO:1496812452845977662>";
    const bar="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
    const phaseLabel=isG?"GLOBAL BAN PHASE":isBan?"BAN PHASE":"PICK PHASE";
    const phaseEmoji=isG?"🌍":isBan?"🚫":"🎯";
    let action;
    if(isG)action=`🌍  **${teamLabel(lobby,s.team)} · GLOBAL BAN**\n     Captain <@${cap}>  ·  *removed for BOTH teams*`;
    else if(isBan)action=`🚫  **${teamLabel(lobby,s.team)} · BAN**\n     Captain <@${cap}>`;
    else action=`🎯  **${teamLabel(lobby,s.team)} · PICK**\n     Captain <@${cap}>`;
    const tA=lobby.teamA.map((id,i)=>{const cr=id===lobby.captainA?"👑 ":"   ";const pk=lobby.picks.A[i]?champDisplay(lobby.picks.A[i]):"`[ ? ]`";return `${cr}<@${id}>\n       ${pk}`;}).join("\n\n");
    const tB=lobby.teamB.map((id,i)=>{const cr=id===lobby.captainB?"👑 ":"   ";const pk=lobby.picks.B[i]?champDisplay(lobby.picks.B[i]):"`[ ? ]`";return `${cr}<@${id}>\n       ${pk}`;}).join("\n\n");
    const gB=lobby.globalBans.length>0?lobby.globalBans.map(c=>champBanDisplay(c,true)).join("  ·  "):"—";
    const rA=lobby.bans.A.length>0?lobby.bans.A.map(c=>champBanDisplay(c,false)).join("  ·  "):"—";
    const rB=lobby.bans.B.length>0?lobby.bans.B.map(c=>champBanDisplay(c,false)).join("  ·  "):"—";
    return new EmbedBuilder()
      .setColor(0x8B0000)
      .setAuthor({name:"BATTLERITE PRO · Tournament Mode"})
      .setTitle(`${ELB}  LOBBY #${lobby.lobbyId} PRO  ·  ${phaseLabel}  ${ELB}`)
      .setDescription(`${bar}\n🗺️  **Map:**  \`${lobby.map}\`\n${bar}\n\n${action}\n\n${timerBar(sec)}\n${progressBar(lobby)}`)
      .addFields(
        {name:`🔵  TEAM ${lobby.teamNumA}`,value:tA||"\u200b",inline:true},
        {name:"⚔️",value:"\u200b",inline:true},
        {name:`🔴  TEAM ${lobby.teamNumB}`,value:tB||"\u200b",inline:true},
        {name:"🌍  Global Bans",value:gB,inline:false},
        {name:"\u200b",value:`🚫 **T${lobby.teamNumA} Bans:** ${rA}   ┃   **T${lobby.teamNumB} Bans:** ${rB}`,inline:false}
      )
      .setFooter({text:"75s per step  ·  auto random on timeout  ·  !captain to claim"});
  }

  // Normal queue draft — unchanged visual
  let action;
  if(isG)action=`🌍 **${teamLabel(lobby,s.team)} must GLOBAL BAN** — Captain <@${cap}>\n*Removed for BOTH teams.*`;
  else if(isBan)action=`🚫 **${teamLabel(lobby,s.team)} must BAN** — Captain <@${cap}>`;
  else action=`🎯 **${teamLabel(lobby,s.team)} must PICK** — Captain <@${cap}>`;
  const tA=lobby.teamA.map((id,i)=>{const cr=id===lobby.captainA?"👑 ":"";const pk=lobby.picks.A[i]?champDisplay(lobby.picks.A[i]):"`[ ? ]`";return `${cr}<@${id}>\n${pk}`;}).join("\n\n");
  const tB=lobby.teamB.map((id,i)=>{const cr=id===lobby.captainB?"👑 ":"";const pk=lobby.picks.B[i]?champDisplay(lobby.picks.B[i]):"`[ ? ]`";return `${cr}<@${id}>\n${pk}`;}).join("\n\n");
  const gB=lobby.globalBans.length>0?lobby.globalBans.map(c=>champBanDisplay(c,true)).join(", "):"—";
  const rA=lobby.bans.A.length>0?lobby.bans.A.map(c=>champBanDisplay(c,false)).join(", "):"—";
  const rB=lobby.bans.B.length>0?lobby.bans.B.map(c=>champBanDisplay(c,false)).join(", "):"—";
  const title=isG?`🌍  LOBBY #${lobby.lobbyId} — Global Ban Phase`:isBan?`🚫  LOBBY #${lobby.lobbyId} — Ban Phase`:`🎯  LOBBY #${lobby.lobbyId} — Pick Phase`;
  const color=isG?0xE67E22:isBan?0xED4245:0x5865F2;
  return new EmbedBuilder().setTitle(title).setColor(color)
    .setDescription(`🗺️ **Map: ${lobby.map}**\n\n${action}\n\n${timerBar(sec)}\n${progressBar(lobby)}`)
    .addFields({name:`🔵 TEAM ${lobby.teamNumA}${m.tag}`,value:tA||"\u200b",inline:true},{name:"⚔️",value:"\u200b",inline:true},{name:`🔴 TEAM ${lobby.teamNumB}${m.tag}`,value:tB||"\u200b",inline:true})
    .addFields({name:"🌍 Global Bans",value:gB})
    .addFields({name:"\u200b",value:`🚫 **Bans T${lobby.teamNumA}:** ${rA}  ┃  **Bans T${lobby.teamNumB}:** ${rB}`})
    .setFooter({text:"75s per step • auto random on timeout • !captain to claim"});
}

// ─── DRAFT BUTTONS ───────────────────────────────────────────────────
function cancelBtnRow(l){const L=`${l.isPro?"P":"L"}${l.lobbyId}_`;return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(L+"cancel_match").setLabel(`❌ Cancel Match (${l.cancelVotes.size}/${CANCEL_VOTES})`).setStyle(ButtonStyle.Secondary));}
function categoryBtns(l){const s=stepOf(l),isBan=s?.type==="ban",L=`${l.isPro?"P":"L"}${l.lobbyId}_`,st=isBan?ButtonStyle.Danger:ButtonStyle.Success;
  return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(L+"cat_Melee").setLabel("⚔️ Melee").setStyle(st),new ButtonBuilder().setCustomId(L+"cat_Range").setLabel("🏹 Range").setStyle(st),new ButtonBuilder().setCustomId(L+"cat_Support").setLabel("💚 Support").setStyle(st)),cancelBtnRow(l)];}
function champBtnsForCat(l,catKey){
  const s=stepOf(l);if(!s)return [];
  const isBan=s.type==="ban",L=`${l.isPro?"P":"L"}${l.lobbyId}_`,prefix=isBan?L+"ban_":L+"pick_",style=isBan?ButtonStyle.Danger:ButtonStyle.Success;
  const fullKey=Object.keys(CHAMP_CATEGORIES).find(k=>k.includes(catKey));
  const myBans=s.team==="A"?l.bans.A:l.bans.B,oppBans=s.team==="A"?l.bans.B:l.bans.A,myPicks=l.picks[s.team];
  let avail;
  if(isBan)avail=(CHAMP_CATEGORIES[fullKey]||[]).filter(c=>!l.globalBans.includes(c)&&!myBans.includes(c));
  else avail=(CHAMP_CATEGORIES[fullKey]||[]).filter(c=>!oppBans.includes(c)&&!myPicks.includes(c)&&l.available.includes(c));
  const rows=[];
  for(let i=0;i<avail.length&&rows.length<3;i+=5){const row=new ActionRowBuilder();avail.slice(i,i+5).forEach(c=>{const btn=new ButtonBuilder().setCustomId(prefix+c).setLabel(c).setStyle(style);const eid=champEmojiId(c);if(eid)btn.setEmoji(eid);row.addComponents(btn);});rows.push(row);}
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(L+"cat_back").setLabel("◀️ Back").setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(L+"cancel_match").setLabel(`❌ Cancel (${l.cancelVotes.size}/${CANCEL_VOTES})`).setStyle(ButtonStyle.Secondary)));
  return rows;
}
function buildDraftButtons(l){return l.activeCategory?champBtnsForCat(l,l.activeCategory):categoryBtns(l);}
function pushBoard(l){if(!l.boardMsg)return;l._boardQueue=(l._boardQueue||Promise.resolve()).then(async()=>{if(!l.boardMsg)return;await l.boardMsg.edit({embeds:[boardEmbed(l)],components:buildDraftButtons(l)}).catch(()=>{});}).catch(()=>{});}

// ─── DRAFT TIMER ─────────────────────────────────────────────────────
async function startDraftStep(lobby){
  stopTimer(lobby);lobby.timerSeconds=DRAFT_TIMER;
  if(!lobby.boardMsg){lobby.boardMsg=await lobby.draftChannel.send({embeds:[boardEmbed(lobby)],components:buildDraftButtons(lobby)}).catch(()=>null);if(!lobby.boardMsg)return;}
  else await pushBoard(lobby);
  lobby.timerInterval=setInterval(async()=>{lobby.timerSeconds-=5;if(lobby.timerSeconds<=0){clearInterval(lobby.timerInterval);lobby.timerInterval=null;return;}await pushBoard(lobby);},5000);
  lobby.timerTimeout=setTimeout(async()=>{
    stopTimer(lobby);if(!lobby.active||lobby.phase!=="draft")return;
    const expectedStep=lobby.draftStep,s=stepOf(lobby);if(!s)return;
    const cap=captainOf(lobby),opp=s.team==="A"?"B":"A";
    if(s.type==="ban"){
      if(s.global){const pool=CHAMPS.filter(c=>!lobby.globalBans.includes(c));const ch=pool[Math.floor(Math.random()*pool.length)];lobby.globalBans.push(ch);lobby.available=lobby.available.filter(c=>c!==ch);
        await lobby.draftChannel.send(`⏱️ Time's up! ${champDisplay(ch)} was **GLOBAL BANNED** by ${teamLabel(lobby,s.team)} (<@${cap}>).`).catch(()=>{});
      }else{const pool=CHAMPS.filter(c=>!lobby.bans[s.team].includes(c)&&!lobby.globalBans.includes(c));const ch=pool[Math.floor(Math.random()*pool.length)];lobby.bans[s.team].push(ch);
        if(lobby.bans[opp].includes(ch))lobby.available=lobby.available.filter(c=>c!==ch);
        await lobby.draftChannel.send(`⏱️ Time's up! ${champDisplay(ch)} was **banned** for ${teamLabel(lobby,s.team)} (<@${cap}>).`).catch(()=>{});}
    }else{const oppBans=s.team==="A"?lobby.bans.B:lobby.bans.A,myPicks=lobby.picks[s.team];
      const pool=lobby.available.filter(c=>!oppBans.includes(c)&&!myPicks.includes(c));const ch=pool[Math.floor(Math.random()*pool.length)]??lobby.available[0];
      lobby.picks[s.team].push(ch);await lobby.draftChannel.send(`⏱️ Time's up! ${champDisplay(ch)} was **picked** for ${teamLabel(lobby,s.team)} (<@${cap}>).`).catch(()=>{});}
    if(lobby.draftStep===expectedStep)advanceDraft(lobby);
  },DRAFT_TIMER*1000);
}
function advanceDraft(lobby){stopTimer(lobby);lobby.activeCategory=null;lobby.draftStep++;if(lobby.draftStep>=DRAFT_SEQ.length){finishDraft(lobby).catch(e=>log("ERROR","finishDraft:",e));return;}startDraftStep(lobby).catch(e=>log("ERROR","startDraftStep:",e));}

// Champion spotlight — temporary 1.5s embed showing the champion pick/ban (Pro only)
async function championSpotlight(lobby,action,team,champ,actorId){
  if(!lobby.isPro||!lobby.draftChannel)return;
  try{
    const emoji=CHAMP_EMOJIS[champ]||"";
    const color=action==="GLOBAL BAN"?0xE67E22:action==="BAN"?0xED4245:0x57F287;
    const teamTag=team==="A"?`🔵 Team ${lobby.teamNumA}`:`🔴 Team ${lobby.teamNumB}`;
    const icon=action==="GLOBAL BAN"?"🌍":action==="BAN"?"🚫":"🎯";
    const embed=new EmbedBuilder()
      .setColor(color)
      .setDescription(`${icon}  **${action}**\n\n# ${emoji}\n# **${champ.toUpperCase()}**\n\nby <@${actorId}>  ·  ${teamTag}`);
    const spotMsg=await lobby.draftChannel.send({embeds:[embed]}).catch(()=>null);
    if(spotMsg)setTimeout(()=>{spotMsg.delete().catch(()=>{});},1500);
  }catch(e){log("ERROR","championSpotlight:",e);}
}

// ─── FINISH DRAFT ────────────────────────────────────────────────────
async function finishDraft(lobby){
  stopTimer(lobby);const m=M(lobby.isPro);
  const gB=lobby.globalBans.length>0?lobby.globalBans.map(c=>champBanDisplay(c,true)).join(", "):"—";
  const rA=lobby.bans.A.length>0?lobby.bans.A.map(c=>champBanDisplay(c,false)).join(", "):"—";
  const rB=lobby.bans.B.length>0?lobby.bans.B.map(c=>champBanDisplay(c,false)).join(", "):"—";
  let finalEmbed;
  if(lobby.isPro){
    const ELB="<:ELBPRO:1496812452845977662>";
    const bar="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
    const gBPro=lobby.globalBans.length>0?lobby.globalBans.map(c=>champBanDisplay(c,true)).join("  ·  "):"—";
    const rAPro=lobby.bans.A.length>0?lobby.bans.A.map(c=>champBanDisplay(c,false)).join("  ·  "):"—";
    const rBPro=lobby.bans.B.length>0?lobby.bans.B.map(c=>champBanDisplay(c,false)).join("  ·  "):"—";
    finalEmbed=new EmbedBuilder()
      .setColor(0xDAA520)
      .setAuthor({name:"BATTLERITE PRO · Tournament Mode"})
      .setTitle(`${ELB}  LOBBY #${lobby.lobbyId} PRO · DRAFT COMPLETE  ${ELB}`)
      .setDescription(`${bar}\n🗺️  **Map:**  \`${lobby.map}\`\n${bar}\n\n**FINAL ROSTER**`)
      .addFields(
        {name:`🔵  TEAM ${lobby.teamNumA}`,value:lobby.teamA.map((id,i)=>`<@${id}>\n       ${champDisplay(lobby.picks.A[i]??"?")}`).join("\n\n"),inline:true},
        {name:"⚔️",value:"\u200b",inline:true},
        {name:`🔴  TEAM ${lobby.teamNumB}`,value:lobby.teamB.map((id,i)=>`<@${id}>\n       ${champDisplay(lobby.picks.B[i]??"?")}`).join("\n\n"),inline:true},
        {name:"🌍  Global Bans",value:gBPro,inline:false},
        {name:"\u200b",value:`🚫 **T${lobby.teamNumA} Bans:** ${rAPro}   ┃   **T${lobby.teamNumB} Bans:** ${rBPro}`,inline:false},
        {name:"\u200b",value:"🏆  *3 votes needed to confirm the winner*",inline:false}
      )
      .setFooter({text:"Vote below to confirm the winner"});
  }else{
    finalEmbed=new EmbedBuilder().setTitle(`✅  LOBBY #${lobby.lobbyId} — Draft Complete!`).setColor(0x57F287)
      .setDescription(`**▬▬▬▬▬▬ FINAL RECAP ▬▬▬▬▬▬**\n\n🗺️ **Map: ${lobby.map}**\n\n🌍 **Global Bans:** ${gB}\n🚫 **Bans T${lobby.teamNumA}:** ${rA}\n🚫 **Bans T${lobby.teamNumB}:** ${rB}`)
      .addFields({name:`🔵 TEAM ${lobby.teamNumA}${m.tag}`,value:lobby.teamA.map((id,i)=>`<@${id}>\n${champDisplay(lobby.picks.A[i]??"?")}`).join("\n\n"),inline:true},{name:"\u200b",value:"\u200b",inline:true},{name:`🔴 TEAM ${lobby.teamNumB}${m.tag}`,value:lobby.teamB.map((id,i)=>`<@${id}>\n${champDisplay(lobby.picks.B[i]??"?")}`).join("\n\n"),inline:true})
      .addFields({name:"\u200b",value:"*3 votes needed to confirm the result.*"}).setFooter({text:"Vote below to confirm the winner."});
  }
  const L=`${lobby.isPro?"P":"L"}${lobby.lobbyId}_`;
  const row1=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(L+"voteA").setLabel(`🔵  Team ${lobby.teamNumA}${m.tag} Won`).setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(L+"voteB").setLabel(`🔴  Team ${lobby.teamNumB}${m.tag} Won`).setStyle(ButtonStyle.Danger));
  const rows=[row1,cancelBtnRow(lobby)];
  if(lobby.boardMsg)await lobby.boardMsg.edit({embeds:[finalEmbed],components:rows}).catch(async()=>{lobby.boardMsg=await lobby.draftChannel.send({embeds:[finalEmbed],components:rows}).catch(()=>null);});
  else lobby.boardMsg=await lobby.draftChannel.send({embeds:[finalEmbed],components:rows}).catch(()=>null);
  lobby.phase="vote";
  await lobby.draftChannel.send({content:`🎮 **Draft complete!** ${[...lobby.teamA,...lobby.teamB].map(id=>`<@${id}>`).join(" ")} — Go play **${lobby.map}**!`,allowedMentions:{users:[...lobby.teamA,...lobby.teamB]}}).catch(()=>{});
  // Post recap for bettors (normal in queue channel, pro in bet-pro)
  const recapEmbed=new EmbedBuilder().setTitle(`📋  ${lobby.isPro?"Pro ":""}Lobby #${lobby.lobbyId} — Draft Recap`).setColor(0x57F287)
    .setDescription(`🗺️ **Map: ${lobby.map}**\n\n🌍 **Global Bans:** ${gB}\n🚫 **Bans T${lobby.teamNumA}:** ${rA}\n🚫 **Bans T${lobby.teamNumB}:** ${rB}`)
    .addFields({name:`🔵 TEAM ${lobby.teamNumA}${m.tag}`,value:lobby.teamA.map((id,i)=>`<@${id}> — ${champDisplay(lobby.picks.A[i]??"?")}`).join("\n"),inline:true},{name:"\u200b",value:"\u200b",inline:true},{name:`🔴 TEAM ${lobby.teamNumB}${m.tag}`,value:lobby.teamB.map((id,i)=>`<@${id}> — ${champDisplay(lobby.picks.B[i]??"?")}`).join("\n"),inline:true})
    .setFooter({text:"Place your bets before they close!"});
  const guild=lobby.channel.guild;
  let betCh=lobby.channel;
  if(lobby.isPro){const bp=guild.channels.cache.find(c=>c.name==="bet-pro"&&c.isTextBased());if(bp)betCh=bp;}
  await betCh.send({embeds:[recapEmbed]}).catch(()=>{});
  // Close bets after 4m30
  lobby.betTimeout=setTimeout(async()=>{if(lobby.betsClosed)return;lobby.betsClosed=true;
    if(lobby.betMsg){const LL=`${lobby.isPro?"P":"L"}${lobby.lobbyId}_`;const cr=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(LL+"betA").setLabel("🔵 Bets closed").setStyle(ButtonStyle.Primary).setDisabled(true),new ButtonBuilder().setCustomId(LL+"betB").setLabel("🔴 Bets closed").setStyle(ButtonStyle.Danger).setDisabled(true));await lobby.betMsg.edit({components:[cr]}).catch(()=>{});}
    await betCh.send(`🎰 **${lobby.isPro?"Pro ":""}Lobby #${lobby.lobbyId}** — Bets are now closed!`).catch(()=>{});
  },270_000);
}

// ─── LOBBY CREATION ──────────────────────────────────────────────────
async function startLobby(channel,lobbyId,isPro=false){
  const m=M(isPro),q=isPro?proQueue:queue,lm=m.lobbies;
  const lobby=createLobby(lobbyId,isPro);
  lobby.active=true;lobby.phase="waiting";lobby.channel=channel;
  lobby.expected=q.splice(0,6);
  // Clear join timestamps for players entering the lobby
  if(isPro)for(const id of lobby.expected)delete proQueueJoinTime[id];
  // Remove these players from the OTHER queue too
  const otherQ=isPro?queue:proQueue;
  for(const id of lobby.expected){const idx=otherQ.indexOf(id);if(idx>=0)otherQ.splice(idx,1);}
  lm.set(lobbyId,lobby);
  const guild=channel.guild;
  for(const id of lobby.expected)await removeRole(guild,id,inQueueRole);
  await refreshQueue(channel,isPro,false).catch(()=>{});
  lobby.lobbyPingMsg=await channel.send({content:`🎮 **${isPro?"Pro ":""}Lobby #${lobbyId} — Queue full!** ${lobby.expected.map(id=>`<@${id}>`).join(" ")}\nJoin voice channel **🔊 ${isPro?"PRO ":""}LOBBY #${lobbyId} — JOIN** to start the match.`,allowedMentions:{users:lobby.expected}}).catch(()=>null);
  for(const id of lobby.expected){const mb=await guild.members.fetch(id).catch(()=>null);if(mb)await mb.send(`🎮 **${isPro?"Pro ":""}Lobby #${lobbyId} is ready!** Join the voice channel to start.`).catch(()=>{});}
  // Create lobby voice — pro: only Pro role can see
  const voicePerms=isPro?[
    {id:guild.roles.everyone,deny:[PermissionsBitField.Flags.ViewChannel]},
    ...lobby.expected.map(id=>({id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.Connect]}))
  ]:[];
  lobby.lobbyVoice=await guild.channels.create({name:`🔊 ${isPro?"PRO ":""}LOBBY #${lobbyId} — JOIN`,type:ChannelType.GuildVoice,...(isPro?{permissionOverwrites:voicePerms}:{})}).catch(()=>null);
  lobby.lobbyTimeout=setTimeout(async()=>{
    if(!lobby.active||lobby.phase!=="waiting")return;
    const inV=lobby.lobbyVoice?[...lobby.lobbyVoice.members.values()].map(m=>m.id):[];
    const missing=lobby.expected.filter(id=>!inV.includes(id)),present=lobby.expected.filter(id=>inV.includes(id));
    const toR=present.filter(id=>!q.includes(id));if(toR.length>0){if(isPro)proQueue=[...toR,...proQueue];else queue=[...toR,...queue];for(const id of toR)await addRole(guild,id,inQueueRole);}
    for(const id of missing)await removeRole(guild,id,inQueueRole);
    // AFK tracking (pro only)
    let afkPenaltyText="";
    if(isPro&&missing.length>0){
      const now=Date.now(),weekAgo=now-7*864e5;
      for(const id of missing){
        ensureProActivity(id);
        // Remove AFKs older than 7 days
        proActivity[id].afks=(proActivity[id].afks||[]).filter(ts=>ts>weekAgo);
        proActivity[id].afks.push(now);
        const afkCount=proActivity[id].afks.length;
        if(afkCount>2){
          // Apply -6 ELO penalty
          ensureProPlayer(id);
          proStats[id].elo=Math.max(100,proStats[id].elo-6);
          proStats[id].mmr=Math.max(100,proStats[id].mmr-6);
          afkPenaltyText+=`\n⚠️ <@${id}> AFK #${afkCount} this week → **-6 Pro ELO**`;
        }else{
          afkPenaltyText+=`\n⚠️ <@${id}> AFK #${afkCount}/2 this week (free, no penalty)`;
        }
      }
      await saveProActivity();await saveProStatsNow();await updateProLadder();
    }
    await channel.send(`⌛ **${isPro?"Pro ":""}Lobby #${lobbyId}** expired. Missing: ${missing.map(id=>`<@${id}>`).join(", ")}${present.length>0?`\n${present.map(id=>`<@${id}>`).join(", ")} have been re-added to the queue.`:""}${afkPenaltyText}`).catch(()=>{});
    await cleanupLobby(lobby);
  },LOBBY_TIMEOUT*1000);
}

// ─── VOICE LISTENER ──────────────────────────────────────────────────
client.on("voiceStateUpdate",async()=>{
  try{
    for(const[lid,lobby]of[...lobbies,...proLobbies]){
      if(!lobby.active||lobby.phase!=="waiting"||!lobby.lobbyVoice)continue;
      const lm=lobby.isPro?proLobbies:lobbies;if(!lm.has(lid))continue;
      try{const inV=[...lobby.lobbyVoice.members.values()].map(m=>m.id);
        if(lobby.expected.every(id=>inV.includes(id))&&inV.length>=6)startMatch(lobby).catch(e=>log("ERROR","startMatch:",e));
      }catch(e){}
    }
  }catch(e){log("ERROR","voiceState:",e);}
});

// ─── START MATCH ─────────────────────────────────────────────────────
async function startMatch(lobby){
  if(lobby.phase!=="waiting")return;const lm=lobby.isPro?proLobbies:lobbies;if(!lm.has(lobby.lobbyId))return;
  lobby.phase="starting";clearTimeout(lobby.lobbyTimeout);lobby.lobbyTimeout=null;
  const m=M(lobby.isPro),guild=lobby.channel.guild,st=m.stats;
  const{A,B}=balance(lobby.expected,st);lobby.teamA=A;lobby.teamB=B;
  lobby.captainA=pickCaptain(A,st);lobby.captainB=pickCaptain(B,st);
  for(const id of[...A,...B])await addRole(guild,id,inGameRole);
  lobby.category=await guild.channels.create({name:`⚔️ ${lobby.isPro?"PRO ":""}LOBBY #${lobby.lobbyId}`,type:ChannelType.GuildCategory});
  // Fetch valid admins
  const validAdmins=[];for(const id of ADMIN_IDS){if([...A,...B].includes(id))continue;const mb=await guild.members.fetch(id).catch(()=>null);if(mb)validAdmins.push(id);}
  // Draft channel — visible only to 6 players + admins
  lobby.draftChannel=await guild.channels.create({name:`📝-lobby-draft-${lobby.lobbyId}${lobby.isPro?"-pro":""}`,type:ChannelType.GuildText,parent:lobby.category.id,
    permissionOverwrites:[{id:guild.roles.everyone,deny:[PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ViewChannel]},
      ...lobby.expected.map(id=>({id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]})),
      ...validAdmins.map(id=>({id,allow:[PermissionsBitField.Flags.ViewChannel]})),
      {id:client.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ManageMessages]}]});
  // Team chats
  lobby.chatA=await guild.channels.create({name:`💬-team-${lobby.teamNumA}${m.tag.toLowerCase().replace(" ","-")}-chat`,type:ChannelType.GuildText,parent:lobby.category.id,
    permissionOverwrites:[{id:guild.roles.everyone,deny:[PermissionsBitField.Flags.ViewChannel]},...A.map(id=>({id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]})),...validAdmins.map(id=>({id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]})),{id:client.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]}]});
  lobby.chatB=await guild.channels.create({name:`💬-team-${lobby.teamNumB}${m.tag.toLowerCase().replace(" ","-")}-chat`,type:ChannelType.GuildText,parent:lobby.category.id,
    permissionOverwrites:[{id:guild.roles.everyone,deny:[PermissionsBitField.Flags.ViewChannel]},...B.map(id=>({id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]})),...validAdmins.map(id=>({id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]})),{id:client.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]}]});
  // Voice channels
  lobby.voiceA=await guild.channels.create({name:`🔵 Team ${lobby.teamNumA}${m.tag}`,type:ChannelType.GuildVoice,parent:lobby.category.id,permissionOverwrites:[{id:guild.roles.everyone,deny:[PermissionsBitField.Flags.Connect]},...A.map(id=>({id,allow:[PermissionsBitField.Flags.Connect]}))]});
  lobby.voiceB=await guild.channels.create({name:`🔴 Team ${lobby.teamNumB}${m.tag}`,type:ChannelType.GuildVoice,parent:lobby.category.id,permissionOverwrites:[{id:guild.roles.everyone,deny:[PermissionsBitField.Flags.Connect]},...B.map(id=>({id,allow:[PermissionsBitField.Flags.Connect]}))]});
  const lvId=lobby.lobbyVoice?.id??null;
  for(const id of A){const mb=await guild.members.fetch(id).catch(()=>null);if(mb&&lvId&&mb.voice.channelId===lvId)await mb.voice.setChannel(lobby.voiceA).catch(()=>{});}
  for(const id of B){const mb=await guild.members.fetch(id).catch(()=>null);if(mb&&lvId&&mb.voice.channelId===lvId)await mb.voice.setChannel(lobby.voiceB).catch(()=>{});}
  if(lobby.lobbyVoice){await lobby.lobbyVoice.delete().catch(()=>{});lobby.lobbyVoice=null;}
  lobby.phase="draft";lobby.map=pickMap(lobby.isPro);
  lobby.announceMsg=await lobby.channel.send({embeds:[new EmbedBuilder().setTitle(`⚔️  ${lobby.isPro?"Pro ":""}Lobby #${lobby.lobbyId} — Match Starting!`).setColor(m.resultColor).setDescription(`🗺️ **Map: ${lobby.map}**\n\n**🔵 Team ${lobby.teamNumA}${m.tag}** — Captain <@${lobby.captainA}>\n${A.map(id=>`<@${id}>`).join("  ·  ")}\n\n**🔴 Team ${lobby.teamNumB}${m.tag}** — Captain <@${lobby.captainB}>\n${B.map(id=>`<@${id}>`).join("  ·  ")}\n\n*Draft is live in <#${lobby.draftChannel.id}>!*`)]}).catch(()=>null);
  await lobby.chatA.send(`🔵 **Team ${lobby.teamNumA}${m.tag} — Private Chat**\nDiscuss your ban/pick strategy here.`).catch(()=>{});
  await lobby.chatB.send(`🔴 **Team ${lobby.teamNumB}${m.tag} — Private Chat**\nDiscuss your ban/pick strategy here.`).catch(()=>{});
  // Bet message — normal in queue channel, pro in bet-pro channel
  const L=`${lobby.isPro?"P":"L"}${lobby.lobbyId}_`;
  const betEmbed=new EmbedBuilder().setTitle(`🎰  ${lobby.isPro?"Pro ":""}Lobby #${lobby.lobbyId} — Bets are open!`).setColor(0xF1C40F)
    .setDescription(`🔵 **Team ${lobby.teamNumA}${m.tag}:** ${A.map(id=>`<@${id}>`).join(", ")}\n🔴 **Team ${lobby.teamNumB}${m.tag}:** ${B.map(id=>`<@${id}>`).join(", ")}\n\n*Place your bet! +1 ELO if right, -1 if wrong.\nBets close 4min30 after draft ends.*`);
  const betRow=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(L+"betA").setLabel(`🔵 Bet Team ${lobby.teamNumA}`).setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(L+"betB").setLabel(`🔴 Bet Team ${lobby.teamNumB}`).setStyle(ButtonStyle.Danger));
  if(lobby.isPro){
    const betProCh=guild.channels.cache.find(c=>c.name==="bet-pro"&&c.isTextBased());
    if(betProCh)lobby.betMsg=await betProCh.send({embeds:[betEmbed],components:[betRow]}).catch(()=>null);
  }else{
    lobby.betMsg=await lobby.channel.send({embeds:[betEmbed],components:[betRow]}).catch(()=>null);
  }
  await startDraftStep(lobby);
}

// ─── FINISH MATCH ────────────────────────────────────────────────────
async function finishMatch(lobby,winner){
  const m=M(lobby.isPro),st=m.stats,ens=m.ensure;
  const winners=winner==="A"?lobby.teamA:lobby.teamB,losers=winner==="A"?lobby.teamB:lobby.teamA;
  const winLabel=teamLabel(lobby,winner);
  const avgW=winners.reduce((s,id)=>s+(st[id]?.elo??1000),0)/3,avgL=losers.reduce((s,id)=>s+(st[id]?.elo??1000),0)/3;
  const isUpset=avgW<avgL,changes={};
  winners.forEach(id=>{ens(id);
    const r=calculateElo(st[id].elo,avgL,true);changes[id]=r.change;
    st[id].elo=r.newElo;st[id].mmr=Math.max(100,st[id].mmr+r.change);
    st[id].wins++;st[id].games++;st[id].currentStreak++;
    if(st[id].currentStreak>st[id].bestStreak)st[id].bestStreak=st[id].currentStreak;
    if(st[id].elo>st[id].peakElo)st[id].peakElo=st[id].elo;
    if(isUpset)st[id].clutchWins=(st[id].clutchWins||0)+1;
  });
  // Check if any loser is in placement (pro only)
  const hasPlacement = lobby.isPro && losers.some(id => placementPlayers.has(id));
  losers.forEach(id=>{ens(id);const r=calculateElo(st[id].elo,avgW,false);
    if(hasPlacement && !placementPlayers.has(id)){
      // Teammate of placement player: 0 ELO loss
      changes[id]=0;st[id].losses++;st[id].games++;st[id].currentStreak=0;
    }else{
      // Normal loss (or placement player himself)
      changes[id]=r.change;
      st[id].elo=Math.max(100,st[id].elo+r.change);st[id].mmr=Math.max(100,st[id].mmr+r.change);
      st[id].losses++;st[id].games++;st[id].currentStreak=0;
    }
  });
  // Update pro activity (reset decay timer)
  if(lobby.isPro){
    for(const id of [...winners,...losers]){
      ensureProActivity(id);
      proActivity[id].lastGame=Date.now();
      proActivity[id].decayCount=0;
    }
    await saveProActivity();
  }
  // Bets (now supports both normal and pro) — bet winners/losers affect the match's ELO pool
  const betW=lobby.bets[winner],betL=lobby.bets[winner==="A"?"B":"A"],betC={};
  for(const id of betW){
    ensurePlayer(id);
    stats[id].betWins=(stats[id].betWins||0)+1;
    stats[id].betStreak=(stats[id].betStreak||0)+1;
    if(stats[id].betStreak>(stats[id].bestBetStreak||0))stats[id].bestBetStreak=stats[id].betStreak;
    stats[id].betScore=(stats[id].betScore||0)+1;
    // ELO gain goes to the queue mode where the match happened
    if(lobby.isPro){ensureProPlayer(id);proStats[id].elo=Math.min(9999,proStats[id].elo+1);proStats[id].mmr++;}
    else{stats[id].elo=Math.min(9999,stats[id].elo+1);stats[id].mmr++;}
    betC[id]=+1;
  }
  for(const id of betL){
    ensurePlayer(id);
    stats[id].betLosses=(stats[id].betLosses||0)+1;
    stats[id].betStreak=0;
    stats[id].betScore=(stats[id].betScore||0)-1;
    if(lobby.isPro){ensureProPlayer(id);proStats[id].elo=Math.max(100,proStats[id].elo-1);proStats[id].mmr=Math.max(100,proStats[id].mmr-1);}
    else{stats[id].elo=Math.max(100,stats[id].elo-1);stats[id].mmr=Math.max(100,stats[id].mmr-1);}
    betC[id]=-1;
  }
  m.season.matchCount++;await m.save();await m.saveSeas();
  await saveStatsNow();// Save normal stats for bet tracking
  // History
  const hist=m.history;hist.push({timestamp:Date.now(),lobbyId:lobby.lobbyId,teamA:[...lobby.teamA],teamB:[...lobby.teamB],picksA:[...lobby.picks.A],picksB:[...lobby.picks.B],bansA:[...lobby.bans.A],bansB:[...lobby.bans.B],globalBans:[...lobby.globalBans],winner,changes:{...changes},map:lobby.map});
  await m.saveHist();
  // Result embed
  let betText="";
  if(betW.length>0||betL.length>0){betText="\n\n**🎰 Bets**\n";if(betW.length>0)betText+=betW.map(id=>`<@${id}> **+1** ✅`).join("\n")+"\n";if(betL.length>0)betText+=betL.map(id=>`<@${id}> **-1** ❌`).join("\n");}
  const resultEmbed=new EmbedBuilder().setTitle(`🏆  ${winLabel} Wins! — ${lobby.isPro?"Pro ":""}Lobby #${lobby.lobbyId}`).setColor(winner==="A"?0x3498DB:0xE74C3C)
    .setDescription(`🗺️ **Map:** ${lobby.map}\n\n**🥇 Winners**\n${winners.map(id=>`<@${id}>  **${changes[id]>=0?"+":""}${changes[id]}**  \`${st[id].elo} ELO\``).join("\n")}\n\n**💀 Losers**\n${losers.map(id=>`<@${id}>  **${changes[id]>=0?"+":""}${changes[id]}**  \`${st[id].elo} ELO\``).join("\n")}${betText}`).setTimestamp();
  if(lobby.boardMsg)await lobby.boardMsg.delete().catch(()=>{});
  if(lobby.lobbyPingMsg)await lobby.lobbyPingMsg.delete().catch(()=>{});
  if(lobby.announceMsg)await lobby.announceMsg.delete().catch(()=>{});
  if(lobby.betMsg)await lobby.betMsg.delete().catch(()=>{});
  await lobby.channel.send({embeds:[resultEmbed]});
  // History channel
  await lobby.channel.guild.channels.fetch().catch(()=>{});
  const histCh=lobby.channel.guild.channels.cache.find(c=>c.name===m.histCh&&c.isTextBased());
  if(histCh){const gB=lobby.globalBans.length>0?lobby.globalBans.map(c=>champBanDisplay(c,true)).join(", "):"—";
    const hE=new EmbedBuilder().setTitle(`🏆  ${winLabel} Wins! — ${lobby.isPro?"Pro ":""}Lobby #${lobby.lobbyId}`).setColor(winner==="A"?0x3498DB:0xE74C3C)
      .setDescription(`🗺️ **Map:** ${lobby.map}\n\n**🌍 Global Bans:** ${gB}\n**🚫 Bans T${lobby.teamNumA}:** ${lobby.bans.A.length>0?lobby.bans.A.map(c=>champBanDisplay(c,false)).join(", "):"—"}\n**🚫 Bans T${lobby.teamNumB}:** ${lobby.bans.B.length>0?lobby.bans.B.map(c=>champBanDisplay(c,false)).join(", "):"—"}\n\n**🔵 Team ${lobby.teamNumA}${m.tag}**\n${lobby.teamA.map((id,i)=>`<@${id}> ${champDisplay(lobby.picks.A[i]??"?")}  **${changes[id]>=0?"+":""}${changes[id]}**  \`${st[id].elo} ELO\``).join("\n")}\n\n**🔴 Team ${lobby.teamNumB}${m.tag}**\n${lobby.teamB.map((id,i)=>`<@${id}> ${champDisplay(lobby.picks.B[i]??"?")}  **${changes[id]>=0?"+":""}${changes[id]}**  \`${st[id].elo} ELO\``).join("\n")}`)
      .setTimestamp().setFooter({text:`LobbyELO ${lobby.isPro?"Pro ":""}Match History`});
    await histCh.send({embeds:[hE]}).catch(()=>{});}
  const guild=lobby.channel.guild;
  for(const id of[...winners,...losers])await removeRole(guild,id,inGameRole);
  if(lobby.isPro)await updateProLadder();else{await updateLadder();await updateBetLadder();}
  // Announcements
  const genCh=guild.channels.cache.find(c=>c.name===m.genCh&&c.isTextBased());
  if(genCh){
    for(const id of winners){if(st[id].currentStreak===5)await genCh.send({embeds:[new EmbedBuilder().setTitle("🔥  THE UNSTOPPABLE").setColor(0xFF4500).setDescription(`<@${id}> has won **5 matches in a row**!`)]}).catch(()=>{});}
    if(!lobby.isPro){for(const id of betW){if(stats[id].betStreak===5)await genCh.send({embeds:[new EmbedBuilder().setTitle("🔮  THE ORACLE").setColor(0x9B59B6).setDescription(`<@${id}> has predicted **5 matches correctly** in a row!`)]}).catch(()=>{});}}
  }
  await cleanupLobby(lobby);
}

// ─── CANCEL / CLEANUP ────────────────────────────────────────────────
async function cancelMatch(lobby){
  lobby.active=false;lobby.phase=null;const guild=lobby.channel.guild;
  const all=[...new Set([...lobby.teamA,...lobby.teamB,...lobby.expected])];
  for(const id of all){await removeRole(guild,id,inGameRole);await removeRole(guild,id,inQueueRole);}
  if(lobby.boardMsg)await lobby.boardMsg.delete().catch(()=>{});
  if(lobby.lobbyPingMsg)await lobby.lobbyPingMsg.delete().catch(()=>{});
  if(lobby.announceMsg)await lobby.announceMsg.delete().catch(()=>{});
  if(lobby.betMsg)await lobby.betMsg.delete().catch(()=>{});
  await lobby.channel.send(`⚠️ **${lobby.isPro?"Pro ":""}Lobby #${lobby.lobbyId}** has been cancelled.`).catch(()=>{});
  await cleanupLobby(lobby);
}
async function cleanupLobby(lobby){
  stopTimer(lobby);clearTimeout(lobby.lobbyTimeout);clearTimeout(lobby.betTimeout);
  if(lobby.voiceA)await lobby.voiceA.delete().catch(()=>{});
  if(lobby.voiceB)await lobby.voiceB.delete().catch(()=>{});
  if(lobby.lobbyVoice)await lobby.lobbyVoice.delete().catch(()=>{});
  if(lobby.draftChannel)await lobby.draftChannel.delete().catch(()=>{});
  if(lobby.chatA)await lobby.chatA.delete().catch(()=>{});
  if(lobby.chatB)await lobby.chatB.delete().catch(()=>{});
  if(lobby.category)await lobby.category.delete().catch(()=>{});
  const ch=lobby.channel,lm=lobby.isPro?proLobbies:lobbies,q=lobby.isPro?proQueue:queue;
  lm.delete(lobby.lobbyId);
  if(ch){await refreshQueue(ch,lobby.isPro,false).catch(()=>{});tryStartLobby(ch,lobby.isPro);}
}

// ─── QUEUE AUTO-REPUSH (triggered by non-queue messages in queue channels) ──
const _autoRepushPending={}; // per-channel debounce
client.on("messageCreate",async msg=>{
  try{
    if(msg.channel.name!=="queue-elb-pro"&&msg.channel.name!=="queue-lobby-elo")return;
    // IGNORE anything the bot posts (queue messages, recaps, AFK, etc.)
    // This prevents the infinite loop of bot posting → trigger → repush → new message → trigger...
    if(msg.author.id===client.user.id)return;
    const chId=msg.channel.id;
    // Debounce: if already scheduled, skip
    if(_autoRepushPending[chId])return;
    const isProCh=msg.channel.name==="queue-elb-pro";
    _autoRepushPending[chId]=setTimeout(async()=>{
      delete _autoRepushPending[chId];
      try{
        const lm=isProCh?proLobbies:lobbies;
        await repushQueue(msg.channel,isProCh,allSlotsActive(lm));
      }catch(e){log("ERROR","auto-repush:",e);}
    },2500);
  }catch(e){log("ERROR","auto-repush handler:",e);}
});

// ─── COMMANDS ────────────────────────────────────────────────────────
client.on("messageCreate",async msg=>{try{
  if(msg.author.bot)return;
  const content=msg.content.trim();
  const isPro=content.endsWith(" pro");
  const base=isPro?content.slice(0,-4).trim():content;

  // ── !queue ──
  if(base==="!queue"){
    const lock=isPro?"_proQueueLock":"_queueLock";
    if(isPro?_proQueueLock:_queueLock)return;
    if(isPro)_proQueueLock=true;else _queueLock=true;
    await msg.delete().catch(()=>{});
    try{
      await ensureRoles(msg.guild);
      const userId=msg.author.id,m=M(isPro),q=isPro?proQueue:queue,lm=m.lobbies;
      // Pro role check
      if(isPro){const member=await msg.guild.members.fetch(userId).catch(()=>null);if(!member||!member.roles.cache.some(r=>r.name==="Pro")){if(isPro)_proQueueLock=false;return;}}
      const qCh=msg.guild.channels.cache.find(c=>c.name===m.qCh&&c.isTextBased());
      const isQCh=qCh&&msg.channel.id===qCh.id;
      let maxSlots=6;
      if(isPro){
        const placementsInQ=q.filter(id=>placementPlayers.has(id)).length;
        const dodgedInQ=q.filter(id=>getDodgeCount(id)>0).length;
        maxSlots=6+placementsInQ+dodgedInQ;
      }
      if(!allSlotsActive(lm)&&!q.includes(userId)&&!findLobbyByPlayer(userId)&&!findLobbyByExpected(userId)&&!bannedPlayers.has(userId)&&q.length<maxSlots){
        m.ensure(userId);q.push(userId);await addRole(msg.guild,userId,inQueueRole);
        if(isPro)proQueueJoinTime[userId]=Date.now();
        // Pro placement delay swap logic
        if(isPro&&_proPlacementDelay&&!placementPlayers.has(userId)){
          clearTimeout(_proPlacementDelay);_proPlacementDelay=null;
          const firstPlacementIdx=proQueue.findIndex(id=>placementPlayers.has(id));
          if(firstPlacementIdx>=0){
            const placeId=proQueue.splice(firstPlacementIdx,1)[0];proQueue.push(placeId);
            const pm=await msg.guild.members.fetch(placeId).catch(()=>null);
            if(pm)await pm.send(`📋 You were swapped out of the Pro queue because a non-placement player joined.`).catch(()=>{});
            await msg.channel.send(`✅ Non-placement player <@${userId}> joined — <@${placeId}> was swapped out.`).catch(()=>{});
          }
        }
      }
      if(isQCh)await refreshQueue(msg.channel,isPro);else if(qCh)await refreshQueue(qCh,isPro).catch(()=>{});else await refreshQueue(msg.channel,isPro);
      const lCh=isQCh?msg.channel:(qCh||msg.channel);
      tryStartLobby(lCh,isPro);
    }finally{if(isPro)_proQueueLock=false;else _queueLock=false;}
    return;
  }

  // ── !proqueue @player (admin — force-add a player to the Pro queue) ──
  if(content.startsWith("!proqueue")){
    if(!ADMIN_IDS.includes(msg.author.id))return msg.reply("❌ Admin only.");
    const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!proqueue @player`");
    if(u.bot)return msg.reply("❌ Can't add a bot to the queue.");
    if(proQueue.includes(u.id))return msg.reply(`❌ <@${u.id}> is already in the Pro queue.`,{allowedMentions:{parse:[]}});
    if(findLobbyByPlayer(u.id)||findLobbyByExpected(u.id))return msg.reply(`❌ <@${u.id}> is already in a match.`,{allowedMentions:{parse:[]}});
    const m=M(true);m.ensure(u.id);
    proQueue.push(u.id);
    proQueueJoinTime[u.id]=Date.now();
    await addRole(msg.guild,u.id,inQueueRole);
    const qCh=msg.guild.channels.cache.find(c=>c.name==="queue-elb-pro"&&c.isTextBased());
    if(qCh){
      await refreshQueue(qCh,true).catch(()=>{});
      tryStartLobby(qCh,true);
    }
    await msg.reply({content:`✅ <@${u.id}> force-added to the Pro queue.`,allowedMentions:{parse:[]}});
    return;
  }

  // ── !clearqueue ──
  if(base.startsWith("!clearqueue")){
    if(!ADMIN_IDS.includes(msg.author.id))return msg.reply("❌ No permission.");
    const mentioned=msg.mentions.users.first();const q=isPro?proQueue:queue,m=M(isPro);
    if(mentioned){await msg.delete().catch(()=>{});const idx=q.indexOf(mentioned.id);if(idx>=0){q.splice(idx,1);await removeRole(msg.guild,mentioned.id,inQueueRole);const qc=msg.guild.channels.cache.find(c=>c.name===m.qCh&&c.isTextBased());if(qc)await refreshQueue(qc,isPro).catch(()=>{});}return;}
    if(q.length===0)return msg.reply("Queue is empty.");
    const count=q.length;for(const id of q)await removeRole(msg.guild,id,inQueueRole);
    if(isPro)proQueue=[];else queue=[];
    const qc=msg.guild.channels.cache.find(c=>c.name===m.qCh&&c.isTextBased());if(qc)await refreshQueue(qc,isPro).catch(()=>{});
    await msg.channel.send(`🧹 ${isPro?"Pro q":"Q"}ueue cleared — ${count} players removed.`);return;
  }

  // ── !eloban / !elounban ──
  if(content.startsWith("!eloban")){if(!ADMIN_IDS.includes(msg.author.id))return;const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!eloban @player`");bannedPlayers.add(u.id);await saveBanned();
    if(queue.includes(u.id)){queue=queue.filter(id=>id!==u.id);await removeRole(msg.guild,u.id,inQueueRole);}
    if(proQueue.includes(u.id)){proQueue=proQueue.filter(id=>id!==u.id);delete proQueueJoinTime[u.id];await removeRole(msg.guild,u.id,inQueueRole);}
    await msg.channel.send(`🔨 <@${u.id}> banned from matchmaking.`);return;}
  if(content.startsWith("!elounban")){if(!ADMIN_IDS.includes(msg.author.id))return;const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!elounban @player`");bannedPlayers.delete(u.id);await saveBanned();await msg.channel.send(`✅ <@${u.id}> unbanned.`);return;}

  // ── !placement / !unplacement (admin + Staff, pro only) ──
  if(content.startsWith("!placement")&&!content.startsWith("!unplacement")){
    const isAllowed=ADMIN_IDS.includes(msg.author.id)||msg.member?.roles.cache.some(r=>r.name==="Staff");
    if(!isAllowed)return msg.reply("❌ You need Admin or Staff role.");
    const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!placement @player`");
    const mb=await msg.guild.members.fetch(u.id).catch(()=>null);
    if(!mb||!mb.roles.cache.some(r=>r.name==="Pro"))return msg.reply("❌ This player doesn't have the Pro role.");
    if(placementPlayers.has(u.id))return msg.reply("❌ This player is already in placement.");
    placementPlayers.add(u.id);await savePlacement();
    await msg.channel.send(`📋 <@${u.id}> is now in **placement mode** (Pro). Teammates won't lose ELO if they lose.`);return;
  }
  if(content.startsWith("!unplacement")){
    const isAllowed=ADMIN_IDS.includes(msg.author.id)||msg.member?.roles.cache.some(r=>r.name==="Staff");
    if(!isAllowed)return msg.reply("❌ You need Admin or Staff role.");
    const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!unplacement @player`");
    if(!placementPlayers.has(u.id))return msg.reply("❌ This player is not in placement.");
    placementPlayers.delete(u.id);await savePlacement();
    await msg.channel.send(`✅ <@${u.id}> is no longer in placement mode.`);return;
  }

  // ── !dodge / !undodge / !mydodge (Admin-only — manage on behalf of players) ──
  // Syntax: !dodge @victim for @owner   →  @owner now dodges @victim
  //         !undodge @victim for @owner →  remove @victim from @owner's dodge list
  //         !mydodge for @owner          →  show @owner's dodge list
  if(content.startsWith("!dodge")&&!content.startsWith("!dodgeclear")){
    if(!ADMIN_IDS.includes(msg.author.id))return msg.reply("❌ Admin only.");
    const mentions=msg.mentions.users;
    if(mentions.size<2)return msg.reply("Usage: `!dodge @victim for @owner`");
    const arr=[...mentions.values()];
    const victim=arr[0],owner=arr[1];
    if(victim.id===DODGE_PROTECTED_ID)return msg.reply("❌ You cannot dodge this player.");
    if(victim.id===owner.id)return msg.reply("❌ A player cannot dodge themselves.");
    if(!dodges[owner.id])dodges[owner.id]=[];
    if(dodges[owner.id].includes(victim.id))return msg.reply(`❌ <@${victim.id}> is already in <@${owner.id}>'s dodge list.`,{allowedMentions:{parse:[]}});
    dodges[owner.id].push(victim.id);await saveDodges();
    await msg.reply({content:`🚫 <@${victim.id}> has been added to <@${owner.id}>'s dodge list (Pro only).`,allowedMentions:{parse:[]}});
    return;
  }
  if(content.startsWith("!undodge")){
    if(!ADMIN_IDS.includes(msg.author.id))return msg.reply("❌ Admin only.");
    const mentions=msg.mentions.users;
    if(mentions.size<2)return msg.reply("Usage: `!undodge @victim for @owner`");
    const arr=[...mentions.values()];
    const victim=arr[0],owner=arr[1];
    if(!dodges[owner.id]||!dodges[owner.id].includes(victim.id))return msg.reply({content:`❌ <@${victim.id}> is not in <@${owner.id}>'s dodge list.`,allowedMentions:{parse:[]}});
    dodges[owner.id]=dodges[owner.id].filter(id=>id!==victim.id);
    if(dodges[owner.id].length===0)delete dodges[owner.id];
    await saveDodges();
    await msg.reply({content:`✅ <@${victim.id}> removed from <@${owner.id}>'s dodge list.`,allowedMentions:{parse:[]}});
    return;
  }
  if(content.startsWith("!mydodge")){
    if(!ADMIN_IDS.includes(msg.author.id))return msg.reply("❌ Admin only.");
    const u=msg.mentions.users.first();
    if(!u)return msg.reply("Usage: `!mydodge for @owner`");
    const list=dodges[u.id]||[];
    if(list.length===0)return msg.reply({content:`📋 <@${u.id}>'s dodge list is empty.`,allowedMentions:{parse:[]}});
    const desc=list.map((id,i)=>`**${i+1}.** <@${id}>`).join("\n");
    await msg.reply({embeds:[new EmbedBuilder().setTitle(`🚫 Dodge List — ${u.username}`).setColor(0xE74C3C).setDescription(desc).setFooter({text:`${list.length} player(s) dodged`})],allowedMentions:{parse:[]}});
    return;
  }

  // ── !fictifqueue — preview the Tournament Broadcast style queue (fake data) ──
  if(content==="!fictifqueue"){
    const ELB="<:ELBPRO:1496812452845977662>";
    // TODO: replace with your imgur DIRECT image URL (right-click image → Copy image address)
    const BANNER_URL="https://i.imgur.com/sU6QjlJ.jpeg";
    const ELB_IMG_URL="https://cdn.discordapp.com/emojis/1496812452845977662.png";
    const fake=[
      {name:"Ashterou",elo:1180,streak:"🔥"},
      {name:"Ray",elo:1094,streak:""},
      {name:"Sheepa",elo:1052,streak:""},
      {name:"Fiully",elo:1026,streak:""},
      {name:"Hanlosh",elo:998,streak:""},
      {name:"LoLDab",elo:972,streak:""}
    ];
    const bar="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
    const rows=fake.map((p,i)=>{
      const rank=`**${String(i+1).padStart(2,"0")}**`;
      const nameCol=`\`${p.name.padEnd(14," ")}\``;
      const eloCol=`\`${String(p.elo).padStart(4," ")} ELO\``;
      return `┃ ${rank}  ${nameCol}  ${eloCol}  ${p.streak}`;
    }).join("\n");
    const desc=`${bar}\n▶  **LOBBY #1 PRO**  ·  Queue Open\n${bar}\n\n${rows}\n\n${bar}\n   **${fake.length} / 6  PLAYERS READY**\n${bar}`;
    const embed=new EmbedBuilder()
      .setColor(0x8B0000)
      .setAuthor({name:"BATTLERITE PRO · Tournament Mode"})
      .setTitle(`${ELB}  PRO QUEUE  ${ELB}`)
      .setDescription(desc)
      .setThumbnail(BANNER_URL)
      .setFooter({text:"⚔️  Click JOIN to enter the arena"});
    const row=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("fictif_join").setLabel("✅  Join").setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId("fictif_leave").setLabel("❌  Leave").setStyle(ButtonStyle.Danger).setDisabled(true)
    );
    await msg.channel.send({embeds:[embed],components:[row]});
    return;
  }

  // ── !fictifdraft — preview the Tournament Broadcast style draft (fake data) ──
  if(content==="!fictifdraft"){
    const ELB="<:ELBPRO:1496812452845977662>";
    // TODO: replace with your imgur DIRECT image URL (right-click image → Copy image address)
    const BANNER_URL="https://i.imgur.com/sU6QjlJ.jpeg";
    const ELB_IMG_URL="https://cdn.discordapp.com/emojis/1496812452845977662.png";
    const bar="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";
    const teamA=[
      {name:"Ashterou",champ:"Freya"},
      {name:"Ray",champ:"Jumong"},
      {name:"Sheepa",champ:"[ ? ]"}
    ];
    const teamB=[
      {name:"Fiully",champ:"Bakko"},
      {name:"Hanlosh",champ:"Zander"},
      {name:"LoLDab",champ:"[ ? ]"}
    ];
    const tA=teamA.map((p,i)=>{const cap=i===0?"👑 ":"   ";return `${cap}\`${p.name.padEnd(12," ")}\`\n       ${p.champ!=="[ ? ]"?`${CHAMP_EMOJIS[p.champ]||""} \`${p.champ}\``:"`[ ? ]`"}`;}).join("\n\n");
    const tB=teamB.map((p,i)=>{const cap=i===0?"👑 ":"   ";return `${cap}\`${p.name.padEnd(12," ")}\`\n       ${p.champ!=="[ ? ]"?`${CHAMP_EMOJIS[p.champ]||""} \`${p.champ}\``:"`[ ? ]`"}`;}).join("\n\n");
    const globalBans=`${CHAMP_EMOJIS["Alysia"]||""} Alysia  ·  ${CHAMP_EMOJIS["Croak"]||""} Croak`;
    const bansA=`${CHAMP_EMOJIS["Iva"]||""} Iva`;
    const bansB=`${CHAMP_EMOJIS["Ezmo"]||""} Ezmo`;
    const timerBar="▰▰▰▰▰▰▱▱▱▱  45s";
    const progressBar="▰▰▰▰▰▱▱▱▱▱▱▱  5 / 12";
    const embed=new EmbedBuilder()
      .setColor(0x8B0000)
      .setAuthor({name:"BATTLERITE PRO · Tournament Mode"})
      .setTitle(`${ELB}  LOBBY #1 PRO — PICK PHASE  ${ELB}`)
      .setDescription(`${bar}\n🗺️  **Map:**  \`Blackstone Arena Day\`\n${bar}\n\n🎯 **TEAM 1 must PICK** — Captain <@123>\n\n${timerBar}\n${progressBar}`)
      .addFields(
        {name:"🔵  TEAM 1",value:tA,inline:true},
        {name:"⚔️",value:"\u200b",inline:true},
        {name:"🔴  TEAM 2",value:tB,inline:true},
        {name:"🌍  Global Bans",value:globalBans,inline:false},
        {name:"\u200b",value:`🚫 **T1 Bans:** ${bansA}   ┃   **T2 Bans:** ${bansB}`,inline:false}
      )
      .setFooter({text:"75s per step  ·  auto random on timeout  ·  !captain to claim"});
    // Buttons — category selection (fake, disabled)
    const row1=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("fictif_mel").setLabel("⚔️ Melee").setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId("fictif_rng").setLabel("🏹 Range").setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId("fictif_sup").setLabel("💚 Support").setStyle(ButtonStyle.Success).setDisabled(true)
    );
    const row2=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("fictif_cancel").setLabel("❌ Cancel Match (0/4)").setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await msg.channel.send({embeds:[embed],components:[row1,row2]});
    return;
  }

  // ── !captain ──
  if(content==="!captain"){const lobby=findLobbyByDraftChannel(msg.channel.id);if(!lobby||!lobby.active||lobby.phase!=="draft")return;const uid=msg.author.id;
    if(lobby.teamA.includes(uid)){lobby.captainA=uid;await msg.channel.send(`👑 <@${uid}> is now captain of **Team ${lobby.teamNumA}${lobby.isPro?" Pro":""}**!`);pushBoard(lobby);}
    else if(lobby.teamB.includes(uid)){lobby.captainB=uid;await msg.channel.send(`👑 <@${uid}> is now captain of **Team ${lobby.teamNumB}${lobby.isPro?" Pro":""}**!`);pushBoard(lobby);}
    return;}

  // ── !help ──
  if(content==="!help"){await msg.channel.send({embeds:[new EmbedBuilder().setTitle("📖  LobbyELO — Commands").setColor(0x5865F2).setDescription(
    "**Everyone:**\n`!queue` / `!queue pro` — Join queue\n`!stats` / `!statspro` — Your stats\n`!stats @player` / `!statspro @player` — Someone's stats\n`!history` / `!history pro` — Last 5 matches\n`!season` / `!season pro` — Season info\n`!MMR` / `!MMR @player` — Lifetime MMR\n`!relation @p1 @p2` — Head-to-head\n`!totalplayer` — All players\n`!captain` — Claim captain\n`!ladder` / `!ladderbet` — Leaderboards\n`!command` — Buttons menu for all commands\n\n"+
    "**Pro Dodge (Admin only):**\n`!dodge @victim for @owner` — Make @owner dodge @victim\n`!undodge @victim for @owner` — Remove dodge\n`!mydodge for @owner` — Show @owner's dodge list\n\n"+
    "**Admin:**\n`!setelo @player N` / `!setMMR @player N` / `!setMMR pro @player N`\n`!resetstats` / `!resetstats pro` — Reset all\n`!resetelostats @player` / `!resetelostats pro @player`\n`!oldstats` / `!oldstats pro` — Undo reset\n`!MMRreset` / `!MMRreset pro`\n`!clearqueue` / `!clearqueue pro`\n`!proqueue @player` — Force-add a player to Pro queue\n`!eloban @player` / `!elounban @player`\n`!placement @player` / `!unplacement @player` — Pro placement\n`!resetlobby` / `!resetlobby N` / `!resetlobby pro`\n`!cancel N` / `!cancel N pro`\n\n"+
    "**Scrim:**\n`!scrim` — Create a new scrim lobby (anyone)\n`!signup @player t1|t2 <id>` — Add a player to a team (lobby admin/captain/Ray/admin)\n`!captainscrim @player <id>` — Assign a scrim captain (lobby admin/Ray/admin)\n`!removescrim <id> @player` — Remove a player (lobby admin/captain/Ray/admin)\n`!cancelscrim <id>` — Cancel and delete a scrim (lobby admin/captain/Ray/admin)\n`!draft <id>` (with image attached) — Upload a draft screenshot"
  )]});return;}

  // ── !command — buttons menu (ephemeral) ──
  if(content==="!command"){
    const embed=new EmbedBuilder().setTitle("🎮  Quick Commands").setColor(0x5865F2)
      .setDescription("Click a button below to run the command. For commands needing a player, a popup will appear.");
    const row1=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cmd_queue").setLabel("!queue").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cmd_queuepro").setLabel("!queue pro").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cmd_stats").setLabel("!stats").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cmd_statspro").setLabel("!statspro").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cmd_history").setLabel("!history").setStyle(ButtonStyle.Secondary)
    );
    const row2=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cmd_historypro").setLabel("!history pro").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cmd_season").setLabel("!season").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cmd_seasonpro").setLabel("!season pro").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cmd_mmr").setLabel("!MMR (you)").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cmd_statsplayer").setLabel("!stats @player").setStyle(ButtonStyle.Success)
    );
    const row3=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cmd_statsproplayer").setLabel("!statspro @player").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("cmd_mmrplayer").setLabel("!MMR @player").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cmd_relation").setLabel("!relation @p1 @p2").setStyle(ButtonStyle.Secondary)
    );
    await msg.reply({embeds:[embed],components:[row1,row2,row3]});
    return;
  }

  // ── !scrim (Ray + Admin) — shows create scrim hub if no active lobbies ──
  if(content==="!scrim"){
    if(msg.author.id!==RAY_ID&&!ADMIN_IDS.includes(msg.author.id))return msg.reply("❌ Only Ray or admins can use this.");
    const ch=msg.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
    if(!ch)return msg.reply("❌ Channel #ray-scrim-queue not found.");
    if(activeScrims().length>=MAX_SCRIM_LOBBIES)return msg.reply(`❌ Max ${MAX_SCRIM_LOBBIES} active scrim lobbies reached.`);
    // Create the first lobby with the user (Ray or admin) as creator
    const uid=msg.author.id;
    const lobbyId=generateScrimId();
    const role=await msg.guild.roles.create({name:`Admin Lobby #${lobbyId}`,mentionable:false,reason:"Scrim lobby admin"}).catch(()=>null);
    const member=await msg.guild.members.fetch(uid).catch(()=>null);
    if(role&&member)await member.roles.add(role).catch(()=>{});
    const newLobby={
      id:lobbyId,creatorId:uid,roleId:role?.id??null,dateStr:null,timeStr:null,
      teamA:[],teamB:[],captains:[],
      messageId:null,status:"open",replays:[],drafts:[],historyMsgId:null,createdAt:Date.now()
    };
    scrim.lobbies.push(newLobby);
    const lobbyMsg=await ch.send({embeds:[scrimLobbyEmbed(newLobby)],components:scrimLobbyBtns(newLobby)}).catch(()=>null);
    if(lobbyMsg)newLobby.messageId=lobbyMsg.id;
    await saveScrim();
    await refreshCreateScrimBtn(ch);
    await msg.reply(`✅ Scrim **#${lobbyId}** created in <#${ch.id}>! You're the lobby admin.`);
    return;
  }

  // ── !removescrim <id> @player (lobby admin + captains + Ray + admins) ──
  if(content.startsWith("!removescrim")){
    const parts=content.split(/\s+/);if(parts.length<2)return msg.reply("Usage: `!removescrim <lobbyId> @player`");
    const lobbyId=parts[1].toUpperCase();
    const lobby=findScrim(lobbyId);if(!lobby)return msg.reply("❌ Scrim lobby not found.");
    if(!isScrimAuthorized(msg.author.id,lobby))return msg.reply("❌ Only the lobby admin, a scrim captain, Ray or admins can use this.");
    const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!removescrim <lobbyId> @player`");
    lobby.teamA=lobby.teamA.filter(id=>id!==u.id);lobby.teamB=lobby.teamB.filter(id=>id!==u.id);
    if(lobby.status==="ready"&&lobby.teamA.length+lobby.teamB.length<6)lobby.status="open";
    await saveScrim();
    const ch=msg.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
    if(ch)await updateScrimLobbyMessage(ch,lobby);
    await msg.channel.send(`✅ <@${u.id}> removed from scrim **#${lobby.id}**.`);
    return;
  }

  // ── !cancelscrim <id> (lobby admin + captains + Ray + admins) ──
  if(content.startsWith("!cancelscrim")){
    const parts=content.split(/\s+/);if(parts.length<2)return msg.reply("Usage: `!cancelscrim <lobbyId>`");
    const lobbyId=parts[1].toUpperCase();
    const lobby=findScrim(lobbyId);if(!lobby)return msg.reply("❌ Scrim lobby not found.");
    if(!isScrimAuthorized(msg.author.id,lobby))return msg.reply("❌ Only the lobby admin, a scrim captain, Ray or admins can use this.");
    const ch=msg.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
    if(ch&&lobby.messageId){const m=await ch.messages.fetch(lobby.messageId).catch(()=>null);if(m)await m.delete().catch(()=>{});}
    if(lobby.roleId){const r=msg.guild.roles.cache.get(lobby.roleId);if(r)await r.delete().catch(()=>{});}
    scrim.lobbies=scrim.lobbies.filter(l=>l.id!==lobby.id);
    await saveScrim();
    if(ch)await refreshCreateScrimBtn(ch);
    await msg.channel.send(`⚠️ Scrim **#${lobby.id}** cancelled and deleted.`);
    return;
  }

  // ── !cancelallscrim (Admin only — wipes ALL active scrim lobbies) ──
  if(content==="!cancelallscrim"){
    if(!ADMIN_IDS.includes(msg.author.id))return msg.reply("❌ Admin only.");
    const active=activeScrims();
    if(active.length===0)return msg.reply("ℹ️ No active scrims to cancel.");
    const ch=msg.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
    let cancelled=0;
    for(const lobby of [...active]){
      // Delete message
      if(ch&&lobby.messageId){const m=await ch.messages.fetch(lobby.messageId).catch(()=>null);if(m)await m.delete().catch(()=>{});}
      // Delete role
      if(lobby.roleId){const r=msg.guild.roles.cache.get(lobby.roleId);if(r)await r.delete().catch(()=>{});}
      // Remove from state
      scrim.lobbies=scrim.lobbies.filter(l=>l.id!==lobby.id);
      cancelled++;
    }
    await saveScrim();
    if(ch)await refreshCreateScrimBtn(ch);
    await msg.channel.send(`⚠️ **${cancelled} scrim(s) cancelled and deleted.**`);
    return;
  }

  // ── !whododges @player (Admin only — debug who dodges a player) ──
  if(content.startsWith("!whododges")){
    if(!ADMIN_IDS.includes(msg.author.id))return msg.reply("❌ Admin only.");
    const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!whododges @player`");
    const dodgers=Object.keys(dodges).filter(uid=>(dodges[uid]||[]).includes(u.id));
    if(dodgers.length===0)return msg.reply({content:`✅ Nobody dodges <@${u.id}>.`,allowedMentions:{parse:[]}});
    const desc=dodgers.map((id,i)=>`**${i+1}.** <@${id}>`).join("\n");
    await msg.reply({embeds:[new EmbedBuilder().setTitle(`🚫 Players who dodge ${u.username}`).setColor(0xE74C3C).setDescription(desc).setFooter({text:`${dodgers.length} dodger(s)`})],allowedMentions:{parse:[]}});
    return;
  }

  // ── !captainscrim @player <lobbyId> (lobby admin + Ray + admins) ──
  if(content.startsWith("!captainscrim")){
    const parts=content.split(/\s+/);
    if(parts.length<3)return msg.reply("Usage: `!captainscrim @player <lobbyId>`");
    const target=msg.mentions.users.first();
    if(!target)return msg.reply("Usage: `!captainscrim @player <lobbyId>` — mention a player.");
    const lobbyId=parts[parts.length-1].toUpperCase();
    const lobby=findScrim(lobbyId);
    if(!lobby)return msg.reply("❌ Scrim lobby not found.");
    // Only the lobby creator + server admins (NOT existing captains)
    const isAuth=msg.author.id===RAY_ID||ADMIN_IDS.includes(msg.author.id)||msg.author.id===lobby.creatorId;
    if(!isAuth)return msg.reply("❌ Only the lobby admin, Ray or admins can assign a scrim captain.");
    if(target.bot)return msg.reply("❌ Can't assign a bot as captain.");
    if(target.id===lobby.creatorId)return msg.reply("ℹ️ That player is already the lobby admin.");
    if(!Array.isArray(lobby.captains))lobby.captains=[];
    if(lobby.captains.includes(target.id))return msg.reply(`ℹ️ <@${target.id}> is already a captain of scrim **#${lobby.id}**.`);
    lobby.captains.push(target.id);
    if(lobby.roleId){
      const role=msg.guild.roles.cache.get(lobby.roleId);
      const member=await msg.guild.members.fetch(target.id).catch(()=>null);
      if(role&&member)await member.roles.add(role).catch(()=>{});
    }
    await saveScrim();
    const ch=msg.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
    if(ch)await updateScrimLobbyMessage(ch,lobby);
    await msg.channel.send(`👑 <@${target.id}> is now a captain of scrim **#${lobby.id}** — they can signup players, edit date/time, manage the lobby.`);
    const m=await msg.guild.members.fetch(target.id).catch(()=>null);
    if(m)await m.send(`👑 You are now a captain of scrim **#${lobby.id}**. You can use \`!signup\`, \`!removescrim\`, \`!cancelscrim\`, edit the date/time, and upload drafts/replays.`).catch(()=>{});
    return;
  }

  // ── !signup @player t1|t2 <lobbyId> (lobby admin + captains + Ray + admins) ──
  if(content.startsWith("!signup")){
    const discreet=async(text,ok=true)=>{
      await msg.delete().catch(()=>{});
      const r=await msg.channel.send(`${ok?"":"❌ "}${text}`).catch(()=>null);
      if(r)setTimeout(()=>r.delete().catch(()=>{}),ok?4000:6000);
    };
    const parts=content.split(/\s+/);
    if(parts.length<4)return discreet("Usage: `!signup @player t1|t2 <lobbyId>`",false);
    const target=msg.mentions.users.first();
    if(!target)return discreet("Usage: `!signup @player t1|t2 <lobbyId>` — mention a player.",false);
    let teamArg=null,lobbyId=null;
    for(const pp of parts.slice(1)){
      const low=pp.toLowerCase();
      if(low==="t1"||low==="t2")teamArg=low;
      else if(/^[0-9A-Fa-f]{4}$/.test(pp))lobbyId=pp.toUpperCase();
    }
    if(!teamArg)return discreet("Specify the team: `t1` or `t2`.",false);
    if(!lobbyId)return discreet("Specify the lobby ID (e.g. `5CB0`).",false);
    const lobby=findScrim(lobbyId);
    if(!lobby)return discreet("Scrim lobby not found.",false);
    if(!isScrimAuthorized(msg.author.id,lobby))return discreet("Only the lobby admin, a scrim captain, Ray or admins can use this.",false);
    if(lobby.status!=="open"&&lobby.status!=="ready")return discreet("This scrim is not accepting new players.",false);
    if(target.bot)return discreet("Can't signup a bot.",false);
    if(lobby.teamA.includes(target.id)||lobby.teamB.includes(target.id))return discreet(`<@${target.id}> is already in this scrim.`,false);
    const team=teamArg==="t1"?lobby.teamA:lobby.teamB;
    const teamLabelStr=teamArg==="t1"?"Team 1":"Team 2";
    if(team.length>=3)return discreet(`${teamLabelStr} is full.`,false);
    team.push(target.id);
    if(lobby.teamA.length+lobby.teamB.length===6&&lobby.status==="open")lobby.status="ready";
    await saveScrim();
    const ch=msg.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
    if(ch)await updateScrimLobbyMessage(ch,lobby);
    await maybeAutoValidate(lobby,ch);
    await discreet(`<@${target.id}> added to ${teamLabelStr} of scrim **#${lobby.id}**.`,true);
    return;
  }

  // ── !draft <lobbyId> (image attached) — register draft screenshot ──
  if(content.startsWith("!draft ")){
    const parts=content.split(/\s+/);if(parts.length<2)return msg.reply("Usage: `!draft <lobbyId>` with an image attached.");
    const lobbyId=parts[1].toUpperCase();
    const lobby=findScrim(lobbyId);if(!lobby)return msg.reply("❌ Scrim lobby not found.");
    const uid=msg.author.id;
    const isAuth=uid===RAY_ID||ADMIN_IDS.includes(uid)||uid===lobby.creatorId||lobby.teamA.includes(uid)||lobby.teamB.includes(uid);
    if(!isAuth)return msg.reply("❌ Only players of this scrim can upload drafts.");
    const attachment=msg.attachments.first();
    if(!attachment||!attachment.contentType?.startsWith("image/"))return msg.reply("❌ Attach an image.");
    // Re-upload the image to #history-scrim channel so the URL doesn't expire (Discord CDN attachments expire after ~24h)
    const histCh=msg.guild.channels.cache.find(c=>c.name==="history-scrim"&&c.isTextBased());
    if(!histCh)return msg.reply("❌ Channel #history-scrim not found. Cannot persist draft image.");
    let permanentUrl=null;
    try{
      const fileName=`scrim-${lobby.id}-draft-${(lobby.drafts||[]).length+1}.${attachment.name?.split(".").pop()||"png"}`;
      const reupload=await histCh.send({content:`📸 *Draft attachment for Scrim #${lobby.id}*`,files:[{attachment:attachment.url,name:fileName}]}).catch(()=>null);
      if(!reupload||!reupload.attachments.first())return msg.reply("❌ Failed to re-upload draft image. Try again.");
      permanentUrl=reupload.attachments.first().url;
    }catch(e){log("ERROR","draft reupload:",e);return msg.reply("❌ Failed to re-upload draft image.");}
    if(!lobby.drafts)lobby.drafts=[];
    lobby.drafts.push(permanentUrl);
    await saveScrim();
    // Update live scrim message AND history recap message
    if(lobby.messageId&&lobby.status!=="archived"){
      const scrimCh=msg.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
      if(scrimCh)await updateScrimLobbyMessage(scrimCh,lobby);
    }
    if(lobby.historyMsgId){
      const m=await histCh.messages.fetch(lobby.historyMsgId).catch(()=>null);
      if(m)await m.edit({embeds:[scrimHistoryEmbed(lobby)],components:scrimHistoryBtns(lobby)}).catch(()=>{});
    }
    await msg.reply(`✅ Draft #${lobby.drafts.length} registered for Scrim **#${lobby.id}**.`);
    return;
  }

  // ── !statspro (shortcut for !stats pro) ──
  if(content.startsWith("!statspro")){
    const mentioned=msg.mentions.users.first(),targetId=mentioned?mentioned.id:msg.author.id;
    const m=M(true),st=m.stats;m.ensure(targetId);const s=st[targetId],total=s.wins+s.losses;
    const ranked=Object.entries(st).filter(([,x])=>x.games>0).sort(([,a],[,b])=>b.elo-a.elo);
    const rank=ranked.findIndex(([id])=>id===targetId)+1;
    const pMatches=(m.history).filter(x=>[...x.teamA,...x.teamB].includes(targetId)).slice(-10);
    const last10=pMatches.map(x=>{const w=(x.winner==="A"&&x.teamA.includes(targetId))||(x.winner==="B"&&x.teamB.includes(targetId));return w?"🟢":"🔴";}).join("")||"—";
    const h2h={};m.history.forEach(x=>{const my=x.teamA.includes(targetId)?"A":x.teamB.includes(targetId)?"B":null;if(!my)return;const opps=my==="A"?x.teamB:x.teamA;const won=x.winner===my;opps.forEach(o=>{if(!h2h[o])h2h[o]={w:0,l:0};if(won)h2h[o].w++;else h2h[o].l++;});});
    const nem=Object.entries(h2h).filter(([,v])=>v.l>=2).sort(([,a],[,b])=>b.l-a.l)[0];
    const prey=Object.entries(h2h).filter(([,v])=>v.w>=2).sort(([,a],[,b])=>b.w-a.w)[0];
    const topC=Object.entries(st).filter(([,x])=>x.games>0).sort(([,a],[,b])=>(b.clutchWins||0)-(a.clutchWins||0))[0];
    const isCK=topC&&topC[0]===targetId&&(topC[1].clutchWins||0)>0;
    const fields=[
      {name:"ELO",value:`\`${s.elo}\``,inline:true},{name:"Peak ELO",value:`\`${s.peakElo||s.elo}\``,inline:true},
      {name:"Rank",value:`\`#${rank>0?rank:"—"} / ${ranked.length}\``,inline:true},
      {name:"Win Rate",value:`\`${total===0?0:Math.round(s.wins/total*100)}%\``,inline:true},
      {name:"Wins",value:`\`${s.wins}\``,inline:true},{name:"Losses",value:`\`${s.losses}\``,inline:true},
      {name:"Streak",value:`\`${s.currentStreak}W\``,inline:true},{name:"Best",value:`\`${s.bestStreak}W\``,inline:true},
      {name:"Clutch",value:`\`${s.clutchWins||0}\`${isCK?" 👊 **Clutch King**":""}`,inline:true},
      {name:"Last 10",value:last10,inline:false}
    ];
    if(nem)fields.push({name:"Nemesis",value:`<@${nem[0]}> (${nem[1].l} losses)`,inline:true});
    if(prey)fields.push({name:"Prey",value:`<@${prey[0]}> (${prey[1].w} wins)`,inline:true});
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle(`📊  Pro Stats — ${mentioned?mentioned.username:msg.author.username}`).setColor(0xDAA520).addFields(fields)]});return;
  }

  // ── !stats ──
  if(base.startsWith("!stats")&&!base.startsWith("!statsreset")){
    const mentioned=msg.mentions.users.first(),targetId=mentioned?mentioned.id:msg.author.id;
    const m=M(isPro),st=m.stats;m.ensure(targetId);const s=st[targetId],total=s.wins+s.losses;
    const ranked=Object.entries(st).filter(([,x])=>x.games>0).sort(([,a],[,b])=>b.elo-a.elo);
    const rank=ranked.findIndex(([id])=>id===targetId)+1;
    const pMatches=(m.history).filter(x=>[...x.teamA,...x.teamB].includes(targetId)).slice(-10);
    const last10=pMatches.map(x=>{const w=(x.winner==="A"&&x.teamA.includes(targetId))||(x.winner==="B"&&x.teamB.includes(targetId));return w?"🟢":"🔴";}).join("")||"—";
    // Nemesis/Prey
    const h2h={};m.history.forEach(x=>{const my=x.teamA.includes(targetId)?"A":x.teamB.includes(targetId)?"B":null;if(!my)return;const opps=my==="A"?x.teamB:x.teamA;const won=x.winner===my;opps.forEach(o=>{if(!h2h[o])h2h[o]={w:0,l:0};if(won)h2h[o].w++;else h2h[o].l++;});});
    const nem=Object.entries(h2h).filter(([,v])=>v.l>=2).sort(([,a],[,b])=>b.l-a.l)[0];
    const prey=Object.entries(h2h).filter(([,v])=>v.w>=2).sort(([,a],[,b])=>b.w-a.w)[0];
    const topC=Object.entries(st).filter(([,x])=>x.games>0).sort(([,a],[,b])=>(b.clutchWins||0)-(a.clutchWins||0))[0];
    const isCK=topC&&topC[0]===targetId&&(topC[1].clutchWins||0)>0;
    const fields=[
      {name:"ELO",value:`\`${s.elo}\``,inline:true},{name:"Peak ELO",value:`\`${s.peakElo||s.elo}\``,inline:true},
      {name:"Rank",value:`\`#${rank>0?rank:"—"} / ${ranked.length}\``,inline:true},
      {name:"Win Rate",value:`\`${total===0?0:Math.round(s.wins/total*100)}%\``,inline:true},
      {name:"Wins",value:`\`${s.wins}\``,inline:true},{name:"Losses",value:`\`${s.losses}\``,inline:true},
      {name:"Streak",value:`\`${s.currentStreak}W\``,inline:true},{name:"Best",value:`\`${s.bestStreak}W\``,inline:true},
      {name:"Clutch",value:`\`${s.clutchWins||0}\`${isCK?" 👊 **Clutch King**":""}`,inline:true},
      {name:"Last 10",value:last10,inline:false}
    ];
    if(nem)fields.push({name:"Nemesis",value:`<@${nem[0]}> (${nem[1].l} losses)`,inline:true});
    if(prey)fields.push({name:"Prey",value:`<@${prey[0]}> (${prey[1].w} wins)`,inline:true});
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle(`📊  ${isPro?"Pro ":""}Stats — ${mentioned?mentioned.username:msg.author.username}`).setColor(isPro?0xDAA520:0x57F287).addFields(fields)]});return;
  }

  // ── !history ──
  if(base.startsWith("!history")){const mentioned=msg.mentions.users.first(),tid=mentioned?mentioned.id:msg.author.id;const m=M(isPro);
    const pm=m.history.filter(x=>[...x.teamA,...x.teamB].includes(tid)).slice(-5);
    if(!pm.length)return msg.channel.send("No history.");
    const lines=pm.map(x=>{const isA=x.teamA.includes(tid);const w=(x.winner==="A"&&isA)||(x.winner==="B"&&!isA);const c=x.changes[tid]??0;
      return `${w?"🟢 **WIN**":"🔴 **LOSS**"}  **${c>=0?"+":""}${c}**  •  ${new Date(x.timestamp).toLocaleDateString()}\nWith: ${(isA?x.teamA:x.teamB).filter(id=>id!==tid).map(id=>`<@${id}>`).join(", ")}  |  Vs: ${(isA?x.teamB:x.teamA).map(id=>`<@${id}>`).join(", ")}`;}).join("\n\n");
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle(`📜  ${isPro?"Pro ":""}History — ${mentioned?mentioned.username:msg.author.username}`).setColor(0x5865F2).setDescription(lines)]});return;
  }

  // ── !relation ──
  if(content.startsWith("!relation")){const mentions=[...msg.mentions.users.values()];if(mentions.length<2)return msg.reply("Usage: `!relation @p1 @p2`");
    const p1=mentions[0].id,p2=mentions[1].id;let p1v=0,p2v=0,tog=0,togW=0,tot=0;
    [...matchHistory,...proMatchHistory].forEach(x=>{const t1=x.teamA.includes(p1)?"A":x.teamB.includes(p1)?"B":null;const t2=x.teamA.includes(p2)?"A":x.teamB.includes(p2)?"B":null;if(!t1||!t2)return;tot++;if(t1===t2){tog++;if(x.winner===t1)togW++;}else{if(x.winner===t1)p1v++;else p2v++;}});
    if(!tot)return msg.reply("No matches found.");
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle(`⚔️  ${mentions[0].username} vs ${mentions[1].username}`).setColor(0xE67E22)
      .setDescription(`**Total:** ${tot}\n\n**🤝 Teammates:** ${tog} games, ${togW}W/${tog-togW}L (${tog?Math.round(togW/tog*100):0}%)\n\n**⚔️ Opponents:** ${p1v+p2v} games\n<@${p1}> won ${p1v}\n<@${p2}> won ${p2v}`)]});return;
  }

  // ── !totalplayer ──
  if(content==="!totalplayer"){const all=Object.entries(stats);const act=all.filter(([,s])=>s.games>0).sort(([,a],[,b])=>b.elo-a.elo);const reg=all.filter(([,s])=>s.games===0);
    let d=`**Total: \`${all.length}\`** (\`${act.length}\` active)\n\n`;
    if(act.length>0){d+="**🎮 Active:**\n"+act.map(([id,s],i)=>`${i+1}. <@${id}> — \`${s.elo} ELO\` • \`${s.games} games\``).join("\n");}
    if(reg.length>0)d+="\n\n**📝 Registered:**\n"+reg.map(([id])=>`<@${id}>`).join(", ");
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle("👥  All Players").setColor(0x5865F2).setDescription(d.slice(0,4000))]});return;
  }

  // ── !season ──
  if(base==="!season"){const m=M(isPro);const sd=new Date(m.season.startDate),day=Math.ceil((Date.now()-sd)/864e5);
    const act={};m.history.forEach(x=>[...x.teamA,...x.teamB].forEach(id=>{act[id]=(act[id]||0)+1;}));const ma=Object.entries(act).sort(([,a],[,b])=>b-a)[0];
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle(`📅  ${isPro?"Pro ":""}Season`).setColor(0xFEE75C).setDescription(`**Started:** ${sd.toLocaleDateString()}\n**Day:** ${day}\n**Matches:** ${m.season.matchCount}\n**Players:** ${Object.entries(m.stats).filter(([,s])=>s.games>0).length}\n${ma?`**Most Active:** <@${ma[0]}> (${ma[1]} games)`:""}`)]});return;
  }

  // ── !MMR ──
  if(base.startsWith("!MMR")&&!base.startsWith("!MMRreset")){const mentioned=msg.mentions.users.first(),tid=mentioned?mentioned.id:msg.author.id;
    const m=M(isPro);m.ensure(tid);const s=m.stats[tid];
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle(`🎯  ${isPro?"Pro ":""}MMR`).setColor(0x9B59B6).addFields({name:"Lifetime MMR",value:`\`${s.mmr}\``,inline:true},{name:"Season ELO",value:`\`${s.elo}\``,inline:true},{name:"Games",value:`\`${s.games}\``,inline:true})]});return;
  }
  if(base==="!MMRreset"){if(!ADMIN_IDS.includes(msg.author.id))return;const st=isPro?proStats:stats;Object.keys(st).forEach(id=>{st[id].mmr=1000;});if(isPro)await saveProStatsNow();else await saveStatsNow();await msg.channel.send(`🔄 ${isPro?"Pro ":""}MMR reset.`);return;}

  // ── !ladder / !ladderbet ──
  if(base==="!ladder"){if(ADMIN_IDS.includes(msg.author.id)){if(isPro)await updateProLadder();else await updateLadder();await msg.reply("✅ Ladder updated.");}else{const ch=msg.guild.channels.cache.find(c=>c.name===(isPro?"top-20-ladder-pro":"top-20-ladder")&&c.isTextBased());if(ch)await msg.reply(`📊 <#${ch.id}>`);} return;}
  if(content==="!ladderbet"){if(ADMIN_IDS.includes(msg.author.id)){for(const id of Object.keys(stats)){const cs=(stats[id].betWins||0)-(stats[id].betLosses||0);if((stats[id].betScore||0)!==cs)stats[id].betScore=cs;}await saveStatsNow();await updateBetLadder();await msg.reply("✅ Bet ladder updated.");}else{const ch=msg.guild.channels.cache.find(c=>c.name==="top-20-ladder-bet"&&c.isTextBased());if(ch)await msg.reply(`🎰 <#${ch.id}>`);} return;}

  // ── !setelo ──
  if(base.startsWith("!setelo")){if(!ADMIN_IDS.includes(msg.author.id))return;const args=base.split(/\s+/);const u=msg.mentions.users.first();const n=parseInt(args[args.length-1]);if(!u||isNaN(n))return msg.reply("Usage: `!setelo @player N`");
    const m=M(isPro);m.ensure(u.id);const old=m.stats[u.id].elo;m.stats[u.id].elo=n;await m.save();if(isPro)await updateProLadder();else await updateLadder();
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle("✏️ ELO Updated").setColor(0xFEE75C).setDescription(`<@${u.id}>\n\`${old}\` → \`${n}\``)]});return;}

  // ── !setMMR ──
  if(base.startsWith("!setMMR")){if(!ADMIN_IDS.includes(msg.author.id))return;const args=base.split(/\s+/);const u=msg.mentions.users.first();const n=parseInt(args[args.length-1]);if(!u||isNaN(n))return msg.reply("Usage: `!setMMR @player N`");
    const m=M(isPro);m.ensure(u.id);m.stats[u.id].mmr=n;await m.save();
    await msg.channel.send(`✅ <@${u.id}> ${isPro?"Pro ":""}MMR set to \`${n}\`.`);return;}

  // ── !resetstats ──
  if(base==="!resetstats"){if(!ADMIN_IDS.includes(msg.author.id))return;
    const st=isPro?proStats:stats,bf=isPro?proBackupFile:backupFile;
    try{await fs.promises.writeFile(bf,JSON.stringify(st,null,2));}catch(e){}
    const count=Object.keys(st).length;
    Object.keys(st).forEach(id=>{const mmr=st[id].mmr??1000;if(isPro)st[id]=Object.assign(defaultProStats(),{mmr});else st[id]=Object.assign(defaultStats(),{mmr});});
    if(isPro){proSeason={startDate:new Date().toISOString(),matchCount:0};proMatchHistory=[];await saveProStatsNow();await saveProSeason();await saveProHistory();await updateProLadder();}
    else{season={startDate:new Date().toISOString(),matchCount:0};matchHistory=[];await saveStatsNow();await saveSeason();await saveHistory();await updateLadder();}
    await msg.channel.send({embeds:[new EmbedBuilder().setTitle("🔄 Stats Reset").setColor(0xED4245).setDescription(`**${count} ${isPro?"pro ":""}players** reset. Use \`!oldstats${isPro?" pro":""}\` to undo.`)]});return;}

  // ── !oldstats ──
  if(base==="!oldstats"){if(!ADMIN_IDS.includes(msg.author.id))return;const bf=isPro?proBackupFile:backupFile;if(!fs.existsSync(bf))return msg.reply("No backup.");
    try{const d=JSON.parse(await fs.promises.readFile(bf,"utf8"));if(isPro)proStats=d;else stats=d;if(isPro)await saveProStatsNow();else await saveStatsNow();if(isPro)await updateProLadder();else await updateLadder();await msg.channel.send("✅ Stats restored.");}catch(e){await msg.reply("❌ Failed: "+e.message);}return;}

  // ── !resetelostats ──
  if(base.startsWith("!resetelostats")){if(!ADMIN_IDS.includes(msg.author.id))return;const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!resetelostats @player`");
    const m=M(isPro);m.ensure(u.id);const mmr=m.stats[u.id].mmr;
    if(isPro)m.stats[u.id]=Object.assign(defaultProStats(),{mmr});else m.stats[u.id]=Object.assign(defaultStats(),{mmr});
    await m.save();if(isPro)await updateProLadder();else await updateLadder();
    await msg.channel.send(`✅ <@${u.id}> reset to 1000 ELO${isPro?" (Pro)":""}.`);return;}

  // ── !resetlobby ──
  if(base.startsWith("!resetlobby")){if(!ADMIN_IDS.includes(msg.author.id))return;const args=base.split(/\s+/);const num=parseInt(args[1]);const lm=isPro?proLobbies:lobbies;
    if(num>=1&&num<=3){const lobby=lm.get(num);if(!lobby)return msg.reply(`❌ ${isPro?"Pro l":"L"}obby #${num} not active.`);await cancelMatch(lobby);await msg.channel.send(`🔄 ${isPro?"Pro l":"L"}obby #${num} reset.`);return;}
    const had=lm.size>0;const q=isPro?proQueue:queue;for(const id of q)await removeRole(msg.guild,id,inQueueRole);
    for(const[,lobby]of lm){lobby.active=false;lobby.phase=null;const all=[...new Set([...lobby.expected,...lobby.teamA,...lobby.teamB])];for(const id of all){await removeRole(msg.guild,id,inGameRole);await removeRole(msg.guild,id,inQueueRole);}
      stopTimer(lobby);clearTimeout(lobby.lobbyTimeout);clearTimeout(lobby.betTimeout);
      if(lobby.voiceA)await lobby.voiceA.delete().catch(()=>{});if(lobby.voiceB)await lobby.voiceB.delete().catch(()=>{});if(lobby.lobbyVoice)await lobby.lobbyVoice.delete().catch(()=>{});if(lobby.draftChannel)await lobby.draftChannel.delete().catch(()=>{});if(lobby.chatA)await lobby.chatA.delete().catch(()=>{});if(lobby.chatB)await lobby.chatB.delete().catch(()=>{});if(lobby.category)await lobby.category.delete().catch(()=>{});if(lobby.boardMsg)await lobby.boardMsg.delete().catch(()=>{});if(lobby.lobbyPingMsg)await lobby.lobbyPingMsg.delete().catch(()=>{});if(lobby.announceMsg)await lobby.announceMsg.delete().catch(()=>{});if(lobby.betMsg)await lobby.betMsg.delete().catch(()=>{});}
    lm.clear();if(isPro)proQueue=[];else queue=[];
    await refreshQueue(msg.channel,isPro).catch(()=>{});await msg.channel.send(`🔄 ${isPro?"Pro — all":"All"} lobbies/queue reset.`);return;}

  // ── !cancel ──
  if(base.startsWith("!cancel")){const hp=msg.member?.permissions.has(PermissionsBitField.Flags.ManageChannels)||ADMIN_IDS.includes(msg.author.id);if(!hp)return;
    const args=base.split(/\s+/);const num=parseInt(args[1]);const lm=isPro?proLobbies:lobbies;
    if(num>=1&&num<=3){const lobby=lm.get(num);if(!lobby)return msg.reply(`❌ Not active.`);await cancelMatch(lobby);return;}
    const lobby=findLobbyByDraftChannel(msg.channel.id);if(lobby){await cancelMatch(lobby);return;}
    if(lm.size===0)return msg.reply("No active lobbies.");
    return msg.reply(`❌ Specify: \`!cancel 1/2/3${isPro?" pro":""}\``);
  }

}catch(e){log("ERROR","messageCreate:",e);}});

// ─── BUTTON INTERACTIONS ─────────────────────────────────────────────
client.on("interactionCreate",async interaction=>{try{
  const cid=interaction.customId;

  // ── Modal submissions ──
  if(interaction.isModalSubmit()){
    // Scrim date/time modal
    if(cid.startsWith("scrim_setdate_")){
      const lobbyId=cid.replace("scrim_setdate_","");
      const lobby=findScrim(lobbyId);if(!lobby)return interaction.reply({content:"❌ Lobby not found.",ephemeral:true});
      const uid=interaction.user.id;
      const isAuth=uid===RAY_ID||ADMIN_IDS.includes(uid)||uid===lobby.creatorId;
      if(!isAuth)return interaction.reply({content:"❌ Only the lobby admin, Ray or admins can edit.",ephemeral:true});
      const dateStr=interaction.fields.getTextInputValue("date").trim();
      const timeStr=interaction.fields.getTextInputValue("time").trim();
      if(!/^\d{1,2}\/\d{1,2}$/.test(dateStr))return interaction.reply({content:"❌ Date format: DD/MM (e.g. 28/04).",ephemeral:true});
      if(!/^\d{1,2}:\d{2}$/.test(timeStr))return interaction.reply({content:"❌ Time format: HH:MM (e.g. 20:30).",ephemeral:true});
      lobby.dateStr=dateStr;lobby.timeStr=timeStr;
      await saveScrim();
      const ch=interaction.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
      if(ch)await updateScrimLobbyMessage(ch,lobby);
      await interaction.reply({content:`✅ Date/time set to **${dateStr} — ${timeStr}**.`,ephemeral:true});
      return;
    }
    // !command modals
    if(cid.startsWith("cmd_modal_")){
      const action=cid.replace("cmd_modal_","");
      // Helper to resolve a player input (mention, ID, or username) to a discord ID
      const resolvePlayer=async(input)=>{
        input=input.trim().replace(/[<@!>]/g,"");
        if(/^\d{17,20}$/.test(input))return input;
        // Try to find member by username/displayName
        const members=await interaction.guild.members.fetch().catch(()=>null);
        if(!members)return null;
        const found=members.find(m=>m.user.username.toLowerCase()===input.toLowerCase()||m.displayName.toLowerCase()===input.toLowerCase());
        return found?found.id:null;
      };
      if(action==="statsplayer"||action==="statsproplayer"){
        const isP=action==="statsproplayer";
        const inp=interaction.fields.getTextInputValue("player_id");
        const pid=await resolvePlayer(inp);
        if(!pid)return interaction.reply({content:`❌ Player not found: ${inp}`,ephemeral:true});
        const m=M(isP),st=m.stats;m.ensure(pid);const s=st[pid],total=s.wins+s.losses;
        const ranked=Object.entries(st).filter(([,x])=>x.games>0).sort(([,a],[,b])=>b.elo-a.elo);
        const rank=ranked.findIndex(([id])=>id===pid)+1;
        const fields=[{name:"ELO",value:`\`${s.elo}\``,inline:true},{name:"Peak ELO",value:`\`${s.peakElo||s.elo}\``,inline:true},{name:"Rank",value:`\`#${rank>0?rank:"—"} / ${ranked.length}\``,inline:true},{name:"Win Rate",value:`\`${total===0?0:Math.round(s.wins/total*100)}%\``,inline:true},{name:"Wins",value:`\`${s.wins}\``,inline:true},{name:"Losses",value:`\`${s.losses}\``,inline:true}];
        await interaction.reply({embeds:[new EmbedBuilder().setTitle(`📊 ${isP?"Pro ":""}Stats — <@${pid}>`).setColor(isP?0xDAA520:0x57F287).setDescription(`<@${pid}>`).addFields(fields)],ephemeral:true,allowedMentions:{parse:[]}});return;
      }
      if(action==="mmrplayer"){
        const inp=interaction.fields.getTextInputValue("player_id");
        const pid=await resolvePlayer(inp);
        if(!pid)return interaction.reply({content:`❌ Player not found: ${inp}`,ephemeral:true});
        ensurePlayer(pid);
        await interaction.reply({embeds:[new EmbedBuilder().setTitle("🏆 Lifetime MMR").setColor(0x9B59B6).setDescription(`<@${pid}> — \`${stats[pid].mmr} MMR\``)],ephemeral:true,allowedMentions:{parse:[]}});return;
      }
      if(action==="relation"){
        const i1=interaction.fields.getTextInputValue("p1");
        const i2=interaction.fields.getTextInputValue("p2");
        const p1=await resolvePlayer(i1),p2=await resolvePlayer(i2);
        if(!p1||!p2)return interaction.reply({content:`❌ Player(s) not found.`,ephemeral:true});
        // Compute h2h from match history
        let p1Wins=0,p2Wins=0;
        for(const x of matchHistory){
          const p1A=x.teamA.includes(p1),p1B=x.teamB.includes(p1),p2A=x.teamA.includes(p2),p2B=x.teamB.includes(p2);
          if((p1A&&p2B)||(p1B&&p2A)){
            const p1Won=(x.winner==="A"&&p1A)||(x.winner==="B"&&p1B);
            if(p1Won)p1Wins++;else p2Wins++;
          }
        }
        await interaction.reply({embeds:[new EmbedBuilder().setTitle("⚔️ Head-to-Head").setColor(0xE74C3C).setDescription(`<@${p1}> **${p1Wins}** — **${p2Wins}** <@${p2}>`)],ephemeral:true,allowedMentions:{parse:[]}});return;
      }
      return;
    }
    return;
  }

  if(!interaction.isButton())return;

  // ── !command quick-action buttons ──
  if(cid.startsWith("cmd_")){
    const action=cid.replace("cmd_","");
    // Direct actions (no argument needed)
    if(action==="queue"){await interaction.reply({content:"💡 To join the queue, type `!queue` or click the **Join** button in #queue-lobby-elo.",ephemeral:true});return;}
    if(action==="queuepro"){await interaction.reply({content:"💡 To join the Pro queue, type `!queue pro` or click the **Join** button in #queue-elb-pro.",ephemeral:true});return;}
    if(action==="stats"){
      // Run !stats for self
      const m=M(false),uid=interaction.user.id,st=m.stats;m.ensure(uid);const s=st[uid],total=s.wins+s.losses;
      const ranked=Object.entries(st).filter(([,x])=>x.games>0).sort(([,a],[,b])=>b.elo-a.elo);
      const rank=ranked.findIndex(([id])=>id===uid)+1;
      const fields=[{name:"ELO",value:`\`${s.elo}\``,inline:true},{name:"Peak ELO",value:`\`${s.peakElo||s.elo}\``,inline:true},{name:"Rank",value:`\`#${rank>0?rank:"—"} / ${ranked.length}\``,inline:true},{name:"Win Rate",value:`\`${total===0?0:Math.round(s.wins/total*100)}%\``,inline:true},{name:"Wins",value:`\`${s.wins}\``,inline:true},{name:"Losses",value:`\`${s.losses}\``,inline:true}];
      await interaction.reply({embeds:[new EmbedBuilder().setTitle(`📊 Your Stats`).setColor(0x57F287).addFields(fields)],ephemeral:true});return;
    }
    if(action==="statspro"){
      const m=M(true),uid=interaction.user.id,st=m.stats;m.ensure(uid);const s=st[uid],total=s.wins+s.losses;
      const ranked=Object.entries(st).filter(([,x])=>x.games>0).sort(([,a],[,b])=>b.elo-a.elo);
      const rank=ranked.findIndex(([id])=>id===uid)+1;
      const fields=[{name:"ELO",value:`\`${s.elo}\``,inline:true},{name:"Peak ELO",value:`\`${s.peakElo||s.elo}\``,inline:true},{name:"Rank",value:`\`#${rank>0?rank:"—"} / ${ranked.length}\``,inline:true},{name:"Win Rate",value:`\`${total===0?0:Math.round(s.wins/total*100)}%\``,inline:true},{name:"Wins",value:`\`${s.wins}\``,inline:true},{name:"Losses",value:`\`${s.losses}\``,inline:true}];
      await interaction.reply({embeds:[new EmbedBuilder().setTitle(`📊 Your Pro Stats`).setColor(0xDAA520).addFields(fields)],ephemeral:true});return;
    }
    if(action==="history"||action==="historypro"){
      const isP=action==="historypro";
      const m=M(isP),tid=interaction.user.id;
      const pm=m.history.filter(x=>[...x.teamA,...x.teamB].includes(tid)).slice(-5);
      if(!pm.length)return interaction.reply({content:"No history.",ephemeral:true});
      const desc=pm.reverse().map(x=>{const w=(x.winner==="A"&&x.teamA.includes(tid))||(x.winner==="B"&&x.teamB.includes(tid));const c=x.changes?.[tid]??0;return `${w?"🟢":"🔴"} **${w?"Win":"Loss"}** — ${c>=0?"+":""}${c} ELO • ${x.map||"?"}`;}).join("\n");
      await interaction.reply({embeds:[new EmbedBuilder().setTitle(`📜 Your last 5 ${isP?"Pro ":""}matches`).setColor(0x5865F2).setDescription(desc)],ephemeral:true});return;
    }
    if(action==="season"||action==="seasonpro"){
      const isP=action==="seasonpro";
      const m=M(isP);
      const startDate=new Date(m.season.startDate);
      const days=Math.floor((Date.now()-startDate.getTime())/864e5);
      await interaction.reply({embeds:[new EmbedBuilder().setTitle(`📅 ${isP?"Pro ":""}Season Info`).setColor(0xF1C40F).setDescription(`**Started:** ${startDate.toLocaleDateString()}\n**Days running:** ${days}\n**Matches played:** ${m.season.matchCount}`)],ephemeral:true});return;
    }
    if(action==="mmr"){
      const uid=interaction.user.id;ensurePlayer(uid);
      await interaction.reply({embeds:[new EmbedBuilder().setTitle("🏆 Your Lifetime MMR").setColor(0x9B59B6).setDescription(`<@${uid}> — \`${stats[uid].mmr} MMR\``)],ephemeral:true});return;
    }
    // Modal-based actions
    if(action==="statsplayer"||action==="statsproplayer"||action==="mmrplayer"){
      const isStatsPro=action==="statsproplayer";
      const isMMR=action==="mmrplayer";
      const modal=new ModalBuilder().setCustomId(`cmd_modal_${action}`).setTitle(isMMR?"Show MMR of player":"Show stats of player");
      const input=new TextInputBuilder().setCustomId("player_id").setLabel("Discord username, ID, or @mention").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("e.g. @PlayerName or 123456789012345678");
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);return;
    }
    if(action==="relation"){
      const modal=new ModalBuilder().setCustomId("cmd_modal_relation").setTitle("Head-to-head between two players");
      const i1=new TextInputBuilder().setCustomId("p1").setLabel("Player 1 (username, ID, or @mention)").setStyle(TextInputStyle.Short).setRequired(true);
      const i2=new TextInputBuilder().setCustomId("p2").setLabel("Player 2 (username, ID, or @mention)").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(i1),new ActionRowBuilder().addComponents(i2));
      await interaction.showModal(modal);return;
    }
    return;
  }

  // ── Scrim: Create new lobby ──
  if(cid==="scrim_create"){
    if(activeScrims().length>=MAX_SCRIM_LOBBIES)return interaction.reply({content:"❌ Max 5 active scrim lobbies reached.",ephemeral:true});
    const uid=interaction.user.id;
    // Create a unique role "Admin Lobby #XXXX"
    const lobbyId=generateScrimId();
    const role=await interaction.guild.roles.create({name:`Admin Lobby #${lobbyId}`,mentionable:false,reason:"Scrim lobby admin"}).catch(()=>null);
    const member=await interaction.guild.members.fetch(uid).catch(()=>null);
    if(role&&member)await member.roles.add(role).catch(()=>{});
    const newLobby={
      id:lobbyId,creatorId:uid,roleId:role?.id??null,dateStr:null,timeStr:null,
      teamA:[],teamB:[],captains:[],
      messageId:null,status:"open",replays:[],drafts:[],historyMsgId:null,createdAt:Date.now()
    };
    scrim.lobbies.push(newLobby);
    const ch=interaction.channel;
    const lobbyMsg=await ch.send({embeds:[scrimLobbyEmbed(newLobby)],components:scrimLobbyBtns(newLobby)}).catch(()=>null);
    if(lobbyMsg)newLobby.messageId=lobbyMsg.id;
    await saveScrim();
    await refreshCreateScrimBtn(ch);
    await interaction.reply({content:`✅ Scrim **#${lobbyId}** created! You're now the lobby admin.`,ephemeral:true});
    return;
  }

  // ── Scrim lobby buttons (dynamic id) ──
  if(cid.startsWith("scrim_")){
    const parts=cid.split("_");const lobbyId=parts[1].toUpperCase(),action=parts[2];
    const lobby=findScrim(lobbyId);if(!lobby)return interaction.reply({content:"❌ Lobby not found.",ephemeral:true});
    const uid=interaction.user.id;
    const ch=interaction.guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());

    // Set date/time (open modal)
    if(action==="setdate"){
      const isAuth=uid===RAY_ID||ADMIN_IDS.includes(uid)||uid===lobby.creatorId;
      if(!isAuth)return interaction.reply({content:"❌ Only the lobby admin, Ray or admins can edit.",ephemeral:true});
      const modal=new ModalBuilder().setCustomId(`scrim_setdate_${lobby.id}`).setTitle(`Set date/time — Scrim #${lobby.id}`);
      const dateInput=new TextInputBuilder().setCustomId("date").setLabel("Date (DD/MM)").setStyle(TextInputStyle.Short).setPlaceholder("28/04").setRequired(true).setValue(lobby.dateStr||"");
      const timeInput=new TextInputBuilder().setCustomId("time").setLabel("Time (HH:MM, Paris time)").setStyle(TextInputStyle.Short).setPlaceholder("20:30").setRequired(true).setValue(lobby.timeStr||"");
      modal.addComponents(new ActionRowBuilder().addComponents(dateInput),new ActionRowBuilder().addComponents(timeInput));
      await interaction.showModal(modal);
      return;
    }

    // End session (any of the 6 players)
    if(action==="end"){
      if(lobby.status!=="validated")return interaction.reply({content:"❌ Can only end a validated scrim.",ephemeral:true});
      if(!lobby.teamA.includes(uid)&&!lobby.teamB.includes(uid))return interaction.reply({content:"❌ Only players in the scrim can end the session.",ephemeral:true});
      lobby.status="archived";lobby.archivedAt=Date.now();scrim.archivedCount++;
      // DELETE the message from #ray-scrim-queue
      if(ch&&lobby.messageId){const m=await ch.messages.fetch(lobby.messageId).catch(()=>null);if(m)await m.delete().catch(()=>{});lobby.messageId=null;}
      // Post in history-scrim with screenshots/replays buttons
      const histCh=interaction.guild.channels.cache.find(c=>c.name==="history-scrim"&&c.isTextBased());
      if(histCh){
        const histMsg=await histCh.send({embeds:[scrimHistoryEmbed(lobby)],components:scrimHistoryBtns(lobby)}).catch(()=>null);
        if(histMsg){lobby.historyMsgId=histMsg.id;await saveScrim();}
      }
      if(ch)await refreshCreateScrimBtn(ch);
      await interaction.reply({content:`🏁 Scrim **#${lobby.id}** ended and archived to #history-scrim!`,ephemeral:true});
      return;
    }

    // Add replay → Google Form
    if(action==="addreplay"){
      await interaction.reply({content:"📤 Upload your replay here: https://forms.gle/8mLCHimQJEdaZErR6",ephemeral:true});
      return;
    }

    // Upload draft
    if(action==="uploaddraft"){
      const isAuth=uid===RAY_ID||ADMIN_IDS.includes(uid)||uid===lobby.creatorId||lobby.teamA.includes(uid)||lobby.teamB.includes(uid);
      if(!isAuth)return interaction.reply({content:"❌ Only players of this scrim can upload drafts.",ephemeral:true});
      await interaction.reply({content:`📸 To upload a draft screenshot for Scrim **#${lobby.id}**, paste the image directly in this channel with \`!draft ${lobby.id}\` as the message text.`,ephemeral:true});
      return;
    }

    // Join Team 1
    if(action==="joinA"){
      if(lobby.status!=="open"&&lobby.status!=="ready")return interaction.reply({content:"❌ This scrim is not accepting new players.",ephemeral:true});
      if(lobby.teamA.includes(uid)||lobby.teamB.includes(uid))return interaction.reply({content:"❌ You are already in this scrim.",ephemeral:true});
      if(lobby.teamA.length>=3)return interaction.reply({content:"❌ Team 1 is full.",ephemeral:true});
      lobby.teamA.push(uid);
      // Check if 6/6 reached
      if(lobby.teamA.length+lobby.teamB.length===6&&lobby.status==="open")lobby.status="ready";
      await saveScrim();
      if(ch)await updateScrimLobbyMessage(ch,lobby);
      await interaction.reply({content:`✅ Joined **Team 1** of Scrim #${lobby.id}!`,ephemeral:true});return;
    }
    if(action==="joinB"){
      if(lobby.status!=="open"&&lobby.status!=="ready")return interaction.reply({content:"❌ This scrim is not accepting new players.",ephemeral:true});
      if(lobby.teamA.includes(uid)||lobby.teamB.includes(uid))return interaction.reply({content:"❌ You are already in this scrim.",ephemeral:true});
      if(lobby.teamB.length>=3)return interaction.reply({content:"❌ Team 2 is full.",ephemeral:true});
      lobby.teamB.push(uid);
      if(lobby.teamA.length+lobby.teamB.length===6&&lobby.status==="open")lobby.status="ready";
      await saveScrim();
      if(ch)await updateScrimLobbyMessage(ch,lobby);
      await interaction.reply({content:`✅ Joined **Team 2** of Scrim #${lobby.id}!`,ephemeral:true});return;
    }
    if(action==="leave"){
      if(!lobby.teamA.includes(uid)&&!lobby.teamB.includes(uid))return interaction.reply({content:"❌ You are not in this scrim.",ephemeral:true});
      lobby.teamA=lobby.teamA.filter(id=>id!==uid);lobby.teamB=lobby.teamB.filter(id=>id!==uid);
      // If we were ready (6/6), go back to open
      if(lobby.status==="ready"&&lobby.teamA.length+lobby.teamB.length<6)lobby.status="open";
      await saveScrim();
      if(ch)await updateScrimLobbyMessage(ch,lobby);
      await interaction.reply({content:`❌ Left Scrim #${lobby.id}.`,ephemeral:true});return;
    }
    return;
  }

  // ── Queue buttons ──
  if(cid==="q_join"||cid==="pq_join"){
    const isPro=cid==="pq_join";
    const lockRef=isPro?"_proQueueLock":"_queueLock";
    if(isPro?_proQueueLock:_queueLock)return interaction.reply({content:"⏳ Wait.",ephemeral:true});
    if(isPro)_proQueueLock=true;else _queueLock=true;
    try{
      const m=M(isPro),q=isPro?proQueue:queue,lm=m.lobbies;
      if(allSlotsActive(lm)){if(isPro)_proQueueLock=false;else _queueLock=false;return interaction.reply({content:"⏳ All lobbies in progress.",ephemeral:true});}
      await ensureRoles(interaction.guild);m.ensure(interaction.user.id);
      // Pro role check
      if(isPro){const mb=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);if(!mb||!mb.roles.cache.some(r=>r.name==="Pro")){if(isPro)_proQueueLock=false;return interaction.reply({content:"❌ You need the Pro role.",ephemeral:true});}}
      if(bannedPlayers.has(interaction.user.id)){if(isPro)_proQueueLock=false;else _queueLock=false;return interaction.reply({content:"❌ You are banned.",ephemeral:true});}
      if(findLobbyByPlayer(interaction.user.id)||findLobbyByExpected(interaction.user.id)){if(isPro)_proQueueLock=false;else _queueLock=false;return interaction.reply({content:"❌ Already in a match.",ephemeral:true});}
      if(q.includes(interaction.user.id)){if(isPro)_proQueueLock=false;else _queueLock=false;return interaction.reply({content:"Already in queue.",ephemeral:true});}
      // Queue full check — pro: dynamic slots = 6 + placements + dodged
      let maxSlots=6;
      if(isPro){
        const placementsInQ=q.filter(id=>placementPlayers.has(id)).length;
        const dodgedInQ=q.filter(id=>getDodgeCount(id)>0).length;
        maxSlots=6+placementsInQ+dodgedInQ;
      }
      if(q.length>=maxSlots){if(isPro)_proQueueLock=false;else _queueLock=false;return interaction.reply({content:"Queue full.",ephemeral:true});}
      q.push(interaction.user.id);await addRole(interaction.guild,interaction.user.id,inQueueRole);
      if(isPro)proQueueJoinTime[interaction.user.id]=Date.now();

      // If pro, a 15s delay is pending, and this new player is NOT a placement → swap with placement and start immediately
      if(isPro&&_proPlacementDelay){
        if(!placementPlayers.has(interaction.user.id)){
          clearTimeout(_proPlacementDelay);_proPlacementDelay=null;
          // Find first placement player in queue and move them to the back
          const firstPlacementIdx=proQueue.findIndex(id=>placementPlayers.has(id));
          if(firstPlacementIdx>=0){
            const placeId=proQueue.splice(firstPlacementIdx,1)[0];
            proQueue.push(placeId);
            const placedMember=await interaction.guild.members.fetch(placeId).catch(()=>null);
            if(placedMember)await placedMember.send(`📋 You were swapped out of the Pro queue because a non-placement player joined. You've been moved to the next lobby.`).catch(()=>{});
            await interaction.channel.send(`✅ Non-placement player <@${interaction.user.id}> joined — <@${placeId}> was swapped out to the next lobby.`).catch(()=>{});
          }
        }
      }

      await interaction.deferUpdate().catch(()=>{});
      await interaction.message.edit({embeds:[queueEmbed(isPro)],components:[queueBtns(isPro)]}).catch(()=>{});
      tryStartLobby(interaction.channel,isPro);
    }finally{if(isPro)_proQueueLock=false;else _queueLock=false;}
    return;
  }
  if(cid==="q_leave"||cid==="pq_leave"){
    const isPro=cid==="pq_leave";if(isPro?_proQueueLock:_queueLock)return interaction.reply({content:"⏳",ephemeral:true});
    if(isPro)_proQueueLock=true;else _queueLock=true;
    try{const q=isPro?proQueue:queue;const was=q.includes(interaction.user.id);
      if(isPro)proQueue=proQueue.filter(id=>id!==interaction.user.id);else queue=queue.filter(id=>id!==interaction.user.id);
      if(isPro)delete proQueueJoinTime[interaction.user.id];
      if(was)await removeRole(interaction.guild,interaction.user.id,inQueueRole);
      // Cancel placement delay if queue dropped below 6
      if(isPro&&_proPlacementDelay&&proQueue.length<6){clearTimeout(_proPlacementDelay);_proPlacementDelay=null;}
      await interaction.deferUpdate().catch(()=>{});
      await interaction.message.edit({embeds:[queueEmbed(isPro)],components:[queueBtns(isPro)]}).catch(()=>{});
    }finally{if(isPro)_proQueueLock=false;else _queueLock=false;}
    return;
  }

  // ── Lobby buttons ──
  if(!cid.startsWith("L")&&!cid.startsWith("P"))return;
  const isPro=cid[0]==="P";
  const lobbyId=parseInt(cid[1]);if(isNaN(lobbyId))return;
  const lm=isPro?proLobbies:lobbies;
  const lobby=lm.get(lobbyId);
  if(!lobby)return interaction.reply({content:"❌ Lobby no longer exists.",ephemeral:true});
  const rest=cid.substring(3);

  // ── Bet (normal + pro) ──
  if(rest==="betA"||rest==="betB"){
    const uid=interaction.user.id;
    if([...lobby.teamA,...lobby.teamB].includes(uid))return interaction.reply({content:"❌ Can't bet on your own match.",ephemeral:true});
    if(lobby.betsClosed)return interaction.reply({content:"❌ Bets closed.",ephemeral:true});
    if(lobby.bets.A.includes(uid)||lobby.bets.B.includes(uid))return interaction.reply({content:"❌ Already bet.",ephemeral:true});
    const side=rest==="betA"?"A":"B";lobby.bets[side].push(uid);ensurePlayer(uid);
    await interaction.reply({content:`✅ You bet on **${teamLabel(lobby,side)}**.`,ephemeral:true});
    const announceCh=lobby.isPro?(interaction.guild.channels.cache.find(c=>c.name==="bet-pro"&&c.isTextBased())||lobby.channel):lobby.channel;
    await announceCh.send(`🎰 <@${uid}> bet on **${teamLabel(lobby,side)}**!`).catch(()=>{});return;
  }

  // ── Cancel vote ──
  if(rest==="cancel_match"){
    if(![...lobby.teamA,...lobby.teamB].includes(interaction.user.id))return interaction.reply({content:"❌ Not in match.",ephemeral:true});
    if(lobby.cancelVotes.has(interaction.user.id))return interaction.reply({content:"❌ Already voted.",ephemeral:true});
    lobby.cancelVotes.add(interaction.user.id);
    if(lobby.cancelVotes.size>=CANCEL_VOTES){await interaction.deferUpdate().catch(()=>{});lobby.phase="cancelled";await cancelMatch(lobby);}
    else{await interaction.reply({content:`✅ Cancel vote (${lobby.cancelVotes.size}/${CANCEL_VOTES})`,ephemeral:true});if(lobby.phase==="draft")pushBoard(lobby);
      else if(lobby.phase==="vote"&&lobby.boardMsg){const L=`${isPro?"P":"L"}${lobby.lobbyId}_`;const r1=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(L+"voteA").setLabel(`🔵 Team ${lobby.teamNumA} Won`).setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(L+"voteB").setLabel(`🔴 Team ${lobby.teamNumB} Won`).setStyle(ButtonStyle.Danger));await lobby.boardMsg.edit({components:[r1,cancelBtnRow(lobby)]}).catch(()=>{});}}
    return;
  }

  // ── Category ──
  if(lobby.active&&lobby.phase==="draft"&&rest.startsWith("cat_")){
    const s=stepOf(lobby);if(!s)return interaction.reply({content:"❌ Over.",ephemeral:true});
    if(interaction.user.id!==captainOf(lobby))return interaction.reply({content:`❌ Only captain.`,ephemeral:true});
    const cat=rest.replace("cat_","");if(cat==="back"){lobby.activeCategory=null;await interaction.update({embeds:[boardEmbed(lobby)],components:buildDraftButtons(lobby)});return;}
    lobby.activeCategory=cat;await interaction.update({embeds:[boardEmbed(lobby)],components:buildDraftButtons(lobby)});return;
  }

  // ── Ban ──
  if(lobby.active&&lobby.phase==="draft"&&rest.startsWith("ban_")){
    const s=stepOf(lobby);if(!s)return interaction.reply({content:"❌ Over.",ephemeral:true});
    if(interaction.user.id!==captainOf(lobby))return interaction.reply({content:"❌ Only captain.",ephemeral:true});
    if(s.type!=="ban")return interaction.reply({content:"❌ Pick phase.",ephemeral:true});
    const ch=rest.replace("ban_","");if(lobby.globalBans.includes(ch))return interaction.reply({content:"❌ Global banned.",ephemeral:true});
    if(lobby.bans[s.team].includes(ch))return interaction.reply({content:"❌ Already banned.",ephemeral:true});
    const es=lobby.draftStep;stopTimer(lobby);await interaction.deferUpdate().catch(()=>{});if(lobby.draftStep!==es)return;
    if(s.global){lobby.globalBans.push(ch);lobby.available=lobby.available.filter(c=>c!==ch);championSpotlight(lobby,"GLOBAL BAN",s.team,ch,interaction.user.id);}
    else{lobby.bans[s.team].push(ch);const opp=s.team==="A"?"B":"A";if(lobby.bans[opp].includes(ch))lobby.available=lobby.available.filter(c=>c!==ch);championSpotlight(lobby,"BAN",s.team,ch,interaction.user.id);}
    advanceDraft(lobby);return;
  }

  // ── Pick ──
  if(lobby.active&&lobby.phase==="draft"&&rest.startsWith("pick_")){
    const s=stepOf(lobby);if(!s)return interaction.reply({content:"❌ Over.",ephemeral:true});
    if(interaction.user.id!==captainOf(lobby))return interaction.reply({content:"❌ Only captain.",ephemeral:true});
    if(s.type!=="pick")return interaction.reply({content:"❌ Ban phase.",ephemeral:true});
    const ch=rest.replace("pick_",""),oppBans=s.team==="A"?lobby.bans.B:lobby.bans.A,myPicks=lobby.picks[s.team];
    if(oppBans.includes(ch)&&!lobby.bans[s.team].includes(ch))return interaction.reply({content:"❌ Banned.",ephemeral:true});
    if(!lobby.available.includes(ch))return interaction.reply({content:"❌ Unavailable.",ephemeral:true});
    if(myPicks.includes(ch))return interaction.reply({content:"❌ Already picked.",ephemeral:true});
    const es=lobby.draftStep;stopTimer(lobby);await interaction.deferUpdate().catch(()=>{});if(lobby.draftStep!==es)return;
    lobby.picks[s.team].push(ch);championSpotlight(lobby,"PICK",s.team,ch,interaction.user.id);advanceDraft(lobby);return;
  }

  // ── Vote ──
  if(lobby.active&&lobby.phase==="vote"&&(rest==="voteA"||rest==="voteB")){
    if(![...lobby.teamA,...lobby.teamB].includes(interaction.user.id))return interaction.reply({content:"❌ Not in match.",ephemeral:true});
    if(lobby.phase!=="vote")return interaction.reply({content:"❌ Processing.",ephemeral:true});
    const side=rest==="voteA"?"A":"B";lobby.votes.A.delete(interaction.user.id);lobby.votes.B.delete(interaction.user.id);lobby.votes[side].add(interaction.user.id);
    const vA=lobby.votes.A.size,vB=lobby.votes.B.size;
    if(vA>=3||vB>=3){lobby.phase="finished";await interaction.reply({content:`✅ Match resolving...`,ephemeral:true});finishMatch(lobby,vA>=3?"A":"B").catch(e=>log("ERROR","finishMatch:",e));}
    else await interaction.reply({content:`✅ Voted **${teamLabel(lobby,side)}**. (${vA}/3 | ${vB}/3)`,ephemeral:true});
    return;
  }

}catch(e){log("ERROR","interaction:",e);if(!interaction.deferred&&!interaction.replied)interaction.reply({content:"❌ Error.",ephemeral:true}).catch(()=>{});}});

// ─── READY ───────────────────────────────────────────────────────────
client.once("ready",async()=>{
  log("INFO",`Bot ready — ${client.user.tag}`);
  // ── ONE-SHOT: wipe all dodges on this deployment ──
  if(!fs.existsSync(p("dodges-wiped.flag"))){
    const count=Object.keys(dodges).length;
    dodges={};await saveDodges();
    try{await fs.promises.writeFile(p("dodges-wiped.flag"),new Date().toISOString());}catch(e){}
    log("INFO",`Wiped all dodges (${count} users had dodge lists).`);
  }
  for(const[,guild]of client.guilds.cache){
    await ensureRoles(guild).catch(()=>{});
    const lc=guild.channels.cache.find(c=>c.name==="top-20-ladder"&&c.isTextBased());if(lc){ladderChannel=lc;await updateLadder();}
    const blc=guild.channels.cache.find(c=>c.name==="top-20-ladder-bet"&&c.isTextBased());if(blc){betLadderChannel=blc;await updateBetLadder();}
    const plc=guild.channels.cache.find(c=>c.name==="top-20-ladder-pro"&&c.isTextBased());if(plc){proLadderChannel=plc;await updateProLadder();}
    // Refresh scrim hub + existing lobby messages
    const scrimCh=guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
    if(scrimCh){
      await refreshCreateScrimBtn(scrimCh).catch(()=>{});
      for(const lobby of scrim.lobbies){
        if(lobby.status!=="archived")await updateScrimLobbyMessage(scrimCh,lobby).catch(()=>{});
      }
    }
  }
  // Weekly recap every hour check, Sunday 20:00 UTC
  setInterval(async()=>{
    const now=new Date();if(now.getUTCDay()!==0||now.getUTCHours()!==20)return;
    for(const[,guild]of client.guilds.cache){
      for(const isPro of[false,true]){
        const m=M(isPro);const genCh=guild.channels.cache.find(c=>c.name===m.genCh&&c.isTextBased());if(!genCh)continue;
        const wk=Date.now()-7*864e5;const wm=m.history.filter(x=>x.timestamp>wk);if(!wm.length)continue;
        const act={};wm.forEach(x=>[...x.teamA,...x.teamB].forEach(id=>{act[id]=(act[id]||0)+1;}));const ma=Object.entries(act).sort(([,a],[,b])=>b-a)[0];
        let desc=`**📊 Matches:** ${wm.length}\n`;if(ma)desc+=`**🏃 Most Active:** <@${ma[0]}> (${ma[1]})\n`;
        await genCh.send({embeds:[new EmbedBuilder().setTitle(`📅  ${isPro?"Pro ":""}Weekly Recap`).setColor(0xF1C40F).setDescription(desc).setTimestamp()]}).catch(()=>{});
      }
    }
  },3600_000);

  // ── 1h auto-leave for pro queue (check every minute) ──
  setInterval(async()=>{
    if(proQueue.length===0)return;
    const now=Date.now(),ONE_HOUR=3600_000;
    const toRemove=[];
    for(const id of proQueue){
      const joinTs=proQueueJoinTime[id];
      if(joinTs&&(now-joinTs)>=ONE_HOUR)toRemove.push(id);
    }
    if(toRemove.length===0)return;
    proQueue=proQueue.filter(id=>!toRemove.includes(id));
    for(const[,guild]of client.guilds.cache){
      for(const id of toRemove){
        delete proQueueJoinTime[id];
        await removeRole(guild,id,inQueueRole);
        const mb=await guild.members.fetch(id).catch(()=>null);
        if(mb)await mb.send(`⏰ You've been removed from the Pro queue after 1 hour of inactivity. No match popped during that time.`).catch(()=>{});
      }
      const qCh=guild.channels.cache.find(c=>c.name==="queue-elb-pro"&&c.isTextBased());
      if(qCh)await repushQueue(qCh,true).catch(()=>{});
    }
    log("INFO",`Removed ${toRemove.length} inactive players from pro queue after 1h`);
  },60_000);

  // ── Scrim auto-start cron: when scheduled time is reached AND 6/6 players, start immediately ──
  setInterval(async()=>{
    const now=new Date();
    const nowMs=Date.now();
    const parisParts=new Intl.DateTimeFormat("fr-FR",{timeZone:"Europe/Paris",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(now);
    const partMap={};parisParts.forEach(p=>partMap[p.type]=p.value);
    const parisDate=`${partMap.day}/${partMap.month}`;
    const parisHour=parseInt(partMap.hour),parisMinute=parseInt(partMap.minute);
    const parisMinutesTotal=parisHour*60+parisMinute;

    for(const lobby of scrim.lobbies){
      if(lobby.status!=="ready"||!lobby.dateStr||!lobby.timeStr)continue;
      if(lobby.teamA.length+lobby.teamB.length!==6)continue;

      const [d,m]=lobby.dateStr.split("/").map(x=>x.padStart(2,"0"));
      const normDate=`${d}/${m}`;
      if(normDate!==parisDate)continue;

      const [sh,sm]=lobby.timeStr.split(":").map(x=>parseInt(x));
      const scrimMinutesTotal=sh*60+sm;

      // If scheduled time is reached (or passed today) → start the scrim
      if(parisMinutesTotal>=scrimMinutesTotal){
        lobby.status="validated";
        await saveScrim();
        for(const[,guild]of client.guilds.cache){
          // Post recap in general-scrim-chat
          const genCh=guild.channels.cache.find(c=>c.name==="general-scrim-chat"&&c.isTextBased());
          if(genCh){
            const recap=new EmbedBuilder().setTitle(`🎯  Scrim #${lobby.id} — Starting Now!`).setColor(0x57F287)
              .setDescription(`📅 **${lobby.dateStr} — ${lobby.timeStr}**\n\n**🔵 Team 1:**\n${lobby.teamA.map(id=>`<@${id}>`).join("\n")}\n\n**🔴 Team 2:**\n${lobby.teamB.map(id=>`<@${id}>`).join("\n")}\n\n*The scrim is starting now! GL HF!*`)
              .setTimestamp();
            await genCh.send({content:`${lobby.teamA.concat(lobby.teamB).map(id=>`<@${id}>`).join(" ")}`,embeds:[recap],allowedMentions:{users:lobby.teamA.concat(lobby.teamB)}}).catch(()=>{});
          }
          // Update scrim message (now shows Upload Draft + End session buttons)
          const ch=guild.channels.cache.find(c=>c.name==="ray-scrim-queue"&&c.isTextBased());
          if(ch)await updateScrimLobbyMessage(ch,lobby);
        }
        log("INFO",`Scrim #${lobby.id} auto-started (time reached with 6/6 players)`);
      }
    }

    // Archive role cleanup: delete roles of lobbies archived more than 24h ago
    for(const lobby of scrim.lobbies){
      if(lobby.status==="archived"&&lobby.roleId&&lobby.archivedAt&&(nowMs-lobby.archivedAt)>=24*3600_000){
        for(const[,guild]of client.guilds.cache){
          const r=guild.roles.cache.get(lobby.roleId);
          if(r)await r.delete("Scrim archived 24h ago").catch(()=>{});
        }
        lobby.roleId=null;
        await saveScrim();
      }
    }
  },60_000);
});

// ─── HEALTH CHECK ────────────────────────────────────────────────────
require("http").createServer((q,r)=>{r.writeHead(200);r.end("ok");}).listen(process.env.PORT||10000);

// ─── LOGIN ───────────────────────────────────────────────────────────
log("INFO",`TOKEN present: ${!!process.env.TOKEN}`);
client.login(process.env.TOKEN).then(()=>log("INFO","Login OK")).catch(e=>{log("ERROR","Login:",e.message);process.exit(1);});