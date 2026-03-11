process.on("unhandledRejection", (err) => log("ERROR", err));
process.on("uncaughtException",  (err) => log("ERROR", err));

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField
} = require("discord.js");

const fs = require("fs");

function log(level, ...args) {
  console.log(`[${new Date().toISOString()}] [${level}]`, ...args);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.once("ready", () => log("INFO", `Bot ready — ${client.user.tag}`));

// ─── STATS ───────────────────────────────────────────────────────────
let stats = fs.existsSync("./stats.json")
  ? JSON.parse(fs.readFileSync("./stats.json")) : {};
function saveStats() { fs.writeFileSync("./stats.json", JSON.stringify(stats, null, 2)); }
function ensurePlayer(id) {
  if (!stats[id]) { stats[id] = { elo: 1000, wins: 0, losses: 0 }; saveStats(); }
}

// ─── CONFIG ───────────────────────────────────────────────────────────
const CHAMPS = [
  "Alysia","Ashka","Bakko","Blossom","Croak","Destiny","Ezmo",
  "Freya","Iva","Jade","Jamila","Jumong","Lucie","Oldur","Pearl",
  "Pestilus","Poloma","Raigon","Rook","RuhKaan","ShenRao",
  "Shifu","Sirius","Taya","Thorn","Ulric","Varesh"
];
const DRAFT_TIMER   = 45;
const LOBBY_TIMEOUT = 200;
const OWNER_ID      = "341553327412346880";
const DRAFT_SEQ = [
  {type:"ban",team:"A"},{type:"ban",team:"B"},
  {type:"ban",team:"A"},{type:"ban",team:"B"},
  {type:"pick",team:"A"},{type:"pick",team:"B"},
  {type:"pick",team:"B"},{type:"pick",team:"A"},
  {type:"pick",team:"A"},{type:"pick",team:"B"},
];

// ─── QUEUE STATE ──────────────────────────────────────────────────────
let queue = [];
const queueMessages = {};

// ─── MATCH STATE ──────────────────────────────────────────────────────
function resetMatch() {
  return {
    active:false, phase:null,
    expected:[], teamA:[], teamB:[], captainA:null, captainB:null,
    draftStep:0, available:[...CHAMPS],
    bans:{A:[],B:[]}, picks:{A:[],B:[]},
    votes:{A:new Set(),B:new Set()},
    channel:null, lobby:null, category:null, voiceA:null, voiceB:null,
    boardMsg:null,
    timerInterval:null, timerTimeout:null, timerSeconds:DRAFT_TIMER,
    lobbyTimeout:null
  };
}
let match = resetMatch();
let _boardEditing = false;

// ─── HELPERS ──────────────────────────────────────────────────────────
const step    = () => DRAFT_SEQ[match.draftStep];
const captain = () => step().team === "A" ? match.captainA : match.captainB;

function stopTimer() {
  clearInterval(match.timerInterval); clearTimeout(match.timerTimeout);
  match.timerInterval = null; match.timerTimeout = null;
}

function timerBar(sec) {
  const filled = Math.max(0, Math.round(sec / DRAFT_TIMER * 12));
  const color  = sec <= 10 ? "🔴" : sec <= 20 ? "🟡" : "🟢";
  return `${color} ${"█".repeat(filled)}${"░".repeat(12-filled)} **${sec}s**`;
}

function balance(players) {
  players.forEach(id => ensurePlayer(id));
  const sorted = [...players].sort((a,b) => stats[b].elo - stats[a].elo);
  const A=[],B=[];
  sorted.forEach((id,i) => (i%2===0?A:B).push(id));
  return {A,B};
}
function pickCaptain(team) {
  return team.reduce((best,id) =>
    (stats[id]?.elo??0)>(stats[best]?.elo??0)?id:best, team[0]);
}

// ─── QUEUE UI ─────────────────────────────────────────────────────────
function queueEmbed() {
  return new EmbedBuilder()
    .setTitle("⚔️ Battlerite 3v3 — Queue")
    .setColor(0x5865F2)
    .setDescription(
      queue.length === 0
        ? "*Queue is empty — click **Join** to enter!*"
        : queue.map((id,i) => `**${i+1}.** <@${id}> — \`${stats[id]?.elo??1000} ELO\``).join("\n")
    )
    .setFooter({text:`${queue.length} / 6 players`});
}
function queueBtns(disabled=false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("q_join").setLabel("✅  Join").setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId("q_leave").setLabel("❌  Leave").setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}
async function refreshQueue(channel, locked=false) {
  const ex = queueMessages[channel.id];
  if (ex) {
    const ok = await ex.edit({embeds:[queueEmbed()],components:[queueBtns(locked)]}).catch(()=>null);
    if (ok) return;
    delete queueMessages[channel.id];
  }
  queueMessages[channel.id] = await channel.send({embeds:[queueEmbed()],components:[queueBtns(locked)]});
}

// ─── DRAFT BOARD ──────────────────────────────────────────────────────
// ONE message edited in-place. Shows: timer, whose turn, bans, picks, teams.
function boardEmbed() {
  const s    = step();
  const isBan = s.type === "ban";
  const sec  = match.timerSeconds;

  const progress = DRAFT_SEQ.map((x,i) => {
    if (i <  match.draftStep) return x.type==="ban" ? "🔴" : (x.team==="A"?"🔵":"🟠");
    if (i === match.draftStep) return "⚪";
    return "⬜";
  }).join("");

  const bansA  = Array.from({length:2},(_,i)=>match.bans.A[i]  ? `~~\`${match.bans.A[i]}\`~~`  : "`  ──  `").join("  ");
  const bansB  = Array.from({length:2},(_,i)=>match.bans.B[i]  ? `~~\`${match.bans.B[i]}\`~~`  : "`  ──  `").join("  ");
  const picksA = Array.from({length:3},(_,i)=>match.picks.A[i] ? `\`${match.picks.A[i]}\`` : "`  ──  `").join("  ");
  const picksB = Array.from({length:3},(_,i)=>match.picks.B[i] ? `\`${match.picks.B[i]}\`` : "`  ──  `").join("  ");

  const action = isBan
    ? `🚫 **Team ${s.team} must BAN** — Captain <@${captain()}>`
    : `🎯 **Team ${s.team} must PICK** — Captain <@${captain()}>`;

  return new EmbedBuilder()
    .setTitle(isBan ? "🚫  DRAFT — Ban Phase" : "🎯  DRAFT — Pick Phase")
    .setColor(isBan ? 0xED4245 : 0x5865F2)
    .setDescription(
      `${action}\n` +
      `${timerBar(sec)}\n` +
      `${progress}  *(step ${match.draftStep+1}/${DRAFT_SEQ.length})*\n\u200b\n` +
      `**🔵 Team A** — Captain <@${match.captainA}>\n` +
      `${match.teamA.map(id=>`<@${id}>`).join("  ·  ")}\n\u200b\n` +
      `**🔴 Team B** — Captain <@${match.captainB}>\n` +
      `${match.teamB.map(id=>`<@${id}>`).join("  ·  ")}\n\u200b\n` +
      `**▬▬▬▬▬▬▬ BANS ▬▬▬▬▬▬▬**\n` +
      `🔵 A :  ${bansA}\n` +
      `🔴 B :  ${bansB}\n\u200b\n` +
      `**▬▬▬▬▬▬▬ PICKS ▬▬▬▬▬▬▬**\n` +
      `🔵 A :  ${picksA}\n` +
      `🔴 B :  ${picksB}`
    )
    .setFooter({text:`${DRAFT_TIMER}s per step — auto random on timeout  •  Only captains can act`});
}

function champBtns() {
  const visible = match.available.slice(0,25);
  const prefix  = step().type==="ban" ? "ban_" : "pick_";
  const style   = step().type==="ban" ? ButtonStyle.Danger : ButtonStyle.Primary;
  const rows=[];
  for (let i=0; i<visible.length && rows.length<5; i+=5) {
    const row = new ActionRowBuilder();
    visible.slice(i,i+5).forEach(c =>
      row.addComponents(new ButtonBuilder().setCustomId(prefix+c).setLabel(c).setStyle(style))
    );
    rows.push(row);
  }
  return rows;
}

async function pushBoard() {
  if (!match.boardMsg || _boardEditing) return;
  _boardEditing = true;
  await match.boardMsg.edit({embeds:[boardEmbed()],components:champBtns()})
    .catch(err => log("WARN","Board edit failed:",err));
  _boardEditing = false;
}

// ─── DRAFT TIMER ──────────────────────────────────────────────────────
async function startDraftStep() {
  stopTimer();
  match.timerSeconds = DRAFT_TIMER;

  if (!match.boardMsg) {
    match.boardMsg = await match.channel
      .send({embeds:[boardEmbed()],components:champBtns()})
      .catch(err => { log("ERROR","Board send failed:",err); return null; });
    if (!match.boardMsg) return;
  } else {
    await pushBoard();
  }

  // Edit every 3 seconds (safe under Discord 5-per-5s rate limit)
  match.timerInterval = setInterval(async () => {
    match.timerSeconds -= 3;
    if (match.timerSeconds <= 0) {
      clearInterval(match.timerInterval); match.timerInterval = null; return;
    }
    await pushBoard();
  }, 3000);

  // Hard timeout — auto random ban/pick
  match.timerTimeout = setTimeout(async () => {
    stopTimer();
    if (!match.active || match.phase !== "draft") return;

    const champ = match.available[Math.floor(Math.random()*match.available.length)];
    const s = step(); const cap = captain();
    match.available = match.available.filter(c=>c!==champ);
    if (s.type==="ban") match.bans[s.team].push(champ);
    else                match.picks[s.team].push(champ);

    log("INFO",`Auto-${s.type}: ${champ} for Team ${s.team}`);
    await match.channel.send(
      `⏱️ Time's up! **${champ}** was randomly **${s.type==="ban"?"banned":"picked"}** for Team ${s.team} (<@${cap}>).`
    ).catch(()=>{});
    advanceDraft();
  }, DRAFT_TIMER*1000);
}

function advanceDraft() {
  stopTimer();
  match.draftStep++;
  if (match.draftStep >= DRAFT_SEQ.length) {
    finishDraft().catch(err => log("ERROR","finishDraft error:",err));
    return;
  }
  startDraftStep().catch(err => log("ERROR","startDraftStep error:",err));
}

// ─── FINISH DRAFT ─────────────────────────────────────────────────────
async function finishDraft() {
  stopTimer();

  const finalEmbed = new EmbedBuilder()
    .setTitle("✅  Draft Complete!")
    .setColor(0x57F287)
    .setDescription(
      `**▬▬▬▬▬▬ FINAL RECAP ▬▬▬▬▬▬**\n\n` +
      `🚫 **Bans A:** ${match.bans.A.join(", ")||"—"}\n` +
      `🚫 **Bans B:** ${match.bans.B.join(", ")||"—"}\n\n` +
      `**🔵 Team A** — Captain <@${match.captainA}>\n` +
      match.teamA.map((id,i) => `<@${id}>  →  **${match.picks.A[i]??"?"}**`).join("\n") +
      `\n\n**🔴 Team B** — Captain <@${match.captainB}>\n` +
      match.teamB.map((id,i) => `<@${id}>  →  **${match.picks.B[i]??"?"}**`).join("\n") +
      `\n\n*3 votes needed to confirm the result.*`
    )
    .setFooter({text:"Vote below to confirm the winner."});

  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("voteA").setLabel("🔵  Team A Won").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("voteB").setLabel("🔴  Team B Won").setStyle(ButtonStyle.Danger)
  );

  if (match.boardMsg) {
    await match.boardMsg.edit({embeds:[finalEmbed],components:[voteRow]})
      .catch(async () => {
        match.boardMsg = await match.channel.send({embeds:[finalEmbed],components:[voteRow]}).catch(()=>null);
      });
  } else {
    match.boardMsg = await match.channel.send({embeds:[finalEmbed],components:[voteRow]}).catch(()=>null);
  }
  match.phase = "vote";
}

// ─── COMMANDS ─────────────────────────────────────────────────────────
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  if (msg.content === "!queue") {
    await refreshQueue(msg.channel, match.active); return;
  }

  if (msg.content.startsWith("!stats")) {
    const mentioned = msg.mentions.users.first();
    const targetId  = mentioned ? mentioned.id : msg.author.id;
    ensurePlayer(targetId);
    const s=stats[targetId], total=s.wins+s.losses;
    await msg.channel.send({embeds:[
      new EmbedBuilder()
        .setTitle(`📊  Stats — ${mentioned?mentioned.username:msg.author.username}`)
        .setColor(0x57F287)
        .addFields(
          {name:"ELO",      value:`\`${s.elo}\``,    inline:true},
          {name:"Wins",     value:`\`${s.wins}\``,   inline:true},
          {name:"Losses",   value:`\`${s.losses}\``, inline:true},
          {name:"Win Rate", value:`\`${total===0?0:Math.round(s.wins/total*100)}%\``, inline:true}
        )
    ]});
    return;
  }

  if (msg.content === "!resetlobby") {
    log("INFO",`!resetlobby by ${msg.author.id} (${msg.author.username})`);
    if (msg.author.id !== OWNER_ID)
      return msg.reply("❌ You don't have permission to use this command.");
    const hadMatch = match.active;
    queue = [];
    if (hadMatch) await cleanup();
    await refreshQueue(msg.channel, false).catch(()=>{});
    await msg.channel.send(
      hadMatch
        ? "🔄 Queue reset and active match cancelled. Use `!queue` to start again."
        : "🔄 Queue reset — all players removed. Use `!queue` to start again."
    );
    return;
  }

  if (msg.content === "!cancel") {
    if (!msg.member?.permissions.has(PermissionsBitField.Flags.ManageChannels))
      return msg.reply("❌ You don't have permission.");
    if (!match.active) return msg.reply("No active match to cancel.");
    await msg.channel.send("⚠️ Match cancelled by a moderator.");
    await cleanup();
    await refreshQueue(msg.channel, false).catch(()=>{});
    return;
  }
});

// ─── BUTTON INTERACTIONS ──────────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  // JOIN
  if (interaction.customId === "q_join") {
    if (match.active)
      return interaction.reply({content:"⏳ A match is already in progress — wait for it to finish.",ephemeral:true});
    ensurePlayer(interaction.user.id);
    if (queue.includes(interaction.user.id))
      return interaction.reply({content:"You're already in the queue.",ephemeral:true});
    if (queue.length >= 6)
      return interaction.reply({content:"The queue is full.",ephemeral:true});
    queue.push(interaction.user.id);
    await interaction.update({embeds:[queueEmbed()],components:[queueBtns(false)]});
    if (queue.length === 6) {
      await interaction.message.edit({embeds:[queueEmbed()],components:[queueBtns(true)]}).catch(()=>{});
      startLobby(interaction.channel).catch(err => {
        log("ERROR","startLobby error:",err);
        interaction.channel?.send("❌ Failed to create lobby. Use `!cancel` to reset.");
      });
    }
    return;
  }

  // LEAVE
  if (interaction.customId === "q_leave") {
    if (match.active)
      return interaction.reply({content:"❌ A match has started — you can no longer leave.",ephemeral:true});
    queue = queue.filter(id => id !== interaction.user.id);
    await interaction.update({embeds:[queueEmbed()],components:[queueBtns(false)]});
    return;
  }

  // BAN
  if (match.active && match.phase === "draft" && interaction.customId.startsWith("ban_")) {
    const s = step();
    if (interaction.user.id !== captain())
      return interaction.reply({content:`❌ Only the Team ${s.team} captain (<@${captain()}>) can ban right now.`,ephemeral:true});
    if (s.type !== "ban")
      return interaction.reply({content:"❌ It's pick phase, not ban phase.",ephemeral:true});
    const champ = interaction.customId.replace("ban_","");
    if (!match.available.includes(champ))
      return interaction.reply({content:"❌ This champion is no longer available.",ephemeral:true});
    await interaction.deferUpdate().catch(()=>{});
    match.available = match.available.filter(c=>c!==champ);
    match.bans[s.team].push(champ);
    log("INFO",`Team ${s.team} banned ${champ}`);
    advanceDraft();
    return;
  }

  // PICK
  if (match.active && match.phase === "draft" && interaction.customId.startsWith("pick_")) {
    const s = step();
    if (interaction.user.id !== captain())
      return interaction.reply({content:`❌ Only the Team ${s.team} captain (<@${captain()}>) can pick right now.`,ephemeral:true});
    if (s.type !== "pick")
      return interaction.reply({content:"❌ It's ban phase, not pick phase.",ephemeral:true});
    const champ = interaction.customId.replace("pick_","");
    if (!match.available.includes(champ))
      return interaction.reply({content:"❌ This champion is no longer available.",ephemeral:true});
    await interaction.deferUpdate().catch(()=>{});
    match.available = match.available.filter(c=>c!==champ);
    match.picks[s.team].push(champ);
    log("INFO",`Team ${s.team} picked ${champ}`);
    advanceDraft();
    return;
  }

  // VOTE
  if (match.active && match.phase === "vote" &&
      (interaction.customId === "voteA" || interaction.customId === "voteB")) {
    if (![...match.teamA,...match.teamB].includes(interaction.user.id))
      return interaction.reply({content:"❌ You are not part of this match.",ephemeral:true});
    const side = interaction.customId === "voteA" ? "A" : "B";
    match.votes.A.delete(interaction.user.id);
    match.votes.B.delete(interaction.user.id);
    match.votes[side].add(interaction.user.id);
    const vA=match.votes.A.size, vB=match.votes.B.size;
    await interaction.reply({content:`✅ You voted **Team ${side}**. (🔵 A: ${vA}/3  |  🔴 B: ${vB}/3)`,ephemeral:true});
    if (vA>=3||vB>=3) {
      match.phase="finished";
      finishMatch(vA>=3?"A":"B").catch(err=>log("ERROR","finishMatch error:",err));
    }
    return;
  }
});

// ─── LOBBY ────────────────────────────────────────────────────────────
async function startLobby(channel) {
  match          = resetMatch();
  match.active   = true;
  match.phase    = "waiting";
  match.channel  = channel;
  match.expected = [...queue];
  queue          = [];

  await channel.send({
    content:
      `🎮 **Queue full!** ${match.expected.map(id=>`<@${id}>`).join(" ")}\n` +
      `Join voice channel **🔊 3v3 LOBBY JOIN** to start the match.`,
    allowedMentions:{users:match.expected}
  }).catch(err=>log("ERROR","Lobby ping failed:",err));

  match.lobby = await channel.guild.channels.create({name:"🔊 3v3 LOBBY JOIN",type:ChannelType.GuildVoice});
  log("INFO","Lobby voice created — waiting for all 6 players.");

  match.lobbyTimeout = setTimeout(async () => {
    if (!match.active || match.phase !== "waiting") return;
    const inLobby = match.lobby ? [...match.lobby.members.values()].map(m=>m.id) : [];
    const missing = match.expected.filter(id=>!inLobby.includes(id));
    log("INFO",`Lobby expired. Missing: ${missing.join(", ")}`);
    await channel.send(
      `⌛ Lobby expired after **${LOBBY_TIMEOUT}s**.\n` +
      `Missing: ${missing.map(id=>`<@${id}>`).join(", ")}\n` +
      `Use \`!queue\` to start a new queue.`
    ).catch(()=>{});
    await cleanup();
    await refreshQueue(channel,false).catch(()=>{});
  }, LOBBY_TIMEOUT*1000);
}

// ─── VOICE LISTENER ───────────────────────────────────────────────────
client.on("voiceStateUpdate", async (oldState, newState) => {
  if (!match.active || match.phase !== "waiting" || !match.lobby) return;
  const inLobby = [...match.lobby.members.values()].map(m=>m.id);
  if (match.expected.every(id=>inLobby.includes(id)) && inLobby.length>=6) {
    startMatch().catch(err => {
      log("ERROR","startMatch error:",err);
      match.channel?.send("❌ Failed to start match. Use `!cancel` to reset.");
    });
  }
});

// ─── START MATCH ──────────────────────────────────────────────────────
async function startMatch() {
  if (match.phase !== "waiting") return;
  match.phase = "starting";
  clearTimeout(match.lobbyTimeout); match.lobbyTimeout = null;

  const {A,B} = balance(match.expected);
  match.teamA=A; match.teamB=B;
  match.captainA=pickCaptain(A); match.captainB=pickCaptain(B);
  log("INFO",`A=[${A}] B=[${B}] captA=${match.captainA} captB=${match.captainB}`);

  match.category = await match.channel.guild.channels.create({name:"⚔️ MATCH",type:ChannelType.GuildCategory});

  match.voiceA = await match.channel.guild.channels.create({
    name:"🔵 Team A", type:ChannelType.GuildVoice, parent:match.category.id,
    permissionOverwrites:[
      {id:match.channel.guild.roles.everyone, deny:[PermissionsBitField.Flags.Connect,PermissionsBitField.Flags.ViewChannel]},
      ...A.map(id=>({id, allow:[PermissionsBitField.Flags.Connect,PermissionsBitField.Flags.ViewChannel]}))
    ]
  });
  match.voiceB = await match.channel.guild.channels.create({
    name:"🔴 Team B", type:ChannelType.GuildVoice, parent:match.category.id,
    permissionOverwrites:[
      {id:match.channel.guild.roles.everyone, deny:[PermissionsBitField.Flags.Connect,PermissionsBitField.Flags.ViewChannel]},
      ...B.map(id=>({id, allow:[PermissionsBitField.Flags.Connect,PermissionsBitField.Flags.ViewChannel]}))
    ]
  });

  // Move players FIRST — delete lobby AFTER (critical order)
  const lobbyId = match.lobby?.id ?? null;
  for (const id of A) {
    const m = await match.channel.guild.members.fetch(id).catch(()=>null);
    if (m && lobbyId && m.voice.channelId===lobbyId)
      await m.voice.setChannel(match.voiceA).catch(err=>log("WARN",`Move ${id}→A failed:`,err));
  }
  for (const id of B) {
    const m = await match.channel.guild.members.fetch(id).catch(()=>null);
    if (m && lobbyId && m.voice.channelId===lobbyId)
      await m.voice.setChannel(match.voiceB).catch(err=>log("WARN",`Move ${id}→B failed:`,err));
  }
  if (match.lobby) {
    await match.lobby.delete().catch(err=>log("WARN","Lobby delete failed:",err));
    match.lobby = null;
  }

  match.phase = "draft";

  await match.channel.send({embeds:[
    new EmbedBuilder()
      .setTitle("⚔️  Match Starting!")
      .setColor(0xFEE75C)
      .setDescription(
        `**🔵 Team A** — Captain <@${match.captainA}>\n` +
        A.map(id=>`<@${id}>`).join("  ·  ") +
        `\n\n**🔴 Team B** — Captain <@${match.captainB}>\n` +
        B.map(id=>`<@${id}>`).join("  ·  ") +
        `\n\n*The draft board below updates live — only captains can act.*`
      )
  ]}).catch(err=>log("WARN","Start announce failed:",err));

  await startDraftStep();
}

// ─── FINISH MATCH ─────────────────────────────────────────────────────
async function finishMatch(winner) {
  log("INFO",`Team ${winner} wins.`);
  const winners = winner==="A" ? match.teamA : match.teamB;
  const losers  = winner==="A" ? match.teamB : match.teamA;
  winners.forEach(id => { stats[id].elo+=25; stats[id].wins++; });
  losers.forEach(id  => { stats[id].elo=Math.max(0,stats[id].elo-25); stats[id].losses++; });
  saveStats();
  await match.channel.send({embeds:[
    new EmbedBuilder()
      .setTitle(`🏆  Team ${winner} Wins!`)
      .setColor(winner==="A"?0x3498DB:0xE74C3C)
      .setDescription(
        "**🥇 Winners  (+25 ELO)**\n" +
        winners.map(id=>`<@${id}>  →  \`${stats[id].elo} ELO\``).join("\n") +
        "\n\n**💀 Losers  (−25 ELO)**\n" +
        losers.map(id=>`<@${id}>  →  \`${stats[id].elo} ELO\``).join("\n")
      )
  ]});
  await cleanup();
}

// ─── CLEANUP ──────────────────────────────────────────────────────────
async function cleanup() {
  stopTimer();
  clearTimeout(match.lobbyTimeout);
  if (match.voiceA)   await match.voiceA.delete().catch(()=>{});
  if (match.voiceB)   await match.voiceB.delete().catch(()=>{});
  if (match.lobby)    await match.lobby.delete().catch(()=>{});
  if (match.category) await match.category.delete().catch(()=>{});
  if (match.channel && queueMessages[match.channel.id]) {
    queue = [];
    await queueMessages[match.channel.id]
      .edit({embeds:[queueEmbed()],components:[queueBtns(false)]})
      .catch(()=>{});
  }
  log("INFO","Cleanup done — ready for next match.");
  _boardEditing = false;
  match = resetMatch();
}

// ─── LOGIN ────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);
