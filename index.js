process.on("unhandledRejection", (err) => log("ERROR", err));
process.on("uncaughtException",  (err) => log("ERROR", err));
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require("discord.js");
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
const DRAFT_TIMER=75, SOLO_TIMER=20, LOBBY_TIMEOUT=200, MAX_LOBBIES=3, CANCEL_VOTES=4;
const ADMIN_IDS=["341553327412346880","279249193195929601"];
const MAPS=["Blackstone Arena Day","Dragon Garden Night","Mount Araz Night"];
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
const queueMessages={},proQueueMessages={};
let ladderMsg=null,ladderChannel=null,betLadderMsg=null,betLadderChannel=null,proLadderMsg=null,proLadderChannel=null;
const lobbies=new Map(),proLobbies=new Map();

function createLobby(lobbyId,isPro=false) {
  const off=(lobbyId-1)*2;
  return {
    lobbyId,isPro,teamNumA:off+1,teamNumB:off+2,
    active:false,phase:null,expected:[],teamA:[],teamB:[],
    captainA:null,captainB:null,draftStep:0,available:[...CHAMPS],globalBans:[],
    bans:{A:[],B:[]},picks:{A:[],B:[]},votes:{A:new Set(),B:new Set()},cancelVotes:new Set(),
    channel:null,draftChannel:null,chatA:null,chatB:null,
    lobbyVoice:null,category:null,voiceA:null,voiceB:null,
    boardMsg:null,announceMsg:null,lobbyPingMsg:null,activeCategory:null,
    timerInterval:null,timerTimeout:null,timerSeconds:DRAFT_TIMER,lobbyTimeout:null,
    map:null,bets:{A:[],B:[]},betMsg:null,betsClosed:false,betTimeout:null,
    soloPhase:-1,soloPending:{A:null,B:null},soloPickedPlayers:[],
    _boardQueue:Promise.resolve()
  };
}

function getFreeLobbySlot(lm){for(let i=1;i<=3;i++)if(!lm.has(i))return i;return null;}
function allSlotsActive(lm){return lm.has(1)&&lm.has(2)&&lm.has(3);}
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
function queueEmbed(isPro){
  const m=M(isPro),lm=m.lobbies,q=isPro?proQueue:queue;
  const slot=getFreeLobbySlot(lm);
  const next=slot?`Lobby #${slot}${m.tag}`:null;
  const title=isPro?`⚔️🔥 PRO QUEUE — Battlerite 3v3${next?` (${next})`:""}`:`⚔️ Battlerite 3v3 — Queue${next?` (${next})`:""}`;
  let desc;
  if(!next)desc=`*⏳ All ${isPro?"pro ":""}lobbies are in progress. Please wait.*`;
  else if(q.length===0)desc=isPro?"*Queue is empty — click **Join** to enter!\nOnly players with the Pro role can queue.*":"*Queue is empty — click **Join** to enter!*";
  else desc=q.map((id,i)=>`**${i+1}.** <@${id}> — \`${(m.stats[id]?.elo??1000)} ELO\``).join("\n");
  return new EmbedBuilder().setTitle(title).setColor(m.color).setDescription(desc).setFooter({text:`${q.length} / 6 players`});
}
function queueBtns(isPro,disabled=false){
  const lm=isPro?proLobbies:lobbies;const blocked=allSlotsActive(lm);const pre=isPro?"pq_":"q_";
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(pre+"join").setLabel("✅  Join").setStyle(ButtonStyle.Success).setDisabled(disabled||blocked),
    new ButtonBuilder().setCustomId(pre+"leave").setLabel("❌  Leave").setStyle(ButtonStyle.Danger).setDisabled(disabled));
}
async function refreshQueue(channel,isPro,locked=false){
  const msgs=isPro?proQueueMessages:queueMessages;
  for(const chId of Object.keys(msgs)){if(chId===channel.id)continue;const ch=client.channels.cache.get(chId);if(!ch){delete msgs[chId];continue;}msgs[chId]?.delete().catch(()=>{});delete msgs[chId];}
  const ex=msgs[channel.id];if(ex){await ex.delete().catch(()=>{});delete msgs[channel.id];}
  try{const recent=await channel.messages.fetch({limit:20});const old=recent.filter(m=>m.author.id===client.user.id&&m.embeds.length>0&&m.embeds[0].title?.includes("Queue"));for(const[,m]of old)await m.delete().catch(()=>{});}catch(e){}
  msgs[channel.id]=await channel.send({embeds:[queueEmbed(isPro)],components:[queueBtns(isPro,locked)]});
}

// ─── DRAFT BOARD ─────────────────────────────────────────────────────
function boardEmbed(lobby){
  const s=stepOf(lobby);if(!s)return new EmbedBuilder().setTitle("Draft complete").setColor(0x57F287);
  const isBan=s.type==="ban",isG=isBan&&s.global,sec=lobby.timerSeconds,cap=captainOf(lobby),m=M(lobby.isPro);
  let action;
  if(isG)action=`🌍 **${teamLabel(lobby,s.team)} must GLOBAL BAN** — Captain <@${cap}>\n*Removed for BOTH teams.*`;
  else if(isBan)action=`🚫 **${teamLabel(lobby,s.team)} must BAN** — Captain <@${cap}>`;
  else action=`🎯 **${teamLabel(lobby,s.team)} must PICK** — Captain <@${cap}>`;
  const tA=lobby.teamA.map((id,i)=>{const cr=id===lobby.captainA?"👑 ":"";const pk=lobby.picks.A[i]?champDisplay(lobby.picks.A[i]):"`[ ? ]`";return `${cr}<@${id}>\n${pk}`;}).join("\n\n");
  const tB=lobby.teamB.map((id,i)=>{const cr=id===lobby.captainB?"👑 ":"";const pk=lobby.picks.B[i]?champDisplay(lobby.picks.B[i]):"`[ ? ]`";return `${cr}<@${id}>\n${pk}`;}).join("\n\n");
  const gB=lobby.globalBans.length>0?lobby.globalBans.map(c=>champBanDisplay(c,true)).join(", "):"—";
  const rA=lobby.bans.A.length>0?lobby.bans.A.map(c=>champBanDisplay(c,false)).join(", "):"—";
  const rB=lobby.bans.B.length>0?lobby.bans.B.map(c=>champBanDisplay(c,false)).join(", "):"—";
  const title=isG?`🌍  ${lobby.isPro?"PRO ":""}LOBBY #${lobby.lobbyId} — Global Ban Phase`:isBan?`🚫  ${lobby.isPro?"PRO ":""}LOBBY #${lobby.lobbyId} — Ban Phase`:`🎯  ${lobby.isPro?"PRO ":""}LOBBY #${lobby.lobbyId} — Pick Phase`;
  const color=isG?0xE67E22:isBan?(lobby.isPro?0x8B0000:0xED4245):(lobby.isPro?0x8B0000:0x5865F2);
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

// ─── SOLOQ DRAFT SYSTEM ─────────────────────────────────────────────
const SOLO_PHASES=["ban","pick1","pick2","pick3"];

function soloBoardEmbed(lobby){
  const ph=lobby.soloPhase,isBan=ph===0;
  const title=`🎮  SOLOQ LOBBY #${lobby.lobbyId} — ${isBan?"Ban Phase":`Pick Tour ${ph}`}`;
  const color=isBan?0xED4245:0x5865F2;
  const bansStr=lobby.bans.A.length||lobby.bans.B.length
    ?`🚫 **Bans:** ${lobby.bans.A.map(c=>champBanDisplay(c,false)).join(", ")||"—"} (T${lobby.teamNumA}) / ${lobby.bans.B.map(c=>champBanDisplay(c,false)).join(", ")||"—"} (T${lobby.teamNumB})`:"";
  let picksStr="";
  if(lobby.picks.A.some(x=>x)||lobby.picks.B.some(x=>x)){
    picksStr=`\n\n**🔵 Team ${lobby.teamNumA}:**\n`+lobby.teamA.map((id,i)=>{const pp=lobby.picks.A[i];return pp?`<@${id}> — ${champDisplay(pp)}`:`<@${id}> — \`[ ? ]\``;}).join("\n")+
      `\n\n**🔴 Team ${lobby.teamNumB}:**\n`+lobby.teamB.map((id,i)=>{const pp=lobby.picks.B[i];return pp?`<@${id}> — ${champDisplay(pp)}`:`<@${id}> — \`[ ? ]\``;}).join("\n");
  }
  const statusA=lobby.soloPending.A?"✅ Ready":"⏳ "+(isBan?"Banning...":"Picking...");
  const statusB=lobby.soloPending.B?"✅ Ready":"⏳ "+(isBan?"Banning...":"Picking...");
  const who=isBan?`**Captains ban simultaneously**\n🔵 T${lobby.teamNumA}: ${statusA}\n🔴 T${lobby.teamNumB}: ${statusB}`
    :`**One player per team picks**\n🔵 T${lobby.teamNumA}: ${statusA}\n🔴 T${lobby.teamNumB}: ${statusB}`;
  return new EmbedBuilder().setTitle(title).setColor(color)
    .setDescription(`🗺️ **Map: ${lobby.map}**\n\n${bansStr}${picksStr}\n\n${who}\n\n⏱️ **${lobby.timerSeconds}s**`)
    .setFooter({text:`${SOLO_TIMER}s per phase • auto random on timeout`});
}

function soloQCatBtns(lobby){
  const L=`L${lobby.lobbyId}_`,isBan=lobby.soloPhase===0;
  const st=isBan?ButtonStyle.Danger:ButtonStyle.Success;
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(L+"cat_Melee").setLabel("⚔️ Melee").setStyle(st),
    new ButtonBuilder().setCustomId(L+"cat_Range").setLabel("🏹 Range").setStyle(st),
    new ButtonBuilder().setCustomId(L+"cat_Support").setLabel("💚 Support").setStyle(st)),
    cancelBtnRow(lobby)];
}

function pushSoloBoard(lobby){
  if(!lobby.boardMsg)return;
  lobby._boardQueue=(lobby._boardQueue||Promise.resolve()).then(async()=>{
    if(!lobby.boardMsg)return;
    await lobby.boardMsg.edit({embeds:[soloBoardEmbed(lobby)],components:soloQCatBtns(lobby)}).catch(()=>{});
  }).catch(()=>{});
}

async function startSoloPhase(lobby){
  stopTimer(lobby);
  lobby.soloPending={A:null,B:null};
  lobby.timerSeconds=SOLO_TIMER;
  if(!lobby.boardMsg){
    lobby.boardMsg=await lobby.draftChannel.send({embeds:[soloBoardEmbed(lobby)],components:soloQCatBtns(lobby)}).catch(()=>null);
    if(!lobby.boardMsg)return;
  }else await pushSoloBoard(lobby);

  lobby.timerInterval=setInterval(async()=>{
    lobby.timerSeconds-=5;if(lobby.timerSeconds<=0){clearInterval(lobby.timerInterval);lobby.timerInterval=null;return;}
    await pushSoloBoard(lobby);
  },5000);

  lobby.timerTimeout=setTimeout(async()=>{
    stopTimer(lobby);if(!lobby.active||lobby.phase!=="draft")return;
    // Auto-random for teams that didn't act
    const isBan=lobby.soloPhase===0;
    for(const side of["A","B"]){
      if(!lobby.soloPending[side]){
        if(isBan){
          const pool=CHAMPS.filter(c=>!lobby.bans.A.includes(c)&&!lobby.bans.B.includes(c));
          const ch=pool[Math.floor(Math.random()*pool.length)];
          lobby.soloPending[side]={playerId:side==="A"?lobby.captainA:lobby.captainB,champ:ch};
        }else{
          const team=side==="A"?lobby.teamA:lobby.teamB;
          const oppBans=side==="A"?lobby.bans.B:lobby.bans.A;
          const myPicks=lobby.picks[side];
          const eligible=team.filter(id=>!lobby.soloPickedPlayers.includes(id));
          const picker=eligible[0];
          const pool=CHAMPS.filter(c=>!oppBans.includes(c)&&!myPicks.includes(c)&&!lobby.bans[side].includes(c));
          const ch=pool[Math.floor(Math.random()*pool.length)]??CHAMPS[0];
          lobby.soloPending[side]={playerId:picker,champ:ch};
        }
        await lobby.draftChannel.send(`⏱️ Time's up! Auto-random for **${teamLabel(lobby,side)}**.`).catch(()=>{});
      }
    }
    revealSoloPhase(lobby);
  },SOLO_TIMER*1000);
}

function checkSoloReady(lobby){
  if(lobby.soloPending.A&&lobby.soloPending.B){
    stopTimer(lobby);
    revealSoloPhase(lobby);
    return true;
  }
  return false;
}

function revealSoloPhase(lobby){
  const isBan=lobby.soloPhase===0;
  for(const side of["A","B"]){
    const p=lobby.soloPending[side];if(!p)continue;
    if(isBan){
      lobby.bans[side].push(p.champ);
    }else{
      const team=side==="A"?lobby.teamA:lobby.teamB;
      const idx=team.indexOf(p.playerId);
      if(idx>=0)lobby.picks[side][idx]=p.champ;
      lobby.soloPickedPlayers.push(p.playerId);
    }
  }
  // Announce reveal
  const pA=lobby.soloPending.A,pB=lobby.soloPending.B;
  if(isBan){
    lobby.draftChannel.send(`🚫 **Bans revealed!**\n🔵 T${lobby.teamNumA}: ${pA?champDisplay(pA.champ):"—"}\n🔴 T${lobby.teamNumB}: ${pB?champDisplay(pB.champ):"—"}`).catch(()=>{});
  }else{
    lobby.draftChannel.send(`🎯 **Picks revealed!**\n🔵 <@${pA?.playerId}>: ${pA?champDisplay(pA.champ):"—"}\n🔴 <@${pB?.playerId}>: ${pB?champDisplay(pB.champ):"—"}`).catch(()=>{});
  }
  lobby.soloPending={A:null,B:null};
  // Advance to next phase
  lobby.soloPhase++;
  if(lobby.soloPhase>=SOLO_PHASES.length){
    finishDraft(lobby).catch(e=>log("ERROR","finishDraft:",e));
  }else{
    startSoloPhase(lobby).catch(e=>log("ERROR","startSoloPhase:",e));
  }
}

// ─── FINISH DRAFT ────────────────────────────────────────────────────
async function finishDraft(lobby){
  stopTimer(lobby);const m=M(lobby.isPro);
  const gB=lobby.globalBans.length>0?lobby.globalBans.map(c=>champBanDisplay(c,true)).join(", "):"—";
  const rA=lobby.bans.A.length>0?lobby.bans.A.map(c=>champBanDisplay(c,false)).join(", "):"—";
  const rB=lobby.bans.B.length>0?lobby.bans.B.map(c=>champBanDisplay(c,false)).join(", "):"—";
  const finalEmbed=new EmbedBuilder().setTitle(`✅  ${lobby.isPro?"PRO":"SOLOQ"} LOBBY #${lobby.lobbyId} — Draft Complete!`).setColor(0x57F287)
    .setDescription(`**▬▬▬▬▬▬ FINAL RECAP ▬▬▬▬▬▬**\n\n🗺️ **Map: ${lobby.map}**\n\n🌍 **Global Bans:** ${gB}\n🚫 **Bans T${lobby.teamNumA}:** ${rA}\n🚫 **Bans T${lobby.teamNumB}:** ${rB}`)
    .addFields({name:`🔵 TEAM ${lobby.teamNumA}${m.tag}`,value:lobby.teamA.map((id,i)=>`<@${id}>\n${champDisplay(lobby.picks.A[i]??"?")}`).join("\n\n"),inline:true},{name:"\u200b",value:"\u200b",inline:true},{name:`🔴 TEAM ${lobby.teamNumB}${m.tag}`,value:lobby.teamB.map((id,i)=>`<@${id}>\n${champDisplay(lobby.picks.B[i]??"?")}`).join("\n\n"),inline:true})
    .addFields({name:"\u200b",value:"*3 votes needed to confirm the result.*"}).setFooter({text:"Vote below to confirm the winner."});
  const L=`${lobby.isPro?"P":"L"}${lobby.lobbyId}_`;
  const row1=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(L+"voteA").setLabel(`🔵  Team ${lobby.teamNumA}${m.tag} Won`).setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(L+"voteB").setLabel(`🔴  Team ${lobby.teamNumB}${m.tag} Won`).setStyle(ButtonStyle.Danger));
  const rows=[row1,cancelBtnRow(lobby)];
  if(lobby.boardMsg)await lobby.boardMsg.edit({embeds:[finalEmbed],components:rows}).catch(async()=>{lobby.boardMsg=await lobby.draftChannel.send({embeds:[finalEmbed],components:rows}).catch(()=>null);});
  else lobby.boardMsg=await lobby.draftChannel.send({embeds:[finalEmbed],components:rows}).catch(()=>null);
  lobby.phase="vote";
  await lobby.draftChannel.send({content:`🎮 **Draft complete!** ${[...lobby.teamA,...lobby.teamB].map(id=>`<@${id}>`).join(" ")} — Go play **${lobby.map}**!`,allowedMentions:{users:[...lobby.teamA,...lobby.teamB]}}).catch(()=>{});
  // Post recap in queue channel for bettors (normal only)
  if(!lobby.isPro){
    const recapEmbed=new EmbedBuilder().setTitle(`📋  Lobby #${lobby.lobbyId} — Draft Recap`).setColor(0x57F287)
      .setDescription(`🗺️ **Map: ${lobby.map}**\n\n🌍 **Global Bans:** ${gB}\n🚫 **Bans T${lobby.teamNumA}:** ${rA}\n🚫 **Bans T${lobby.teamNumB}:** ${rB}`)
      .addFields({name:`🔵 TEAM ${lobby.teamNumA}`,value:lobby.teamA.map((id,i)=>`<@${id}> — ${champDisplay(lobby.picks.A[i]??"?")}`).join("\n"),inline:true},{name:"\u200b",value:"\u200b",inline:true},{name:`🔴 TEAM ${lobby.teamNumB}`,value:lobby.teamB.map((id,i)=>`<@${id}> — ${champDisplay(lobby.picks.B[i]??"?")}`).join("\n"),inline:true})
      .setFooter({text:"Place your bets before they close!"});
    await lobby.channel.send({embeds:[recapEmbed]}).catch(()=>{});
    // Close bets after 4m30
    lobby.betTimeout=setTimeout(async()=>{if(lobby.betsClosed)return;lobby.betsClosed=true;
      if(lobby.betMsg){const LL=`L${lobby.lobbyId}_`;const cr=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(LL+"betA").setLabel("🔵 Bets closed").setStyle(ButtonStyle.Primary).setDisabled(true),new ButtonBuilder().setCustomId(LL+"betB").setLabel("🔴 Bets closed").setStyle(ButtonStyle.Danger).setDisabled(true));await lobby.betMsg.edit({components:[cr]}).catch(()=>{});}
      await lobby.channel.send(`🎰 **Lobby #${lobby.lobbyId}** — Bets are now closed!`).catch(()=>{});
    },270_000);
  }
}

// ─── LOBBY CREATION ──────────────────────────────────────────────────
async function startLobby(channel,lobbyId,isPro=false){
  const m=M(isPro),q=isPro?proQueue:queue,lm=m.lobbies;
  const lobby=createLobby(lobbyId,isPro);
  lobby.active=true;lobby.phase="waiting";lobby.channel=channel;
  lobby.expected=q.splice(0,6);
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
    await channel.send(`⌛ **${isPro?"Pro ":""}Lobby #${lobbyId}** expired. Missing: ${missing.map(id=>`<@${id}>`).join(", ")}${present.length>0?`\n${present.map(id=>`<@${id}>`).join(", ")} have been re-added to the queue.`:""}`).catch(()=>{});
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
  lobby.category=await guild.channels.create({name:`⚔️ ${lobby.isPro?"PRO":"SOLOQ"} LOBBY #${lobby.lobbyId}`,type:ChannelType.GuildCategory});
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
  lobby.phase="draft";lobby.map=MAPS[Math.floor(Math.random()*MAPS.length)];
  lobby.announceMsg=await lobby.channel.send({embeds:[new EmbedBuilder().setTitle(`⚔️  ${lobby.isPro?"Pro ":""}Lobby #${lobby.lobbyId} — Match Starting!`).setColor(m.resultColor).setDescription(`🗺️ **Map: ${lobby.map}**\n\n**🔵 Team ${lobby.teamNumA}${m.tag}** — Captain <@${lobby.captainA}>\n${A.map(id=>`<@${id}>`).join("  ·  ")}\n\n**🔴 Team ${lobby.teamNumB}${m.tag}** — Captain <@${lobby.captainB}>\n${B.map(id=>`<@${id}>`).join("  ·  ")}\n\n*Draft is live in <#${lobby.draftChannel.id}>!*`)]}).catch(()=>null);
  await lobby.chatA.send(`🔵 **Team ${lobby.teamNumA}${m.tag} — Private Chat**\nDiscuss your ban/pick strategy here.`).catch(()=>{});
  await lobby.chatB.send(`🔴 **Team ${lobby.teamNumB}${m.tag} — Private Chat**\nDiscuss your ban/pick strategy here.`).catch(()=>{});
  // Bet message (normal only)
  if(!lobby.isPro){const L=`L${lobby.lobbyId}_`;
    const betEmbed=new EmbedBuilder().setTitle(`🎰  Lobby #${lobby.lobbyId} — Bets are open!`).setColor(0xF1C40F)
      .setDescription(`🔵 **Team ${lobby.teamNumA}:** ${A.map(id=>`<@${id}>`).join(", ")}\n🔴 **Team ${lobby.teamNumB}:** ${B.map(id=>`<@${id}>`).join(", ")}\n\n*Place your bet! +1 ELO if right, -1 if wrong.\nBets close 4min30 after draft ends.*`);
    lobby.betMsg=await lobby.channel.send({embeds:[betEmbed],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(L+"betA").setLabel(`🔵 Bet Team ${lobby.teamNumA}`).setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(L+"betB").setLabel(`🔴 Bet Team ${lobby.teamNumB}`).setStyle(ButtonStyle.Danger))]}).catch(()=>null);
  }
  if(lobby.isPro){
    await startDraftStep(lobby);
  }else{
    // SoloQ: simultaneous draft — init picks as null arrays
    lobby.picks={A:[null,null,null],B:[null,null,null]};
    lobby.soloPhase=0;
    await startSoloPhase(lobby);
  }
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
  losers.forEach(id=>{ens(id);const r=calculateElo(st[id].elo,avgW,false);changes[id]=r.change;
    st[id].elo=Math.max(100,st[id].elo+r.change);st[id].mmr=Math.max(100,st[id].mmr+r.change);
    st[id].losses++;st[id].games++;st[id].currentStreak=0;
  });
  // Bets (normal only)
  const betW=lobby.bets[winner],betL=lobby.bets[winner==="A"?"B":"A"],betC={};
  if(!lobby.isPro){
    for(const id of betW){ensurePlayer(id);stats[id].elo=Math.min(9999,stats[id].elo+1);stats[id].mmr++;stats[id].betWins=(stats[id].betWins||0)+1;stats[id].betStreak=(stats[id].betStreak||0)+1;if(stats[id].betStreak>(stats[id].bestBetStreak||0))stats[id].bestBetStreak=stats[id].betStreak;stats[id].betScore=(stats[id].betScore||0)+1;betC[id]=+1;}
    for(const id of betL){ensurePlayer(id);stats[id].elo=Math.max(100,stats[id].elo-1);stats[id].mmr=Math.max(100,stats[id].mmr-1);stats[id].betLosses=(stats[id].betLosses||0)+1;stats[id].betStreak=0;stats[id].betScore=(stats[id].betScore||0)-1;betC[id]=-1;}
  }
  m.season.matchCount++;await m.save();await m.saveSeas();
  if(!lobby.isPro){await saveStatsNow();}// Save normal stats for bets too
  // History
  const hist=m.history;hist.push({timestamp:Date.now(),lobbyId:lobby.lobbyId,teamA:[...lobby.teamA],teamB:[...lobby.teamB],picksA:[...lobby.picks.A],picksB:[...lobby.picks.B],bansA:[...lobby.bans.A],bansB:[...lobby.bans.B],globalBans:[...lobby.globalBans],winner,changes:{...changes},map:lobby.map});
  await m.saveHist();
  // Result embed
  let betText="";
  if(!lobby.isPro&&(betW.length>0||betL.length>0)){betText="\n\n**🎰 Bets**\n";if(betW.length>0)betText+=betW.map(id=>`<@${id}> **+1** ✅`).join("\n")+"\n";if(betL.length>0)betText+=betL.map(id=>`<@${id}> **-1** ❌`).join("\n");}
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
  if(ch){await refreshQueue(ch,lobby.isPro,false).catch(()=>{});if(q.length>=6){const slot=getFreeLobbySlot(lm);if(slot)await startLobby(ch,slot,lobby.isPro).catch(e=>log("ERROR","auto-start:",e));}}
}

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
      if(!allSlotsActive(lm)&&!q.includes(userId)&&!findLobbyByPlayer(userId)&&!findLobbyByExpected(userId)&&!bannedPlayers.has(userId)&&q.length<6){
        m.ensure(userId);q.push(userId);await addRole(msg.guild,userId,inQueueRole);
      }
      if(isQCh)await refreshQueue(msg.channel,isPro);else if(qCh)await refreshQueue(qCh,isPro).catch(()=>{});else await refreshQueue(msg.channel,isPro);
      if(q.length>=6){const slot=getFreeLobbySlot(lm);const lCh=isQCh?msg.channel:(qCh||msg.channel);if(slot)startLobby(lCh,slot,isPro).catch(e=>log("ERROR","startLobby:",e));}
    }finally{if(isPro)_proQueueLock=false;else _queueLock=false;}
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
    if(proQueue.includes(u.id)){proQueue=proQueue.filter(id=>id!==u.id);await removeRole(msg.guild,u.id,inQueueRole);}
    await msg.channel.send(`🔨 <@${u.id}> banned from matchmaking.`);return;}
  if(content.startsWith("!elounban")){if(!ADMIN_IDS.includes(msg.author.id))return;const u=msg.mentions.users.first();if(!u)return msg.reply("Usage: `!elounban @player`");bannedPlayers.delete(u.id);await saveBanned();await msg.channel.send(`✅ <@${u.id}> unbanned.`);return;}

  // ── !captain ──
  if(content==="!captain"){const lobby=findLobbyByDraftChannel(msg.channel.id);if(!lobby||!lobby.active||lobby.phase!=="draft")return;const uid=msg.author.id;
    if(lobby.teamA.includes(uid)){lobby.captainA=uid;await msg.channel.send(`👑 <@${uid}> is now captain of **Team ${lobby.teamNumA}${lobby.isPro?" Pro":""}**!`);pushBoard(lobby);}
    else if(lobby.teamB.includes(uid)){lobby.captainB=uid;await msg.channel.send(`👑 <@${uid}> is now captain of **Team ${lobby.teamNumB}${lobby.isPro?" Pro":""}**!`);pushBoard(lobby);}
    return;}

  // ── !help ──
  if(content==="!help"){await msg.channel.send({embeds:[new EmbedBuilder().setTitle("📖  LobbyELO — Commands").setColor(0x5865F2).setDescription(
    "**Everyone:**\n`!queue` / `!queue pro` — Join queue\n`!stats` / `!stats pro` — Your stats\n`!stats @player` — Someone's stats\n`!history` / `!history pro` — Last 5 matches\n`!season` / `!season pro` — Season info\n`!MMR` / `!MMR @player` — Lifetime MMR\n`!relation @p1 @p2` — Head-to-head\n`!totalplayer` — All players\n`!captain` — Claim captain\n`!ladder` / `!ladderbet` — Leaderboards\n\n"+
    "**Admin:**\n`!setelo @player N` / `!setMMR @player N` / `!setMMR pro @player N`\n`!resetstats` / `!resetstats pro` — Reset all\n`!resetelostats @player` / `!resetelostats pro @player`\n`!oldstats` / `!oldstats pro` — Undo reset\n`!MMRreset` / `!MMRreset pro`\n`!clearqueue` / `!clearqueue pro`\n`!eloban @player` / `!elounban @player`\n`!resetlobby` / `!resetlobby N` / `!resetlobby pro`\n`!cancel N` / `!cancel N pro`"
  )]});return;}

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
  if(!interaction.isButton())return;
  const cid=interaction.customId;

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
      if(q.length>=6){if(isPro)_proQueueLock=false;else _queueLock=false;return interaction.reply({content:"Queue full.",ephemeral:true});}
      q.push(interaction.user.id);await addRole(interaction.guild,interaction.user.id,inQueueRole);
      await interaction.deferUpdate().catch(()=>{});
      await interaction.message.edit({embeds:[queueEmbed(isPro)],components:[queueBtns(isPro)]}).catch(()=>{});
      if(q.length>=6){const slot=getFreeLobbySlot(lm);if(slot){await interaction.message.edit({embeds:[queueEmbed(isPro)],components:[queueBtns(isPro,true)]}).catch(()=>{});startLobby(interaction.channel,slot,isPro).catch(e=>log("ERROR","startLobby:",e));}}
    }finally{if(isPro)_proQueueLock=false;else _queueLock=false;}
    return;
  }
  if(cid==="q_leave"||cid==="pq_leave"){
    const isPro=cid==="pq_leave";if(isPro?_proQueueLock:_queueLock)return interaction.reply({content:"⏳",ephemeral:true});
    if(isPro)_proQueueLock=true;else _queueLock=true;
    try{const q=isPro?proQueue:queue;const was=q.includes(interaction.user.id);
      if(isPro)proQueue=proQueue.filter(id=>id!==interaction.user.id);else queue=queue.filter(id=>id!==interaction.user.id);
      if(was)await removeRole(interaction.guild,interaction.user.id,inQueueRole);
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

  // ── Bet (normal only) ──
  if(!isPro&&(rest==="betA"||rest==="betB")){
    const uid=interaction.user.id;
    if([...lobby.teamA,...lobby.teamB].includes(uid))return interaction.reply({content:"❌ Can't bet on your own match.",ephemeral:true});
    if(lobby.betsClosed)return interaction.reply({content:"❌ Bets closed.",ephemeral:true});
    if(lobby.bets.A.includes(uid)||lobby.bets.B.includes(uid))return interaction.reply({content:"❌ Already bet.",ephemeral:true});
    const side=rest==="betA"?"A":"B";lobby.bets[side].push(uid);ensurePlayer(uid);
    await interaction.reply({content:`✅ You bet on **${teamLabel(lobby,side)}**.`,ephemeral:true});
    await lobby.channel.send(`🎰 <@${uid}> bet on **${teamLabel(lobby,side)}**!`).catch(()=>{});return;
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
    const cat=rest.replace("cat_","");
    if(lobby.isPro){
      // Pro flow — defer first to avoid timeout
      const s=stepOf(lobby);if(!s)return interaction.reply({content:"❌ Over.",ephemeral:true});
      if(interaction.user.id!==captainOf(lobby))return interaction.reply({content:"❌ Only captain.",ephemeral:true});
      await interaction.deferUpdate().catch(()=>{});
      if(cat==="back")lobby.activeCategory=null;
      else lobby.activeCategory=cat;
      await pushBoard(lobby);return;
    }else{
      // SoloQ flow — ephemeral champion selection
      const uid=interaction.user.id;
      const side=lobby.teamA.includes(uid)?"A":lobby.teamB.includes(uid)?"B":null;
      if(!side)return interaction.reply({content:"❌ Not in this match.",ephemeral:true});
      if(lobby.soloPending[side])return interaction.reply({content:"❌ Your team already acted this phase.",ephemeral:true});
      const isBan=lobby.soloPhase===0;
      if(isBan&&uid!==(side==="A"?lobby.captainA:lobby.captainB))return interaction.reply({content:"❌ Only captain can ban.",ephemeral:true});
      if(!isBan&&lobby.soloPickedPlayers.includes(uid))return interaction.reply({content:"❌ You already picked.",ephemeral:true});
      const L=`L${lobby.lobbyId}_`,prefix=isBan?L+"ban_":L+"pick_",style=isBan?ButtonStyle.Danger:ButtonStyle.Success;
      const fullKey=Object.keys(CHAMP_CATEGORIES).find(k=>k.includes(cat));
      const oppBans=side==="A"?lobby.bans.B:lobby.bans.A,myPicks=lobby.picks[side];
      let avail;
      if(isBan)avail=(CHAMP_CATEGORIES[fullKey]||[]).filter(c=>!lobby.bans.A.includes(c)&&!lobby.bans.B.includes(c));
      else avail=(CHAMP_CATEGORIES[fullKey]||[]).filter(c=>!oppBans.includes(c)&&!myPicks.includes(c));
      const rows=[];
      for(let i=0;i<avail.length&&rows.length<3;i+=5){const row=new ActionRowBuilder();avail.slice(i,i+5).forEach(c=>{const btn=new ButtonBuilder().setCustomId(prefix+c).setLabel(c).setStyle(style);const eid=champEmojiId(c);if(eid)btn.setEmoji(eid);row.addComponents(btn);});rows.push(row);}
      if(!rows.length)return interaction.reply({content:"❌ No champions available in this category.",ephemeral:true});
      await interaction.reply({content:isBan?"🚫 Choose a champion to **ban**:":"🎯 Choose your **champion**:",components:rows,ephemeral:true});return;
    }
  }

  // ── Ban ──
  if(lobby.active&&lobby.phase==="draft"&&rest.startsWith("ban_")){
    const ch=rest.replace("ban_","");
    if(lobby.isPro){
      // Pro flow
      const s=stepOf(lobby);if(!s)return interaction.reply({content:"❌ Over.",ephemeral:true});
      if(interaction.user.id!==captainOf(lobby))return interaction.reply({content:"❌ Only captain.",ephemeral:true});
      if(s.type!=="ban")return interaction.reply({content:"❌ Pick phase.",ephemeral:true});
      if(lobby.globalBans.includes(ch))return interaction.reply({content:"❌ Global banned.",ephemeral:true});
      if(lobby.bans[s.team].includes(ch))return interaction.reply({content:"❌ Already banned.",ephemeral:true});
      const es=lobby.draftStep;stopTimer(lobby);await interaction.deferUpdate().catch(()=>{});if(lobby.draftStep!==es)return;
      if(s.global){lobby.globalBans.push(ch);lobby.available=lobby.available.filter(c=>c!==ch);}
      else{lobby.bans[s.team].push(ch);const opp=s.team==="A"?"B":"A";if(lobby.bans[opp].includes(ch))lobby.available=lobby.available.filter(c=>c!==ch);}
      advanceDraft(lobby);return;
    }else{
      // SoloQ ban
      const uid=interaction.user.id;
      const side=lobby.teamA.includes(uid)?"A":"B";
      if(lobby.soloPending[side])return interaction.update({content:"❌ Already acted.",components:[]}).catch(()=>{});
      lobby.soloPending[side]={playerId:uid,champ:ch};
      await interaction.update({content:`✅ You banned **${ch}**. Waiting for opponent...`,components:[]}).catch(()=>{});
      await pushSoloBoard(lobby);
      checkSoloReady(lobby);return;
    }
  }

  // ── Pick ──
  if(lobby.active&&lobby.phase==="draft"&&rest.startsWith("pick_")){
    const ch=rest.replace("pick_","");
    if(lobby.isPro){
      // Pro flow
      const s=stepOf(lobby);if(!s)return interaction.reply({content:"❌ Over.",ephemeral:true});
      if(interaction.user.id!==captainOf(lobby))return interaction.reply({content:"❌ Only captain.",ephemeral:true});
      if(s.type!=="pick")return interaction.reply({content:"❌ Ban phase.",ephemeral:true});
      const oppBans=s.team==="A"?lobby.bans.B:lobby.bans.A,myPicks=lobby.picks[s.team];
      if(oppBans.includes(ch)&&!lobby.bans[s.team].includes(ch))return interaction.reply({content:"❌ Banned.",ephemeral:true});
      if(!lobby.available.includes(ch))return interaction.reply({content:"❌ Unavailable.",ephemeral:true});
      if(myPicks.includes(ch))return interaction.reply({content:"❌ Already picked.",ephemeral:true});
      const es=lobby.draftStep;stopTimer(lobby);await interaction.deferUpdate().catch(()=>{});if(lobby.draftStep!==es)return;
      lobby.picks[s.team].push(ch);advanceDraft(lobby);return;
    }else{
      // SoloQ pick
      const uid=interaction.user.id;
      const side=lobby.teamA.includes(uid)?"A":"B";
      if(lobby.soloPending[side])return interaction.update({content:"❌ Your team already acted this tour.",components:[]}).catch(()=>{});
      if(lobby.soloPickedPlayers.includes(uid))return interaction.update({content:"❌ You already picked.",components:[]}).catch(()=>{});
      const oppBans=side==="A"?lobby.bans.B:lobby.bans.A;
      if(oppBans.includes(ch))return interaction.update({content:"❌ Banned by opponent.",components:[]}).catch(()=>{});
      if(lobby.picks[side].includes(ch))return interaction.update({content:"❌ Teammate already picked this.",components:[]}).catch(()=>{});
      lobby.soloPending[side]={playerId:uid,champ:ch};
      await interaction.update({content:`✅ You picked **${ch}**! Waiting for opponent...`,components:[]}).catch(()=>{});
      await pushSoloBoard(lobby);
      checkSoloReady(lobby);return;
    }
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
  for(const[,guild]of client.guilds.cache){
    await ensureRoles(guild).catch(()=>{});
    const lc=guild.channels.cache.find(c=>c.name==="top-20-ladder"&&c.isTextBased());if(lc){ladderChannel=lc;await updateLadder();}
    const blc=guild.channels.cache.find(c=>c.name==="top-20-ladder-bet"&&c.isTextBased());if(blc){betLadderChannel=blc;await updateBetLadder();}
    const plc=guild.channels.cache.find(c=>c.name==="top-20-ladder-pro"&&c.isTextBased());if(plc){proLadderChannel=plc;await updateProLadder();}
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
});

// ─── HTTP HEALTH CHECK (Render requires a port) ─────────────────────
const http = require("http");
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
  res.writeHead(200, {"Content-Type": "text/plain"});
  res.end("LobbyELO Bot is running");
}).listen(PORT, () => log("INFO", `Health check server on port ${PORT}`));

// ─── LOGIN ───────────────────────────────────────────────────────────
log("INFO",`TOKEN present: ${!!process.env.TOKEN}`);
log("INFO",`TOKEN length: ${(process.env.TOKEN||"").length}`);
log("INFO","Attempting Discord login...");
const TOKEN = (process.env.TOKEN || "").trim();

// Full debug to see where it hangs
client.on("debug", info => {
  if (info.includes("Heartbeat") || info.includes("heartbeat")) return; // skip spam
  log("DEBUG", info);
});
client.on("error", e => log("ERROR", "Client error:", e.message));
client.on("warn", w => log("WARN", "Client warn:", w));
client.on("shardError", e => log("ERROR", "Shard error:", e.message));
client.on("shardDisconnect", (e, id) => log("WARN", "Shard disconnect:", id));
client.on("shardReconnecting", id => log("INFO", "Shard reconnecting:", id));
client.on("invalidated", () => log("ERROR", "Session invalidated"));

client.login(TOKEN).then(()=>{
  log("INFO","Login OK");
}).catch(e=>{
  log("ERROR","Login FAILED:",e.message);
  log("ERROR","Error code:",e.code);
  process.exit(1);
});

setTimeout(() => {
  if (!client.isReady()) {
    log("WARN", "Bot still not ready after 30 seconds!");
    log("WARN", "Client status:", client.ws.status);
  }
}, 30000);
}, 30000);