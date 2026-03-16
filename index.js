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

// ─── STATS ───────────────────────────────────────────────────────────
let stats = fs.existsSync("./stats.json")
  ? JSON.parse(fs.readFileSync("./stats.json")) : {};

let _saveTimer = null;
let _saving = false;
function saveStats() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    if (_saving) return;
    _saving = true;
    try {
      await fs.promises.writeFile("./stats.json", JSON.stringify(stats, null, 2));
    } catch (err) {
      log("ERROR", "Failed to save stats:", err);
    }
    _saving = false;
  }, 500);
}

function ensurePlayer(id) {
  if (!stats[id]) {
    stats[id] = { elo: 1000, wins: 0, losses: 0, games: 0 };
    saveStats();
  }
  if (stats[id].games === undefined) {
    stats[id].games = stats[id].wins + stats[id].losses;
    saveStats();
  }
}

// ─── CONFIG ──────────────────────────────────────────────────────────
const CHAMP_CATEGORIES = {
  "⚔️ Melee":   ["Bakko","Croak","Freya","Jamila","Raigon","Rook","RuhKaan","Shifu","Thorn"],
  "🏹 Range":   ["Alysia","Ashka","Destiny","Ezmo","Iva","Jade","Jumong","ShenRao","Taya","Varesh"],
  "💚 Support": ["Blossom","Lucie","Oldur","Pearl","Pestilus","Poloma","Sirius","Ulric","Zander"]
};
const CHAMPS        = Object.values(CHAMP_CATEGORIES).flat();
const DRAFT_TIMER   = 75;
const LOBBY_TIMEOUT = 200;
const MAX_LOBBIES   = 2;
const CANCEL_VOTES  = 4;
const ADMIN_IDS     = ["341553327412346880", "279249193195929601"];

// Draft: T1 ban → T2 ban → T1 pick → T2 pick → T2 pick → T1 pick → T2 ban → T1 ban → T1 pick → T2 pick
const DRAFT_SEQ = [
  { type: "ban",  team: "A" }, { type: "ban",  team: "B" },
  { type: "pick", team: "A" }, { type: "pick", team: "B" },
  { type: "pick", team: "B" }, { type: "pick", team: "A" },
  { type: "ban",  team: "B" }, { type: "ban",  team: "A" },
  { type: "pick", team: "A" }, { type: "pick", team: "B" },
];

// ─── ROLES ───────────────────────────────────────────────────────────
let inQueueRole = null;
let inGameRole  = null;

async function ensureRoles(guild) {
  if (!guild) return;
  inQueueRole = guild.roles.cache.find(r => r.name === "IN QUEUE");
  if (!inQueueRole) {
    inQueueRole = await guild.roles.create({
      name: "IN QUEUE", color: 0x57F287, hoist: true, mentionable: false
    }).catch(err => { log("WARN", "Failed to create IN QUEUE role:", err); return null; });
    if (inQueueRole) log("INFO", "Created IN QUEUE role");
  }
  inGameRole = guild.roles.cache.find(r => r.name === "IN GAME");
  if (!inGameRole) {
    inGameRole = await guild.roles.create({
      name: "IN GAME", color: 0xED4245, hoist: true, mentionable: false
    }).catch(err => { log("WARN", "Failed to create IN GAME role:", err); return null; });
    if (inGameRole) log("INFO", "Created IN GAME role");
  }
}

async function addRole(guild, userId, role) {
  if (!role || !guild) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) await member.roles.add(role).catch(err => log("WARN", `addRole ${userId}:`, err));
}

async function removeRole(guild, userId, role) {
  if (!role || !guild) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && member.roles.cache.has(role.id))
    await member.roles.remove(role).catch(err => log("WARN", `removeRole ${userId}:`, err));
}

// ─── QUEUE STATE ─────────────────────────────────────────────────────
let queue = [];
const queueMessages = {};

// ─── LOBBY STATE ─────────────────────────────────────────────────────
const lobbies = new Map();

function createLobby(lobbyId) {
  const off = (lobbyId - 1) * 2;
  return {
    lobbyId,
    teamNumA: off + 1,
    teamNumB: off + 2,
    active: false, phase: null,
    expected: [], teamA: [], teamB: [],
    captainA: null, captainB: null,
    draftStep: 0, available: [...CHAMPS],
    bans:  { A: [], B: [] },
    picks: { A: [], B: [] },
    votes: { A: new Set(), B: new Set() },
    cancelVotes: new Set(),
    channel: null,
    draftChannel: null,
    lobbyVoice: null,
    category: null,
    voiceA: null, voiceB: null,
    boardMsg: null, announceMsg: null, lobbyPingMsg: null,
    activeCategory: null,
    timerInterval: null, timerTimeout: null, timerSeconds: DRAFT_TIMER,
    lobbyTimeout: null,
    _boardQueue: Promise.resolve()
  };
}

function getFreeLobbySlot() {
  if (!lobbies.has(1)) return 1;
  if (!lobbies.has(2)) return 2;
  return null;
}

function bothLobbiesActive() {
  return lobbies.has(1) && lobbies.has(2);
}

function findLobbyByDraftChannel(channelId) {
  for (const [, lobby] of lobbies) {
    if (lobby.draftChannel && lobby.draftChannel.id === channelId) return lobby;
  }
  return null;
}

function findLobbyByPlayer(userId) {
  for (const [, lobby] of lobbies) {
    if (lobby.active && (lobby.teamA.includes(userId) || lobby.teamB.includes(userId))) return lobby;
  }
  return null;
}

function findLobbyByExpected(userId) {
  for (const [, lobby] of lobbies) {
    if (lobby.active && lobby.expected.includes(userId)) return lobby;
  }
  return null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────
function stepOf(lobby) { return DRAFT_SEQ[lobby.draftStep] ?? null; }

function captainOf(lobby) {
  const s = stepOf(lobby);
  if (!s) return null;
  return s.team === "A" ? lobby.captainA : lobby.captainB;
}

function teamLabel(lobby, side) {
  return side === "A" ? `Team ${lobby.teamNumA}` : `Team ${lobby.teamNumB}`;
}

function stopTimer(lobby) {
  clearInterval(lobby.timerInterval);
  clearTimeout(lobby.timerTimeout);
  lobby.timerInterval = null;
  lobby.timerTimeout = null;
}

function timerBar(sec) {
  const total  = 15;
  const filled = Math.max(0, Math.round(sec / DRAFT_TIMER * total));
  const emoji  = sec <= 15 ? "🔴" : sec <= 35 ? "🟡" : "🟢";
  return `${emoji} ${"▰".repeat(filled)}${"▱".repeat(total - filled)} **${sec}s**`;
}

function progressBar(lobby) {
  const parts = DRAFT_SEQ.map((x, i) => {
    if (i < lobby.draftStep) return x.type === "ban" ? "\u001b[1;31m▰" : "\u001b[1;34m▰";
    if (i === lobby.draftStep) return "\u001b[1;37m▰";
    return "\u001b[0;30m▱";
  });
  return "```ansi\n" + parts.join("") + "\u001b[0m  " +
    (lobby.draftStep + 1) + " / " + DRAFT_SEQ.length + "\n```";
}

// ─── ELO CALCULATION ─────────────────────────────────────────────────
function calculateElo(playerElo, avgOppElo, won, gamesPlayed) {
  let K;
  if (gamesPlayed < 10)      K = 40;
  else if (playerElo < 1200) K = 30;
  else                        K = 20;

  const E = 1 / (1 + Math.pow(10, (avgOppElo - playerElo) / 400));
  const S = won ? 1 : 0;
  const change = Math.round(K * (S - E));
  return { newElo: Math.max(100, playerElo + change), change };
}

// ─── BALANCING ───────────────────────────────────────────────────────
function balance(players) {
  players.forEach(id => ensurePlayer(id));
  const combos = [];
  for (let i = 0; i < players.length; i++)
    for (let j = i + 1; j < players.length; j++)
      for (let k = j + 1; k < players.length; k++)
        combos.push([i, j, k]);

  let bestDiff = Infinity, bestA = [], bestB = [];
  for (const [i, j, k] of combos) {
    const A = [players[i], players[j], players[k]];
    const B = players.filter((_, idx) => ![i, j, k].includes(idx));
    const sumA = A.reduce((s, id) => s + (stats[id]?.elo ?? 1000), 0);
    const sumB = B.reduce((s, id) => s + (stats[id]?.elo ?? 1000), 0);
    const diff = Math.abs(sumA - sumB);
    if (diff < bestDiff) { bestDiff = diff; bestA = A; bestB = B; }
  }
  log("INFO", `Balance: A=[${bestA}] B=[${bestB}] diff=${bestDiff}`);
  return { A: bestA, B: bestB };
}

function pickCaptain(team) {
  return team.reduce((best, id) =>
    (stats[id]?.elo ?? 0) > (stats[best]?.elo ?? 0) ? id : best, team[0]);
}

// ─── QUEUE UI ────────────────────────────────────────────────────────
function nextLobbyLabel() {
  if (!lobbies.has(1) && !lobbies.has(2)) return "Lobby #1";
  if (lobbies.has(1) && !lobbies.has(2))  return "Lobby #2";
  if (!lobbies.has(1) && lobbies.has(2))  return "Lobby #1";
  return null;
}

function queueEmbed() {
  const next = nextLobbyLabel();
  const title = next
    ? `⚔️ Battlerite 3v3 — Queue (${next})`
    : "⚔️ Battlerite 3v3 — Queue";

  let desc;
  if (!next) {
    desc = "*⏳ Both lobbies are in progress. Please wait for one to finish.*";
  } else if (queue.length === 0) {
    desc = "*Queue is empty — click **Join** to enter!*";
  } else {
    desc = queue.map((id, i) =>
      `**${i + 1}.** <@${id}> — \`${stats[id]?.elo ?? 1000} ELO\``
    ).join("\n");
  }

  return new EmbedBuilder()
    .setTitle(title)
    .setColor(0x5865F2)
    .setDescription(desc)
    .setFooter({ text: `${queue.length} / 6 players` });
}

function queueBtns(disabled = false) {
  const blocked = bothLobbiesActive();
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("q_join").setLabel("✅  Join")
      .setStyle(ButtonStyle.Success).setDisabled(disabled || blocked),
    new ButtonBuilder()
      .setCustomId("q_leave").setLabel("❌  Leave")
      .setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

async function refreshQueue(channel, locked = false) {
  for (const chId of Object.keys(queueMessages)) {
    if (chId === channel.id) continue;
    const ch = client.channels.cache.get(chId);
    if (!ch) { delete queueMessages[chId]; continue; }
    queueMessages[chId]?.delete().catch(() => {});
    delete queueMessages[chId];
  }
  const ex = queueMessages[channel.id];
  if (ex) { await ex.delete().catch(() => {}); delete queueMessages[channel.id]; }
  queueMessages[channel.id] = await channel.send({
    embeds: [queueEmbed()], components: [queueBtns(locked)]
  });
}

// ─── DRAFT BOARD UI ──────────────────────────────────────────────────
function boardEmbed(lobby) {
  const s = stepOf(lobby);
  if (!s) return new EmbedBuilder().setTitle("Draft complete").setColor(0x57F287);

  const isBan = s.type === "ban";
  const sec   = lobby.timerSeconds;
  const cap   = captainOf(lobby);

  const action = isBan
    ? `🚫 **${teamLabel(lobby, s.team)} must BAN** — Captain <@${cap}>`
    : `🎯 **${teamLabel(lobby, s.team)} must PICK** — Captain <@${cap}>`;

  const teamALines = lobby.teamA.map((id, i) => {
    const crown = id === lobby.captainA ? "👑 " : "";
    const pick  = lobby.picks.A[i] ? `**[${lobby.picks.A[i]}]**` : "`[ ? ]`";
    return `${crown}<@${id}>\n${pick}`;
  }).join("\n\n");

  const teamBLines = lobby.teamB.map((id, i) => {
    const crown = id === lobby.captainB ? "👑 " : "";
    const pick  = lobby.picks.B[i] ? `**[${lobby.picks.B[i]}]**` : "`[ ? ]`";
    return `${crown}<@${id}>\n${pick}`;
  }).join("\n\n");

  const bansA = lobby.bans.A.length > 0 ? lobby.bans.A.join(", ") : "—";
  const bansB = lobby.bans.B.length > 0 ? lobby.bans.B.join(", ") : "—";

  return new EmbedBuilder()
    .setTitle(isBan
      ? `🚫  LOBBY #${lobby.lobbyId} — Ban Phase`
      : `🎯  LOBBY #${lobby.lobbyId} — Pick Phase`)
    .setColor(isBan ? 0xED4245 : 0x5865F2)
    .setDescription(`${action}\n\n${timerBar(sec)}\n${progressBar(lobby)}`)
    .addFields(
      { name: `🔵 TEAM ${lobby.teamNumA}`, value: teamALines || "\u200b", inline: true },
      { name: "⚔️", value: "\u200b", inline: true },
      { name: `🔴 TEAM ${lobby.teamNumB}`, value: teamBLines || "\u200b", inline: true }
    )
    .addFields({
      name: "\u200b",
      value: `🚫 **Bans T${lobby.teamNumA}:** ${bansA}  ┃  **Bans T${lobby.teamNumB}:** ${bansB}`
    })
    .setFooter({ text: "75s per step • auto random on timeout • Only captains can act • !captain to claim" });
}

// ─── DRAFT BUTTONS ───────────────────────────────────────────────────
function cancelBtnRow(lobby) {
  const L = `L${lobby.lobbyId}_`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(L + "cancel_match")
      .setLabel(`❌ Cancel Match (${lobby.cancelVotes.size}/${CANCEL_VOTES})`)
      .setStyle(ButtonStyle.Secondary)
  );
}

function categoryBtns(lobby) {
  const s = stepOf(lobby);
  const isBan = s?.type === "ban";
  const L = `L${lobby.lobbyId}_`;
  const style = isBan ? ButtonStyle.Danger : ButtonStyle.Success;

  const catRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(L + "cat_Melee").setLabel("⚔️ Melee").setStyle(style),
    new ButtonBuilder().setCustomId(L + "cat_Range").setLabel("🏹 Range").setStyle(style),
    new ButtonBuilder().setCustomId(L + "cat_Support").setLabel("💚 Support").setStyle(style)
  );
  return [catRow, cancelBtnRow(lobby)];
}

function champBtnsForCat(lobby, catKey) {
  const s = stepOf(lobby);
  if (!s) return [];

  const isBan  = s.type === "ban";
  const L      = `L${lobby.lobbyId}_`;
  const prefix = isBan ? L + "ban_" : L + "pick_";
  const style  = isBan ? ButtonStyle.Danger : ButtonStyle.Success;

  const fullKey  = Object.keys(CHAMP_CATEGORIES).find(k => k.includes(catKey));
  const myBans   = s.team === "A" ? lobby.bans.A : lobby.bans.B;
  const oppBans  = s.team === "A" ? lobby.bans.B : lobby.bans.A;
  const excluded = isBan ? myBans : oppBans;
  const available = (CHAMP_CATEGORIES[fullKey] || []).filter(c => !excluded.includes(c));

  const rows = [];
  for (let i = 0; i < available.length && rows.length < 3; i += 5) {
    const row = new ActionRowBuilder();
    available.slice(i, i + 5).forEach(c =>
      row.addComponents(
        new ButtonBuilder().setCustomId(prefix + c).setLabel(c).setStyle(style)
      )
    );
    rows.push(row);
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(L + "cat_back").setLabel("◀️ Back").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(L + "cancel_match")
      .setLabel(`❌ Cancel (${lobby.cancelVotes.size}/${CANCEL_VOTES})`)
      .setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}

function buildDraftButtons(lobby) {
  return lobby.activeCategory
    ? champBtnsForCat(lobby, lobby.activeCategory)
    : categoryBtns(lobby);
}

function pushBoard(lobby) {
  if (!lobby.boardMsg) return;
  lobby._boardQueue = (lobby._boardQueue || Promise.resolve()).then(async () => {
    if (!lobby.boardMsg) return;
    const btns = buildDraftButtons(lobby);
    await lobby.boardMsg.edit({ embeds: [boardEmbed(lobby)], components: btns })
      .catch(err => log("WARN", `Board edit failed L${lobby.lobbyId}:`, err));
  }).catch(err => log("WARN", `pushBoard error L${lobby.lobbyId}:`, err));
}

// ─── DRAFT TIMER ─────────────────────────────────────────────────────
async function startDraftStep(lobby) {
  stopTimer(lobby);
  lobby.timerSeconds = DRAFT_TIMER;

  if (!lobby.boardMsg) {
    lobby.boardMsg = await lobby.draftChannel
      .send({ embeds: [boardEmbed(lobby)], components: buildDraftButtons(lobby) })
      .catch(err => { log("ERROR", `Board send failed L${lobby.lobbyId}:`, err); return null; });
    if (!lobby.boardMsg) return;
  } else {
    await pushBoard(lobby);
  }

  lobby.timerInterval = setInterval(async () => {
    lobby.timerSeconds -= 3;
    if (lobby.timerSeconds <= 0) {
      clearInterval(lobby.timerInterval);
      lobby.timerInterval = null;
      return;
    }
    await pushBoard(lobby);
  }, 3000);

  lobby.timerTimeout = setTimeout(async () => {
    stopTimer(lobby);
    if (!lobby.active || lobby.phase !== "draft") return;
    const s = stepOf(lobby);
    if (!s) return;
    const cap = captainOf(lobby);
    const opponent = s.team === "A" ? "B" : "A";

    if (s.type === "ban") {
      const pool  = CHAMPS.filter(c => !lobby.bans[s.team].includes(c));
      const champ = pool[Math.floor(Math.random() * pool.length)];
      lobby.bans[s.team].push(champ);
      if (lobby.bans[opponent].includes(champ)) {
        lobby.available = lobby.available.filter(c => c !== champ);
        log("INFO", `Auto-ban L${lobby.lobbyId}: ${champ} ${teamLabel(lobby, s.team)} — double ban`);
      } else {
        log("INFO", `Auto-ban L${lobby.lobbyId}: ${champ} ${teamLabel(lobby, s.team)}`);
      }
      await lobby.draftChannel.send(
        `⏱️ Time's up! **${champ}** was automatically **banned** for ${teamLabel(lobby, s.team)} (<@${cap}>).`
      ).catch(() => {});
    } else {
      const oppBans = s.team === "A" ? lobby.bans.B : lobby.bans.A;
      const pool  = lobby.available.filter(c => !oppBans.includes(c));
      const champ = pool[Math.floor(Math.random() * pool.length)] ?? lobby.available[0];
      lobby.picks[s.team].push(champ);
      log("INFO", `Auto-pick L${lobby.lobbyId}: ${champ} ${teamLabel(lobby, s.team)}`);
      await lobby.draftChannel.send(
        `⏱️ Time's up! **${champ}** was automatically **picked** for ${teamLabel(lobby, s.team)} (<@${cap}>).`
      ).catch(() => {});
    }
    advanceDraft(lobby);
  }, DRAFT_TIMER * 1000);
}

function advanceDraft(lobby) {
  stopTimer(lobby);
  lobby.activeCategory = null;
  lobby.draftStep++;
  if (lobby.draftStep >= DRAFT_SEQ.length) {
    finishDraft(lobby).catch(err => log("ERROR", `finishDraft error L${lobby.lobbyId}:`, err));
    return;
  }
  startDraftStep(lobby).catch(err => log("ERROR", `startDraftStep error L${lobby.lobbyId}:`, err));
}

// ─── FINISH DRAFT ────────────────────────────────────────────────────
async function finishDraft(lobby) {
  stopTimer(lobby);

  const finalEmbed = new EmbedBuilder()
    .setTitle(`✅  LOBBY #${lobby.lobbyId} — Draft Complete!`)
    .setColor(0x57F287)
    .setDescription(
      `**▬▬▬▬▬▬ FINAL RECAP ▬▬▬▬▬▬**\n\n` +
      `🚫 **Bans T${lobby.teamNumA}:** ${lobby.bans.A.join(", ") || "—"}\n` +
      `🚫 **Bans T${lobby.teamNumB}:** ${lobby.bans.B.join(", ") || "—"}`
    )
    .addFields(
      {
        name: `🔵 TEAM ${lobby.teamNumA}`,
        value: lobby.teamA.map((id, i) =>
          `<@${id}>\n**[${lobby.picks.A[i] ?? "?"}]**`
        ).join("\n\n"),
        inline: true
      },
      { name: "\u200b", value: "\u200b", inline: true },
      {
        name: `🔴 TEAM ${lobby.teamNumB}`,
        value: lobby.teamB.map((id, i) =>
          `<@${id}>\n**[${lobby.picks.B[i] ?? "?"}]**`
        ).join("\n\n"),
        inline: true
      }
    )
    .addFields({ name: "\u200b", value: "*3 votes needed to confirm the result.*" })
    .setFooter({ text: "Vote below to confirm the winner." });

  const L = `L${lobby.lobbyId}_`;
  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(L + "voteA")
      .setLabel(`🔵  Team ${lobby.teamNumA} Won`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(L + "voteB")
      .setLabel(`🔴  Team ${lobby.teamNumB} Won`)
      .setStyle(ButtonStyle.Danger)
  );

  const rows = [voteRow, cancelBtnRow(lobby)];

  if (lobby.boardMsg) {
    await lobby.boardMsg.edit({ embeds: [finalEmbed], components: rows })
      .catch(async () => {
        lobby.boardMsg = await lobby.draftChannel
          .send({ embeds: [finalEmbed], components: rows }).catch(() => null);
      });
  } else {
    lobby.boardMsg = await lobby.draftChannel
      .send({ embeds: [finalEmbed], components: rows }).catch(() => null);
  }
  lobby.phase = "vote";
}

// ─── LOBBY CREATION ──────────────────────────────────────────────────
async function startLobby(channel, lobbyId) {
  const lobby    = createLobby(lobbyId);
  lobby.active   = true;
  lobby.phase    = "waiting";
  lobby.channel  = channel;
  lobby.expected = queue.splice(0, 6);
  lobbies.set(lobbyId, lobby);

  const guild = channel.guild;

  for (const id of lobby.expected) {
    await removeRole(guild, id, inQueueRole);
  }

  await refreshQueue(channel, false).catch(() => {});

  lobby.lobbyPingMsg = await channel.send({
    content:
      `🎮 **Lobby #${lobbyId} — Queue full!** ${lobby.expected.map(id => `<@${id}>`).join(" ")}\n` +
      `Join voice channel **🔊 LOBBY #${lobbyId} — JOIN** to start the match.`,
    allowedMentions: { users: lobby.expected }
  }).catch(err => { log("ERROR", "Lobby ping failed:", err); return null; });

  lobby.lobbyVoice = await guild.channels.create({
    name: `🔊 LOBBY #${lobbyId} — JOIN`,
    type: ChannelType.GuildVoice
  }).catch(err => { log("ERROR", "Lobby voice create failed:", err); return null; });

  log("INFO", `Lobby #${lobbyId} voice created — waiting for 6 players.`);

  lobby.lobbyTimeout = setTimeout(async () => {
    if (!lobby.active || lobby.phase !== "waiting") return;
    const inVoice = lobby.lobbyVoice
      ? [...lobby.lobbyVoice.members.values()].map(m => m.id) : [];
    const missing = lobby.expected.filter(id => !inVoice.includes(id));
    log("INFO", `Lobby #${lobbyId} expired. Missing: ${missing.join(", ")}`);
    await channel.send(
      `⌛ **Lobby #${lobbyId}** expired after **${LOBBY_TIMEOUT}s**.\n` +
      `Missing: ${missing.map(id => `<@${id}>`).join(", ")}\n` +
      `Use \`!queue\` to start a new queue.`
    ).catch(() => {});
    await cleanupLobby(lobby);
  }, LOBBY_TIMEOUT * 1000);
}

// ─── VOICE LISTENER ──────────────────────────────────────────────────
client.on("voiceStateUpdate", async (oldState, newState) => {
  for (const [lobbyId, lobby] of lobbies) {
    if (!lobby.active || lobby.phase !== "waiting" || !lobby.lobbyVoice) continue;
    const inVoice = [...lobby.lobbyVoice.members.values()].map(m => m.id);
    if (lobby.expected.every(id => inVoice.includes(id)) && inVoice.length >= 6) {
      startMatch(lobby).catch(err => {
        log("ERROR", `startMatch error L${lobbyId}:`, err);
        lobby.channel?.send(`❌ Failed to start Lobby #${lobbyId}. Use \`!cancel\` to reset.`);
      });
    }
  }
});

// ─── START MATCH ─────────────────────────────────────────────────────
async function startMatch(lobby) {
  if (lobby.phase !== "waiting") return;
  lobby.phase = "starting";
  clearTimeout(lobby.lobbyTimeout);
  lobby.lobbyTimeout = null;

  const guild = lobby.channel.guild;
  const { A, B } = balance(lobby.expected);
  lobby.teamA    = A;
  lobby.teamB    = B;
  lobby.captainA = pickCaptain(A);
  lobby.captainB = pickCaptain(B);
  log("INFO", `L${lobby.lobbyId}: A=[${A}] B=[${B}] capA=${lobby.captainA} capB=${lobby.captainB}`);

  for (const id of [...A, ...B]) {
    await addRole(guild, id, inGameRole);
  }

  lobby.category = await guild.channels.create({
    name: `⚔️ LOBBY #${lobby.lobbyId}`,
    type: ChannelType.GuildCategory
  });

  lobby.draftChannel = await guild.channels.create({
    name: `📝-lobby-draft-${lobby.lobbyId}`,
    type: ChannelType.GuildText,
    parent: lobby.category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] },
      ...lobby.expected.map(id => ({
        id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
      })),
      { id: client.user.id, allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageMessages
      ]}
    ]
  });

  lobby.voiceA = await guild.channels.create({
    name: `🔵 Team ${lobby.teamNumA}`,
    type: ChannelType.GuildVoice,
    parent: lobby.category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
      ...A.map(id => ({ id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
    ]
  });

  lobby.voiceB = await guild.channels.create({
    name: `🔴 Team ${lobby.teamNumB}`,
    type: ChannelType.GuildVoice,
    parent: lobby.category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] },
      ...B.map(id => ({ id, allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ViewChannel] }))
    ]
  });

  const lobbyVoiceId = lobby.lobbyVoice?.id ?? null;
  for (const id of A) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m && lobbyVoiceId && m.voice.channelId === lobbyVoiceId)
      await m.voice.setChannel(lobby.voiceA).catch(err => log("WARN", `Move ${id}→A:`, err));
  }
  for (const id of B) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m && lobbyVoiceId && m.voice.channelId === lobbyVoiceId)
      await m.voice.setChannel(lobby.voiceB).catch(err => log("WARN", `Move ${id}→B:`, err));
  }

  if (lobby.lobbyVoice) {
    await lobby.lobbyVoice.delete().catch(err => log("WARN", "Lobby voice delete:", err));
    lobby.lobbyVoice = null;
  }

  lobby.phase = "draft";

  lobby.announceMsg = await lobby.channel.send({ embeds: [
    new EmbedBuilder()
      .setTitle(`⚔️  Lobby #${lobby.lobbyId} — Match Starting!`)
      .setColor(0xFEE75C)
      .setDescription(
        `**🔵 Team ${lobby.teamNumA}** — Captain <@${lobby.captainA}>\n` +
        A.map(id => `<@${id}>`).join("  ·  ") +
        `\n\n**🔴 Team ${lobby.teamNumB}** — Captain <@${lobby.captainB}>\n` +
        B.map(id => `<@${id}>`).join("  ·  ") +
        `\n\n*Draft is live in <#${lobby.draftChannel.id}>!*`
      )
  ] }).catch(err => { log("WARN", "Announce failed:", err); return null; });

  await startDraftStep(lobby);
}

// ─── FINISH MATCH ────────────────────────────────────────────────────
async function finishMatch(lobby, winner) {
  log("INFO", `L${lobby.lobbyId}: ${teamLabel(lobby, winner)} wins.`);

  const winners   = winner === "A" ? lobby.teamA : lobby.teamB;
  const losers    = winner === "A" ? lobby.teamB : lobby.teamA;
  const winLabel  = teamLabel(lobby, winner);

  const avgWinElo  = winners.reduce((s, id) => s + (stats[id]?.elo ?? 1000), 0) / 3;
  const avgLoseElo = losers.reduce((s, id) => s + (stats[id]?.elo ?? 1000), 0) / 3;

  const changes = {};

  winners.forEach(id => {
    ensurePlayer(id);
    const r = calculateElo(stats[id].elo, avgLoseElo, true, stats[id].games);
    changes[id] = r.change;
    stats[id].elo = r.newElo;
    stats[id].wins++;
    stats[id].games++;
  });

  losers.forEach(id => {
    ensurePlayer(id);
    const r = calculateElo(stats[id].elo, avgWinElo, false, stats[id].games);
    changes[id] = r.change;
    stats[id].elo = r.newElo;
    stats[id].losses++;
    stats[id].games++;
  });

  saveStats();

  const resultEmbed = new EmbedBuilder()
    .setTitle(`🏆  ${winLabel} Wins! — Lobby #${lobby.lobbyId}`)
    .setColor(winner === "A" ? 0x3498DB : 0xE74C3C)
    .setDescription(
      "**🥇 Winners**\n" +
      winners.map(id => {
        const c = changes[id];
        return `<@${id}>  **${c >= 0 ? "+" : ""}${c}**  \`${stats[id].elo} ELO\``;
      }).join("\n") +
      "\n\n**💀 Losers**\n" +
      losers.map(id => {
        const c = changes[id];
        return `<@${id}>  **${c >= 0 ? "+" : ""}${c}**  \`${stats[id].elo} ELO\``;
      }).join("\n")
    )
    .setTimestamp();

  if (lobby.boardMsg) await lobby.boardMsg.delete().catch(() => {});
  if (lobby.lobbyPingMsg) await lobby.lobbyPingMsg.delete().catch(() => {});
  if (lobby.announceMsg) await lobby.announceMsg.delete().catch(() => {});

  await lobby.channel.send({ embeds: [resultEmbed] });

  // History channel
  await lobby.channel.guild.channels.fetch().catch(() => {});
  const histCh = lobby.channel.guild.channels.cache.find(
    c => c.name === "history-match-lobbyelo" && c.isTextBased()
  );
  if (histCh) {
    const histEmbed = new EmbedBuilder()
      .setTitle(`🏆  ${winLabel} Wins! — Lobby #${lobby.lobbyId}`)
      .setColor(winner === "A" ? 0x3498DB : 0xE74C3C)
      .setDescription(
        `**🚫 Bans T${lobby.teamNumA}:** ${lobby.bans.A.join(", ") || "—"}\n` +
        `**🚫 Bans T${lobby.teamNumB}:** ${lobby.bans.B.join(", ") || "—"}\n\n` +
        `**🔵 Team ${lobby.teamNumA}** — Captain <@${lobby.captainA}>\n` +
        lobby.teamA.map((id, i) => {
          const c = changes[id];
          return `<@${id}> [**${lobby.picks.A[i] ?? "?"}**]  **${c >= 0 ? "+" : ""}${c}**  \`${stats[id].elo} ELO\``;
        }).join("\n") +
        `\n\n**🔴 Team ${lobby.teamNumB}** — Captain <@${lobby.captainB}>\n` +
        lobby.teamB.map((id, i) => {
          const c = changes[id];
          return `<@${id}> [**${lobby.picks.B[i] ?? "?"}**]  **${c >= 0 ? "+" : ""}${c}**  \`${stats[id].elo} ELO\``;
        }).join("\n") +
        `\n\n**🥇 Winners:** ${winners.map(id => `<@${id}>`).join(", ")}\n` +
        `**💀 Losers:** ${losers.map(id => `<@${id}>`).join(", ")}`
      )
      .setTimestamp()
      .setFooter({ text: "LobbyELO Match History" });
    await histCh.send({ embeds: [histEmbed] }).catch(err => log("WARN", "History send failed:", err));
  } else {
    log("WARN", "Channel 'history-match-lobbyelo' not found — skipping.");
  }

  const guild = lobby.channel.guild;
  for (const id of [...winners, ...losers]) {
    await removeRole(guild, id, inGameRole);
  }

  await cleanupLobby(lobby);
}

// ─── CANCEL MATCH ────────────────────────────────────────────────────
async function cancelMatch(lobby) {
  log("INFO", `Lobby #${lobby.lobbyId} cancelled.`);

  const guild = lobby.channel.guild;
  const allPlayers = [...new Set([...lobby.teamA, ...lobby.teamB, ...lobby.expected])];

  for (const id of allPlayers) {
    await removeRole(guild, id, inGameRole);
    await removeRole(guild, id, inQueueRole);
  }

  if (lobby.boardMsg) await lobby.boardMsg.delete().catch(() => {});
  if (lobby.lobbyPingMsg) await lobby.lobbyPingMsg.delete().catch(() => {});
  if (lobby.announceMsg) await lobby.announceMsg.delete().catch(() => {});

  await lobby.channel.send(
    `⚠️ **Lobby #${lobby.lobbyId}** has been cancelled. No ELO changes.`
  ).catch(() => {});

  await cleanupLobby(lobby);
}

// ─── CLEANUP ─────────────────────────────────────────────────────────
async function cleanupLobby(lobby) {
  stopTimer(lobby);
  clearTimeout(lobby.lobbyTimeout);

  if (lobby.voiceA)       await lobby.voiceA.delete().catch(() => {});
  if (lobby.voiceB)       await lobby.voiceB.delete().catch(() => {});
  if (lobby.lobbyVoice)   await lobby.lobbyVoice.delete().catch(() => {});
  if (lobby.draftChannel) await lobby.draftChannel.delete().catch(() => {});
  if (lobby.category)     await lobby.category.delete().catch(() => {});

  const ch = lobby.channel;
  lobbies.delete(lobby.lobbyId);
  log("INFO", `Lobby #${lobby.lobbyId} cleanup done.`);

  if (ch) {
    await refreshQueue(ch, false).catch(() => {});
    if (queue.length >= 6) {
      const slot = getFreeLobbySlot();
      if (slot) {
        await startLobby(ch, slot).catch(err => log("ERROR", "Auto-startLobby error:", err));
      }
    }
  }
}

// ─── COMMANDS ────────────────────────────────────────────────────────
client.on("messageCreate", async msg => {
  if (msg.author.bot) return;

  if (queueMessages[msg.channel.id] && !findLobbyByDraftChannel(msg.channel.id)) {
    setTimeout(async () => {
      await refreshQueue(msg.channel, false).catch(() => {});
    }, 600);
  }

  if (msg.content === "!queue") {
    await ensureRoles(msg.guild);
    await refreshQueue(msg.channel, false);
    return;
  }

  if (msg.content === "!captain") {
    const lobby = findLobbyByDraftChannel(msg.channel.id);
    if (!lobby) return;
    if (!lobby.active || lobby.phase !== "draft")
      return msg.reply("❌ You can only claim captain during the draft phase.");

    const userId = msg.author.id;
    if (lobby.teamA.includes(userId)) {
      lobby.captainA = userId;
      await msg.channel.send(`👑 <@${userId}> is now the captain of **Team ${lobby.teamNumA}**!`);
      pushBoard(lobby);
    } else if (lobby.teamB.includes(userId)) {
      lobby.captainB = userId;
      await msg.channel.send(`👑 <@${userId}> is now the captain of **Team ${lobby.teamNumB}**!`);
      pushBoard(lobby);
    } else {
      await msg.reply("❌ You're not part of this match.");
    }
    return;
  }

  if (msg.content.startsWith("!stats")) {
    const mentioned = msg.mentions.users.first();
    const targetId  = mentioned ? mentioned.id : msg.author.id;
    ensurePlayer(targetId);
    const s = stats[targetId], total = s.wins + s.losses;
    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle(`📊  Stats — ${mentioned ? mentioned.username : msg.author.username}`)
        .setColor(0x57F287)
        .addFields(
          { name: "ELO",      value: `\`${s.elo}\``,      inline: true },
          { name: "Wins",     value: `\`${s.wins}\``,     inline: true },
          { name: "Losses",   value: `\`${s.losses}\``,   inline: true },
          { name: "Games",    value: `\`${s.games}\``,    inline: true },
          { name: "Win Rate", value: `\`${total === 0 ? 0 : Math.round(s.wins / total * 100)}%\``, inline: true }
        )
    ] });
    return;
  }

  if (msg.content === "!ladder") {
    const players = Object.entries(stats)
      .sort(([, a], [, b]) => b.elo - a.elo)
      .slice(0, 10);

    if (players.length === 0)
      return msg.channel.send("No players ranked yet. Play some matches first!");

    const medals = ["🥇", "🥈", "🥉"];
    const podium = (rank, id, s) => {
      const total = s.wins + s.losses;
      const wr = total === 0 ? 0 : Math.round(s.wins / total * 100);
      if (rank < 3)
        return `${medals[rank]} **#${rank + 1} — <@${id}>**\n┣ \`${s.elo} ELO\`  •  \`${s.wins}W / ${s.losses}L\`  •  \`${wr}% WR\`\n`;
      return `**#${rank + 1}** — <@${id}>  •  \`${s.elo} ELO\`  •  \`${s.wins}W / ${s.losses}L\`  •  \`${wr}% WR\``;
    };

    const desc =
      players.slice(0, 3).map(([id, s], i) => podium(i, id, s)).join("\n") +
      (players.length > 3
        ? "\n**━━━━━━━━━━━━━━━━━━━━━━━━**\n" +
          players.slice(3).map(([id, s], i) => podium(i + 3, id, s)).join("\n")
        : "");

    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle("🏆  LobbyELO — Leaderboard")
        .setColor(0xFEE75C)
        .setDescription(desc)
        .setFooter({ text: "Top 10 players by ELO" })
        .setTimestamp()
    ] });
    return;
  }

  if (msg.content.startsWith("!setelo")) {
    if (!ADMIN_IDS.includes(msg.author.id))
      return msg.reply("❌ You don't have permission to use this command.");

    const args      = msg.content.trim().split(/\s+/);
    const mentioned = msg.mentions.users.first();
    const newElo    = parseInt(args[args.length - 1]);

    if (!mentioned || isNaN(newElo) || newElo < 0)
      return msg.reply("❌ Usage: `!setelo @player <elo>` — e.g. `!setelo @Player 1200`");

    ensurePlayer(mentioned.id);
    const oldElo = stats[mentioned.id].elo;
    stats[mentioned.id].elo = newElo;
    saveStats();

    log("INFO", `!setelo: ${mentioned.id} ${oldElo} → ${newElo} by ${msg.author.id}`);
    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle("✏️  ELO Updated")
        .setColor(0xFEE75C)
        .setDescription(`<@${mentioned.id}>\n\`${oldElo} ELO\` → \`${newElo} ELO\``)
    ] });
    return;
  }

  if (msg.content === "!resetstats") {
    if (!ADMIN_IDS.includes(msg.author.id))
      return msg.reply("❌ You don't have permission to use this command.");

    const count = Object.keys(stats).length;
    Object.keys(stats).forEach(id => {
      stats[id] = { elo: 1000, wins: 0, losses: 0, games: 0 };
    });
    saveStats();
    log("INFO", `!resetstats by ${msg.author.id} — ${count} players reset`);

    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle("🔄  Stats Reset!")
        .setColor(0xED4245)
        .setDescription(`**${count} players** have been reset to \`1000 ELO\` / \`0W\` / \`0L\`.`)
        .setTimestamp()
    ] });
    return;
  }

  if (msg.content.startsWith("!resetlobby")) {
    if (!ADMIN_IDS.includes(msg.author.id))
      return msg.reply("❌ You don't have permission to use this command.");

    const args = msg.content.trim().split(/\s+/);
    const num  = parseInt(args[1]);

    // !resetlobby 1 or !resetlobby 2 → reset specific lobby
    if (num === 1 || num === 2) {
      const lobby = lobbies.get(num);
      if (!lobby)
        return msg.reply(`❌ Lobby #${num} is not active.`);

      log("INFO", `!resetlobby ${num} by ${msg.author.id}`);
      await cancelMatch(lobby);
      await msg.channel.send(`🔄 Lobby #${num} has been reset. Use \`!queue\` to start again.`);
      return;
    }

    // !resetlobby (no number) → reset everything
    log("INFO", `!resetlobby (all) by ${msg.author.id}`);
    const hadLobbies = lobbies.size > 0;

    for (const id of queue) {
      await removeRole(msg.guild, id, inQueueRole);
    }
    for (const [, lobby] of lobbies) {
      const all = [...new Set([...lobby.expected, ...lobby.teamA, ...lobby.teamB])];
      for (const id of all) {
        await removeRole(msg.guild, id, inGameRole);
        await removeRole(msg.guild, id, inQueueRole);
      }
      stopTimer(lobby);
      clearTimeout(lobby.lobbyTimeout);
      if (lobby.voiceA)       await lobby.voiceA.delete().catch(() => {});
      if (lobby.voiceB)       await lobby.voiceB.delete().catch(() => {});
      if (lobby.lobbyVoice)   await lobby.lobbyVoice.delete().catch(() => {});
      if (lobby.draftChannel) await lobby.draftChannel.delete().catch(() => {});
      if (lobby.category)     await lobby.category.delete().catch(() => {});
      if (lobby.boardMsg)     await lobby.boardMsg.delete().catch(() => {});
      if (lobby.lobbyPingMsg) await lobby.lobbyPingMsg.delete().catch(() => {});
      if (lobby.announceMsg)  await lobby.announceMsg.delete().catch(() => {});
    }
    lobbies.clear();
    queue = [];

    await refreshQueue(msg.channel, false).catch(() => {});
    await msg.channel.send(
      hadLobbies
        ? "🔄 All lobbies cancelled and queue reset. Use `!queue` to start again."
        : "🔄 Queue reset — all players removed. Use `!queue` to start again."
    );
    return;
  }

  if (msg.content.startsWith("!cancel")) {
    const hasPerms = msg.member?.permissions.has(PermissionsBitField.Flags.ManageChannels)
                  || ADMIN_IDS.includes(msg.author.id);
    if (!hasPerms) return msg.reply("❌ You don't have permission.");

    const args = msg.content.trim().split(/\s+/);
    const num  = parseInt(args[1]);

    // !cancel 1 or !cancel 2 → cancel specific lobby
    if (num === 1 || num === 2) {
      const lobby = lobbies.get(num);
      if (!lobby)
        return msg.reply(`❌ Lobby #${num} is not active.`);
      await msg.channel.send(`⚠️ Lobby #${num} cancelled by a moderator.`);
      await cancelMatch(lobby);
      return;
    }

    // !cancel (no number) in a draft channel → cancel that lobby
    const lobby = findLobbyByDraftChannel(msg.channel.id);
    if (lobby) {
      await msg.channel.send(`⚠️ Lobby #${lobby.lobbyId} cancelled by a moderator.`);
      await cancelMatch(lobby);
      return;
    }

    // !cancel (no number) in main channel → ask to specify
    if (lobbies.size === 0)
      return msg.reply("No active lobbies to cancel.");

    const activeIds = [...lobbies.keys()].join(", ");
    return msg.reply(`❌ Please specify which lobby to cancel: \`!cancel 1\` or \`!cancel 2\`\nActive lobbies: **#${activeIds}**`);
  }
});

// ─── BUTTON INTERACTIONS ─────────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;
  const cid = interaction.customId;

  // ─── QUEUE BUTTONS ─────────────────────────────────────────
  if (cid === "q_join") {
    if (bothLobbiesActive())
      return interaction.reply({
        content: "⏳ Both lobbies are in progress. Please wait for one to finish.",
        ephemeral: true
      });

    await ensureRoles(interaction.guild);
    ensurePlayer(interaction.user.id);

    if (findLobbyByPlayer(interaction.user.id) || findLobbyByExpected(interaction.user.id))
      return interaction.reply({ content: "❌ You're already in an active match.", ephemeral: true });
    if (queue.includes(interaction.user.id))
      return interaction.reply({ content: "You're already in the queue.", ephemeral: true });
    if (queue.length >= 6)
      return interaction.reply({ content: "The queue is full.", ephemeral: true });

    queue.push(interaction.user.id);
    await addRole(interaction.guild, interaction.user.id, inQueueRole);
    await interaction.update({ embeds: [queueEmbed()], components: [queueBtns(false)] });

    if (queue.length === 6) {
      const slot = getFreeLobbySlot();
      if (slot) {
        await interaction.message.edit({
          embeds: [queueEmbed()], components: [queueBtns(true)]
        }).catch(() => {});
        startLobby(interaction.channel, slot).catch(err => {
          log("ERROR", "startLobby error:", err);
          interaction.channel?.send("❌ Failed to create lobby. Use `!cancel` to reset.");
        });
      }
    }
    return;
  }

  if (cid === "q_leave") {
    const wasIn = queue.includes(interaction.user.id);
    queue = queue.filter(id => id !== interaction.user.id);
    if (wasIn) await removeRole(interaction.guild, interaction.user.id, inQueueRole);
    await interaction.update({ embeds: [queueEmbed()], components: [queueBtns(false)] });
    return;
  }

  // ─── LOBBY BUTTONS ─────────────────────────────────────────
  if (!cid.startsWith("L")) return;

  const lobbyId = parseInt(cid[1]);
  if (isNaN(lobbyId)) return;
  const lobby = lobbies.get(lobbyId);
  if (!lobby)
    return interaction.reply({ content: "❌ This lobby no longer exists.", ephemeral: true });

  const rest = cid.substring(3);

  // ── Cancel match vote ──
  if (rest === "cancel_match") {
    const allPlayers = [...lobby.teamA, ...lobby.teamB];
    if (!allPlayers.includes(interaction.user.id))
      return interaction.reply({ content: "❌ You are not part of this match.", ephemeral: true });

    if (lobby.cancelVotes.has(interaction.user.id))
      return interaction.reply({ content: "❌ You already voted to cancel.", ephemeral: true });

    lobby.cancelVotes.add(interaction.user.id);
    const count = lobby.cancelVotes.size;

    if (count >= CANCEL_VOTES) {
      await interaction.deferUpdate().catch(() => {});
      lobby.phase = "cancelled";
      await cancelMatch(lobby);
    } else {
      await interaction.reply({
        content: `✅ Cancel vote registered. (${count}/${CANCEL_VOTES})`,
        ephemeral: true
      });
      if (lobby.phase === "draft") {
        pushBoard(lobby);
      } else if (lobby.phase === "vote" && lobby.boardMsg) {
        const L = `L${lobby.lobbyId}_`;
        const voteRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(L + "voteA")
            .setLabel(`🔵  Team ${lobby.teamNumA} Won`)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(L + "voteB")
            .setLabel(`🔴  Team ${lobby.teamNumB} Won`)
            .setStyle(ButtonStyle.Danger)
        );
        await lobby.boardMsg.edit({ components: [voteRow, cancelBtnRow(lobby)] }).catch(() => {});
      }
    }
    return;
  }

  // ── Category selector ──
  if (lobby.active && lobby.phase === "draft" && rest.startsWith("cat_")) {
    const s = stepOf(lobby);
    if (!s) return interaction.reply({ content: "❌ Draft is over.", ephemeral: true });
    if (interaction.user.id !== captainOf(lobby))
      return interaction.reply({
        content: `❌ Only the ${teamLabel(lobby, s.team)} captain (<@${captainOf(lobby)}>) can act right now.`,
        ephemeral: true
      });

    const cat = rest.replace("cat_", "");

    if (cat === "back") {
      lobby.activeCategory = null;
      await interaction.update({
        embeds: [boardEmbed(lobby)],
        components: buildDraftButtons(lobby)
      });
      return;
    }

    lobby.activeCategory = cat;
    await interaction.update({
      embeds: [boardEmbed(lobby)],
      components: buildDraftButtons(lobby)
    });
    return;
  }

  // ── Ban ──
  if (lobby.active && lobby.phase === "draft" && rest.startsWith("ban_")) {
    const s = stepOf(lobby);
    if (!s) return interaction.reply({ content: "❌ Draft is over.", ephemeral: true });
    const capId = captainOf(lobby);
    if (interaction.user.id !== capId)
      return interaction.reply({
        content: `❌ Only the ${teamLabel(lobby, s.team)} captain (<@${capId}>) can ban right now.`,
        ephemeral: true
      });
    if (s.type !== "ban")
      return interaction.reply({ content: "❌ It's pick phase, not ban phase.", ephemeral: true });

    const champ = rest.replace("ban_", "");
    if (lobby.bans[s.team].includes(champ))
      return interaction.reply({ content: "❌ Your team already banned this champion.", ephemeral: true });

    await interaction.deferUpdate().catch(() => {});
    lobby.bans[s.team].push(champ);

    const opponent = s.team === "A" ? "B" : "A";
    if (lobby.bans[opponent].includes(champ)) {
      lobby.available = lobby.available.filter(c => c !== champ);
      log("INFO", `L${lobby.lobbyId}: ${teamLabel(lobby, s.team)} banned ${champ} — double ban`);
    } else {
      log("INFO", `L${lobby.lobbyId}: ${teamLabel(lobby, s.team)} banned ${champ}`);
    }
    advanceDraft(lobby);
    return;
  }

  // ── Pick ──
  if (lobby.active && lobby.phase === "draft" && rest.startsWith("pick_")) {
    const s = stepOf(lobby);
    if (!s) return interaction.reply({ content: "❌ Draft is over.", ephemeral: true });
    if (interaction.user.id !== captainOf(lobby))
      return interaction.reply({
        content: `❌ Only the ${teamLabel(lobby, s.team)} captain (<@${captainOf(lobby)}>) can pick right now.`,
        ephemeral: true
      });
    if (s.type !== "pick")
      return interaction.reply({ content: "❌ It's ban phase, not pick phase.", ephemeral: true });

    const champ   = rest.replace("pick_", "");
    const oppBans = s.team === "A" ? lobby.bans.B : lobby.bans.A;
    if (oppBans.includes(champ) && !lobby.bans[s.team].includes(champ))
      return interaction.reply({ content: "❌ This champion was banned for your team.", ephemeral: true });
    if (!lobby.available.includes(champ))
      return interaction.reply({ content: "❌ This champion was double-banned and is unavailable.", ephemeral: true });

    await interaction.deferUpdate().catch(() => {});
    lobby.picks[s.team].push(champ);
    log("INFO", `L${lobby.lobbyId}: ${teamLabel(lobby, s.team)} picked ${champ}`);
    advanceDraft(lobby);
    return;
  }

  // ── Vote ──
  if (lobby.active && lobby.phase === "vote" && (rest === "voteA" || rest === "voteB")) {
    if (![...lobby.teamA, ...lobby.teamB].includes(interaction.user.id))
      return interaction.reply({ content: "❌ You are not part of this match.", ephemeral: true });

    const side = rest === "voteA" ? "A" : "B";
    lobby.votes.A.delete(interaction.user.id);
    lobby.votes.B.delete(interaction.user.id);
    lobby.votes[side].add(interaction.user.id);

    const vA = lobby.votes.A.size, vB = lobby.votes.B.size;
    await interaction.reply({
      content: `✅ You voted **${teamLabel(lobby, side)}**. ` +
        `(🔵 T${lobby.teamNumA}: ${vA}/3  |  🔴 T${lobby.teamNumB}: ${vB}/3)`,
      ephemeral: true
    });

    if (vA >= 3 || vB >= 3) {
      lobby.phase = "finished";
      finishMatch(lobby, vA >= 3 ? "A" : "B")
        .catch(err => log("ERROR", `finishMatch error L${lobby.lobbyId}:`, err));
    }
    return;
  }
});

// ─── READY ───────────────────────────────────────────────────────────
client.once("ready", async () => {
  log("INFO", `Bot ready — ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    await ensureRoles(guild).catch(err =>
      log("WARN", `ensureRoles failed for ${guild.name}:`, err)
    );
  }
});

// ─── LOGIN ───────────────────────────────────────────────────────────
log("INFO", `Attempting login, TOKEN present: ${!!process.env.TOKEN}`);
client.login(process.env.TOKEN)
  .then(() => log("INFO", "Login successful"))
  .catch(err => {
    log("ERROR", "Login failed:", err.message);
    process.exit(1);
  });