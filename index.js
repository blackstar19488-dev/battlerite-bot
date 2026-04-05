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

// ─── DATA PATHS (Render Disk) ────────────────────────────────────────
const DATA_DIR      = "/data";
const STATS_PATH    = `${DATA_DIR}/stats.json`;
const BACKUP_PATH   = `${DATA_DIR}/stats.backup.json`;
const HISTORY_PATH  = `${DATA_DIR}/history.json`;
const SEASON_PATH   = `${DATA_DIR}/season.json`;

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { log("WARN", "Could not create /data, using ./"); }
}
const useDataDir = fs.existsSync(DATA_DIR);
const statsFile   = useDataDir ? STATS_PATH   : "./stats.json";
const backupFile  = useDataDir ? BACKUP_PATH  : "./stats.backup.json";
const historyFile = useDataDir ? HISTORY_PATH : "./history.json";
const seasonFile  = useDataDir ? SEASON_PATH  : "./season.json";

// ─── STATS ───────────────────────────────────────────────────────────
let stats = fs.existsSync(statsFile) ? JSON.parse(fs.readFileSync(statsFile)) : {};
let matchHistory = fs.existsSync(historyFile) ? JSON.parse(fs.readFileSync(historyFile)) : [];
let season = fs.existsSync(seasonFile) ? JSON.parse(fs.readFileSync(seasonFile)) : { startDate: new Date().toISOString(), matchCount: 0 };

let _saveTimer = null;
let _saving = false;
function saveStats() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => { await _doSave(); }, 500);
}
async function saveStatsNow() {
  if (_saveTimer) clearTimeout(_saveTimer);
  await _doSave();
}
async function _doSave() {
  if (_saving) return;
  _saving = true;
  try {
    await fs.promises.writeFile(statsFile, JSON.stringify(stats, null, 2));
  } catch (err) { log("ERROR", "Failed to save stats:", err); }
  _saving = false;
}
async function saveHistory() {
  try { await fs.promises.writeFile(historyFile, JSON.stringify(matchHistory, null, 2)); }
  catch (err) { log("ERROR", "Failed to save history:", err); }
}
async function saveSeason() {
  try { await fs.promises.writeFile(seasonFile, JSON.stringify(season, null, 2)); }
  catch (err) { log("ERROR", "Failed to save season:", err); }
}

function ensurePlayer(id) {
  if (!stats[id]) {
    stats[id] = {
      elo: 1000, mmr: 1000, wins: 0, losses: 0, games: 0,
      bestStreak: 0, currentStreak: 0, peakElo: 1000,
      betWins: 0, betLosses: 0, betStreak: 0, bestBetStreak: 0,
      clutchWins: 0
    };
    saveStats();
  }
  // Migrations
  if (stats[id].mmr === undefined) { stats[id].mmr = stats[id].elo; saveStats(); }
  if (stats[id].bestStreak === undefined) { stats[id].bestStreak = 0; saveStats(); }
  if (stats[id].currentStreak === undefined) { stats[id].currentStreak = 0; saveStats(); }
  if (stats[id].peakElo === undefined) { stats[id].peakElo = stats[id].elo; saveStats(); }
  if (stats[id].betWins === undefined) { stats[id].betWins = 0; saveStats(); }
  if (stats[id].betLosses === undefined) { stats[id].betLosses = 0; saveStats(); }
  if (stats[id].betStreak === undefined) { stats[id].betStreak = 0; saveStats(); }
  if (stats[id].bestBetStreak === undefined) { stats[id].bestBetStreak = 0; saveStats(); }
  if (stats[id].clutchWins === undefined) { stats[id].clutchWins = 0; saveStats(); }
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
const MAX_LOBBIES   = 3;
const CANCEL_VOTES  = 4;
const ADMIN_IDS     = ["341553327412346880", "279249193195929601"];

const MAPS = ["Blackstone Arena Day", "Dragon Garden Night", "Mount Araz Night", "Meriko Night"];

const DRAFT_SEQ = [
  { type: "ban",  team: "A", global: true  }, { type: "ban",  team: "B", global: true  },
  { type: "pick", team: "A" }, { type: "pick", team: "B" },
  { type: "pick", team: "B" }, { type: "pick", team: "A" },
  { type: "ban",  team: "B", global: false }, { type: "ban",  team: "A", global: false },
  { type: "pick", team: "A" }, { type: "pick", team: "B" },
];

// ─── CHAMPION EMOJIS ─────────────────────────────────────────────────
const CHAMP_EMOJIS = {
  "Bakko":    "<:br_bakko:1487982030846300262>",
  "Croak":    "<:br_croak:1487986958314639522>",
  "Freya":    "<:br_freya:1487989636738580550>",
  "Jamila":   "<:br_jamila:1487989574163501086>",
  "Raigon":   "<:br_raigon:1487989416344551444>",
  "Rook":     "<:br_rook:1487989394760663040>",
  "RuhKaan":  "<:br_ruhkaan:1487989373327904900>",
  "Shifu":    "<:br_shifu:1487989321502953482>",
  "Thorn":    "<:br_thorn:1487989266343661759>",
  "Alysia":   "<:br_alysia:1487986771634556998>",
  "Ashka":    "<:br_ashka:1487986842232950927>",
  "Destiny":  "<:br_destiny:1487987038518120528>",
  "Ezmo":     "<:br_ezmo:1487989656225186002>",
  "Iva":      "<:br_iva:1487989609173352479>",
  "Jade":     "<:br_jade:1487989589640609862>",
  "Jumong":   "<:br_jumong:1487989551652667582>",
  "ShenRao":  "<:br_shenrao:1487989343929892894>",
  "Taya":     "<:br_taya:1487989283611742348>",
  "Varesh":   "<:br_varesh:1487989222882283551>",
  "Blossom":  "<:br_blossom:1487986904589668382>",
  "Lucie":    "<:br_lucie:1487989530563706992>",
  "Oldur":    "<:br_oldur:1487989510682837093>",
  "Pearl":    "<:br_pearl:1487989489409458177>",
  "Pestilus": "<:br_pestilus:1487989472191709234>",
  "Poloma":   "<:br_poloma:1487989438784082001>",
  "Sirius":   "<:br_sirius:1487989302515335450>",
  "Ulric":    "<:br_ulric:1487989243664928919>",
  "Zander":   "<:br_zander:1487989197817249845>"
};

function champEmoji(name) { return CHAMP_EMOJIS[name] || ""; }
function champDisplay(name) { return CHAMP_EMOJIS[name] ? `${CHAMP_EMOJIS[name]} **${name}**` : `**${name}**`; }
function champEmojiId(name) {
  const m = (CHAMP_EMOJIS[name] || "").match(/<:\w+:(\d+)>/);
  return m ? m[1] : null;
}

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
let _queueLock = false;
const queueMessages = {};

// ─── LADDER LIVE MESSAGE ─────────────────────────────────────────────
let ladderMsg = null;
let ladderChannel = null;
let betLadderMsg = null;
let betLadderChannel = null;

// ─── LOBBY STATE ─────────────────────────────────────────────────────
const lobbies = new Map();

function createLobby(lobbyId) {
  const off = (lobbyId - 1) * 2;
  return {
    lobbyId,
    teamNumA: off + 1, teamNumB: off + 2,
    active: false, phase: null,
    expected: [], teamA: [], teamB: [],
    captainA: null, captainB: null,
    draftStep: 0, available: [...CHAMPS],
    globalBans: [],
    bans: { A: [], B: [] }, picks: { A: [], B: [] },
    votes: { A: new Set(), B: new Set() },
    cancelVotes: new Set(),
    channel: null, draftChannel: null, chatA: null, chatB: null,
    lobbyVoice: null, category: null, voiceA: null, voiceB: null,
    boardMsg: null, announceMsg: null, lobbyPingMsg: null,
    activeCategory: null,
    timerInterval: null, timerTimeout: null, timerSeconds: DRAFT_TIMER,
    lobbyTimeout: null,
    map: null,
    bets: { A: [], B: [] }, betMsg: null, betsClosed: false, betTimeout: null,
    _boardQueue: Promise.resolve()
  };
}

function getFreeLobbySlot() {
  if (!lobbies.has(1)) return 1;
  if (!lobbies.has(2)) return 2;
  if (!lobbies.has(3)) return 3;
  return null;
}
function allLobbiesActive() { return lobbies.has(1) && lobbies.has(2) && lobbies.has(3); }

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
  clearInterval(lobby.timerInterval); clearTimeout(lobby.timerTimeout);
  lobby.timerInterval = null; lobby.timerTimeout = null;
}

function timerBar(sec) {
  const total = 15;
  const filled = Math.max(0, Math.round(sec / DRAFT_TIMER * total));
  const emoji = sec <= 15 ? "🔴" : sec <= 35 ? "🟡" : "🟢";
  return `${emoji} ${"▰".repeat(filled)}${"▱".repeat(total - filled)} **${sec}s**`;
}

function progressBar(lobby) {
  const parts = DRAFT_SEQ.map((x, i) => {
    if (i < lobby.draftStep) return x.type === "ban" ? "🔴" : "🔵";
    if (i === lobby.draftStep) return "⚪";
    return "▱";
  });
  return parts.join("") + `  *${lobby.draftStep + 1} / ${DRAFT_SEQ.length}*`;
}

// ─── ELO CALCULATION ─────────────────────────────────────────────────
function calculateElo(playerElo, avgOppElo, won) {
  const K = playerElo < 1200 ? 30 : 20;
  const E = 1 / (1 + Math.pow(10, (avgOppElo - playerElo) / 400));
  const S = won ? 1 : 0;
  let change = Math.round(K * (S - E));
  if (change === 0) change = won ? 1 : -1;
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

// ─── LADDER EMBED (TOP 20) ──────────────────────────────────────────
function ladderEmbed() {
  const players = Object.entries(stats)
    .filter(([, s]) => s.games > 0)
    .sort(([, a], [, b]) => b.elo - a.elo)
    .slice(0, 20);

  if (players.length === 0) {
    return new EmbedBuilder()
      .setTitle("🏆  LobbyELO — Top 20 Ladder")
      .setColor(0xFEE75C)
      .setDescription("*No players ranked yet. Play some matches first!*")
      .setTimestamp();
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = players.map(([id, s], i) => {
    const total = s.wins + s.losses;
    const wr = total === 0 ? 0 : Math.round(s.wins / total * 100);
    if (i < 3) {
      return `${medals[i]} **#${i + 1} — <@${id}>**\n┣ \`${s.elo} ELO\`  •  \`${s.wins}W / ${s.losses}L\`  •  \`${wr}% WR\`  •  \`${s.games} games\`\n`;
    }
    return `**#${i + 1}** — <@${id}>  •  \`${s.elo} ELO\`  •  \`${s.wins}W / ${s.losses}L\`  •  \`${wr}% WR\``;
  });

  const desc =
    lines.slice(0, 3).join("\n") +
    (players.length > 3 ? "\n**━━━━━━━━━━━━━━━━━━━━━━━━**\n" + lines.slice(3).join("\n") : "");

  return new EmbedBuilder()
    .setTitle("🏆  LobbyELO — Top 20 Ladder")
    .setColor(0xFEE75C)
    .setDescription(desc)
    .setFooter({ text: `Season started ${new Date(season.startDate).toLocaleDateString()} • ${season.matchCount} matches played` })
    .setTimestamp();
}

async function updateLadder() {
  if (!ladderChannel) return;
  try {
    if (ladderMsg) {
      await ladderMsg.edit({ embeds: [ladderEmbed()] }).catch(async () => {
        ladderMsg = await ladderChannel.send({ embeds: [ladderEmbed()] }).catch(() => null);
      });
    } else {
      // Find existing bot message
      const msgs = await ladderChannel.messages.fetch({ limit: 20 });
      const existing = msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes("Ladder"));
      if (existing) {
        ladderMsg = existing;
        await ladderMsg.edit({ embeds: [ladderEmbed()] }).catch(() => {});
      } else {
        ladderMsg = await ladderChannel.send({ embeds: [ladderEmbed()] }).catch(() => null);
      }
    }
  } catch (err) { log("WARN", "updateLadder error:", err); }
}

// ─── BET LEADERBOARD ─────────────────────────────────────────────────
function betLadderEmbed() {
  const players = Object.entries(stats)
    .filter(([, s]) => (s.betWins || 0) + (s.betLosses || 0) > 0)
    .map(([id, s]) => ({ id, betWins: s.betWins || 0, betLosses: s.betLosses || 0, betScore: (s.betWins || 0) * 2 - (s.betLosses || 0) }))
    .sort((a, b) => b.betScore - a.betScore)
    .slice(0, 20);

  if (players.length === 0) {
    return new EmbedBuilder()
      .setTitle("🎰  LobbyELO — Top 20 Bettors")
      .setColor(0xF1C40F)
      .setDescription("*No bets placed yet.*")
      .setTimestamp();
  }

  const lines = players.map((p, i) => {
    const total = p.betWins + p.betLosses;
    const wr = total === 0 ? 0 : Math.round(p.betWins / total * 100);
    const title = i === 0 ? " 🔮 **The Visionary**" : "";
    if (i < 3) {
      const medals = ["🥇", "🥈", "🥉"];
      return `${medals[i]} **#${i + 1} — <@${p.id}>**${title}\n┣ \`${p.betWins}W / ${p.betLosses}L\`  •  \`${wr}% WR\`  •  \`Score: ${p.betScore}\`\n`;
    }
    return `**#${i + 1}** — <@${p.id}>  •  \`${p.betWins}W / ${p.betLosses}L\`  •  \`${wr}% WR\`  •  \`Score: ${p.betScore}\``;
  });

  const desc =
    lines.slice(0, 3).join("\n") +
    (players.length > 3 ? "\n**━━━━━━━━━━━━━━━━━━━━━━━━**\n" + lines.slice(3).join("\n") : "");

  return new EmbedBuilder()
    .setTitle("🎰  LobbyELO — Top 20 Bettors")
    .setColor(0xF1C40F)
    .setDescription(desc)
    .setFooter({ text: "Score = Wins × 2 - Losses • Top 1 = The Visionary 🔮" })
    .setTimestamp();
}

async function updateBetLadder() {
  if (!betLadderChannel) return;
  try {
    if (betLadderMsg) {
      await betLadderMsg.edit({ embeds: [betLadderEmbed()] }).catch(async () => {
        betLadderMsg = await betLadderChannel.send({ embeds: [betLadderEmbed()] }).catch(() => null);
      });
    } else {
      const msgs = await betLadderChannel.messages.fetch({ limit: 20 });
      const existing = msgs.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes("Bettors"));
      if (existing) {
        betLadderMsg = existing;
        await betLadderMsg.edit({ embeds: [betLadderEmbed()] }).catch(() => {});
      } else {
        betLadderMsg = await betLadderChannel.send({ embeds: [betLadderEmbed()] }).catch(() => null);
      }
    }
  } catch (err) { log("WARN", "updateBetLadder error:", err); }
}

// ─── QUEUE UI ────────────────────────────────────────────────────────
function nextLobbyLabel() {
  const slot = getFreeLobbySlot();
  return slot ? `Lobby #${slot}` : null;
}

function queueEmbed() {
  const next = nextLobbyLabel();
  const title = next ? `⚔️ Battlerite 3v3 — Queue (${next})` : "⚔️ Battlerite 3v3 — Queue";
  let desc;
  if (!next) desc = "*⏳ All lobbies are in progress. Please wait for one to finish.*";
  else if (queue.length === 0) desc = "*Queue is empty — click **Join** to enter!*";
  else desc = queue.map((id, i) => `**${i + 1}.** <@${id}> — \`${stats[id]?.elo ?? 1000} ELO\``).join("\n");
  return new EmbedBuilder().setTitle(title).setColor(0x5865F2).setDescription(desc)
    .setFooter({ text: `${queue.length} / 6 players` });
}

function queueBtns(disabled = false) {
  const blocked = allLobbiesActive();
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("q_join").setLabel("✅  Join").setStyle(ButtonStyle.Success).setDisabled(disabled || blocked),
    new ButtonBuilder().setCustomId("q_leave").setLabel("❌  Leave").setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

async function refreshQueue(channel, locked = false) {
  for (const chId of Object.keys(queueMessages)) {
    if (chId === channel.id) continue;
    const ch = client.channels.cache.get(chId);
    if (!ch) { delete queueMessages[chId]; continue; }
    queueMessages[chId]?.delete().catch(() => {}); delete queueMessages[chId];
  }
  const ex = queueMessages[channel.id];
  if (ex) { await ex.delete().catch(() => {}); delete queueMessages[channel.id]; }
  try {
    const recent = await channel.messages.fetch({ limit: 20 });
    const oldEmbeds = recent.filter(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes("Queue"));
    for (const [, m] of oldEmbeds) await m.delete().catch(() => {});
  } catch (err) { log("WARN", "Failed to clean old queue embeds:", err); }
  queueMessages[channel.id] = await channel.send({ embeds: [queueEmbed()], components: [queueBtns(locked)] });
}

// ─── DRAFT BOARD UI ──────────────────────────────────────────────────
function champBanDisplay(name, isGlobal) {
  const emoji = CHAMP_EMOJIS[name] || "";
  const tag = isGlobal ? " *(global)*" : "";
  return `${emoji} ~~${name}~~${tag}`;
}

function boardEmbed(lobby) {
  const s = stepOf(lobby);
  if (!s) return new EmbedBuilder().setTitle("Draft complete").setColor(0x57F287);
  const isBan = s.type === "ban";
  const isGlobalBan = isBan && s.global;
  const sec = lobby.timerSeconds;
  const cap = captainOf(lobby);

  let action;
  if (isGlobalBan) {
    action = `🌍 **${teamLabel(lobby, s.team)} must GLOBAL BAN** — Captain <@${cap}>\n*This ban removes the champion for BOTH teams.*`;
  } else if (isBan) {
    action = `🚫 **${teamLabel(lobby, s.team)} must BAN** — Captain <@${cap}>`;
  } else {
    action = `🎯 **${teamLabel(lobby, s.team)} must PICK** — Captain <@${cap}>`;
  }

  const teamALines = lobby.teamA.map((id, i) => {
    const crown = id === lobby.captainA ? "👑 " : "";
    const pick = lobby.picks.A[i] ? champDisplay(lobby.picks.A[i]) : "`[ ? ]`";
    return `${crown}<@${id}>\n${pick}`;
  }).join("\n\n");

  const teamBLines = lobby.teamB.map((id, i) => {
    const crown = id === lobby.captainB ? "👑 " : "";
    const pick = lobby.picks.B[i] ? champDisplay(lobby.picks.B[i]) : "`[ ? ]`";
    return `${crown}<@${id}>\n${pick}`;
  }).join("\n\n");

  // Global bans
  const globalBansStr = lobby.globalBans.length > 0
    ? lobby.globalBans.map(c => champBanDisplay(c, true)).join(", ")
    : "—";

  // Regular bans per team
  const regBansA = lobby.bans.A.length > 0 ? lobby.bans.A.map(c => champBanDisplay(c, false)).join(", ") : "—";
  const regBansB = lobby.bans.B.length > 0 ? lobby.bans.B.map(c => champBanDisplay(c, false)).join(", ") : "—";

  const embed = new EmbedBuilder()
    .setTitle(isGlobalBan
      ? `🌍  LOBBY #${lobby.lobbyId} — Global Ban Phase`
      : isBan
        ? `🚫  LOBBY #${lobby.lobbyId} — Ban Phase`
        : `🎯  LOBBY #${lobby.lobbyId} — Pick Phase`)
    .setColor(isGlobalBan ? 0xE67E22 : isBan ? 0xED4245 : 0x5865F2)
    .setDescription(
      `🗺️ **Map: ${lobby.map}**\n\n` +
      `${action}\n\n${timerBar(sec)}\n${progressBar(lobby)}`
    )
    .addFields(
      { name: `🔵 TEAM ${lobby.teamNumA}`, value: teamALines || "\u200b", inline: true },
      { name: "⚔️", value: "\u200b", inline: true },
      { name: `🔴 TEAM ${lobby.teamNumB}`, value: teamBLines || "\u200b", inline: true }
    )
    .addFields({
      name: "🌍 Global Bans",
      value: globalBansStr
    })
    .addFields({
      name: "\u200b",
      value: `🚫 **Bans T${lobby.teamNumA}:** ${regBansA}  ┃  **Bans T${lobby.teamNumB}:** ${regBansB}`
    })
    .setFooter({ text: "75s per step • auto random on timeout • Only captains can act • !captain to claim" });

  return embed;
}

// ─── DRAFT BUTTONS ───────────────────────────────────────────────────
function cancelBtnRow(lobby) {
  const L = `L${lobby.lobbyId}_`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(L + "cancel_match")
      .setLabel(`❌ Cancel Match (${lobby.cancelVotes.size}/${CANCEL_VOTES})`).setStyle(ButtonStyle.Secondary)
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
  const isBan = s.type === "ban";
  const isGlobalBan = isBan && s.global;
  const L = `L${lobby.lobbyId}_`;
  const prefix = isBan ? L + "ban_" : L + "pick_";
  const style = isBan ? ButtonStyle.Danger : ButtonStyle.Success;

  const fullKey = Object.keys(CHAMP_CATEGORIES).find(k => k.includes(catKey));
  const myBans = s.team === "A" ? lobby.bans.A : lobby.bans.B;
  const oppBans = s.team === "A" ? lobby.bans.B : lobby.bans.A;
  const myPicks = lobby.picks[s.team];

  let available;
  if (isBan) {
    // Ban phase: hide globalBans + own regular bans
    available = (CHAMP_CATEGORIES[fullKey] || []).filter(c =>
      !lobby.globalBans.includes(c) && !myBans.includes(c)
    );
  } else {
    // Pick phase: hide globalBans (via lobby.available) + opponent regular bans + own picks
    available = (CHAMP_CATEGORIES[fullKey] || []).filter(c =>
      !oppBans.includes(c) && !myPicks.includes(c) && lobby.available.includes(c)
    );
  }

  const rows = [];
  for (let i = 0; i < available.length && rows.length < 3; i += 5) {
    const row = new ActionRowBuilder();
    available.slice(i, i + 5).forEach(c => {
      const btn = new ButtonBuilder().setCustomId(prefix + c).setLabel(c).setStyle(style);
      const eid = champEmojiId(c);
      if (eid) btn.setEmoji(eid);
      row.addComponents(btn);
    });
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(L + "cat_back").setLabel("◀️ Back").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(L + "cancel_match")
      .setLabel(`❌ Cancel (${lobby.cancelVotes.size}/${CANCEL_VOTES})`).setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}

function buildDraftButtons(lobby) {
  return lobby.activeCategory ? champBtnsForCat(lobby, lobby.activeCategory) : categoryBtns(lobby);
}

function pushBoard(lobby) {
  if (!lobby.boardMsg) return;
  lobby._boardQueue = (lobby._boardQueue || Promise.resolve()).then(async () => {
    if (!lobby.boardMsg) return;
    await lobby.boardMsg.edit({ embeds: [boardEmbed(lobby)], components: buildDraftButtons(lobby) })
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
  } else { await pushBoard(lobby); }

  lobby.timerInterval = setInterval(async () => {
    lobby.timerSeconds -= 5;
    if (lobby.timerSeconds <= 0) { clearInterval(lobby.timerInterval); lobby.timerInterval = null; return; }
    await pushBoard(lobby);
  }, 5000);

  lobby.timerTimeout = setTimeout(async () => {
    stopTimer(lobby);
    if (!lobby.active || lobby.phase !== "draft") return;
    const expectedStep = lobby.draftStep;
    const s = stepOf(lobby); if (!s) return;
    const cap = captainOf(lobby);
    const opponent = s.team === "A" ? "B" : "A";

    if (s.type === "ban") {
      if (s.global) {
        // Global ban: remove from both teams
        const pool = CHAMPS.filter(c => !lobby.globalBans.includes(c));
        const champ = pool[Math.floor(Math.random() * pool.length)];
        lobby.globalBans.push(champ);
        lobby.available = lobby.available.filter(c => c !== champ);
        log("INFO", `Auto-global-ban L${lobby.lobbyId}: ${champ} ${teamLabel(lobby, s.team)}`);
        await lobby.draftChannel.send(`⏱️ Time's up! ${champDisplay(champ)} was automatically **GLOBAL BANNED** by ${teamLabel(lobby, s.team)} (<@${cap}>). Removed for both teams.`).catch(() => {});
      } else {
        // Regular ban: only for enemy team
        const pool = CHAMPS.filter(c => !lobby.bans[s.team].includes(c) && !lobby.globalBans.includes(c));
        const champ = pool[Math.floor(Math.random() * pool.length)];
        lobby.bans[s.team].push(champ);
        const opponent = s.team === "A" ? "B" : "A";
        if (lobby.bans[opponent].includes(champ)) {
          lobby.available = lobby.available.filter(c => c !== champ);
        }
        log("INFO", `Auto-ban L${lobby.lobbyId}: ${champ} ${teamLabel(lobby, s.team)}`);
        await lobby.draftChannel.send(`⏱️ Time's up! ${champDisplay(champ)} was automatically **banned** for ${teamLabel(lobby, s.team)} (<@${cap}>).`).catch(() => {});
      }
    } else {
      const oppBans = s.team === "A" ? lobby.bans.B : lobby.bans.A;
      const myPicks = lobby.picks[s.team];
      const pool = lobby.available.filter(c => !oppBans.includes(c) && !myPicks.includes(c));
      const champ = pool[Math.floor(Math.random() * pool.length)] ?? lobby.available[0];
      lobby.picks[s.team].push(champ);
      log("INFO", `Auto-pick L${lobby.lobbyId}: ${champ} ${teamLabel(lobby, s.team)}`);
      await lobby.draftChannel.send(`⏱️ Time's up! ${champDisplay(champ)} was automatically **picked** for ${teamLabel(lobby, s.team)} (<@${cap}>).`).catch(() => {});
    }
    // Only advance if step hasn't been advanced by a button click
    if (lobby.draftStep === expectedStep) advanceDraft(lobby);
  }, DRAFT_TIMER * 1000);
}

function advanceDraft(lobby) {
  stopTimer(lobby); lobby.activeCategory = null; lobby.draftStep++;
  if (lobby.draftStep >= DRAFT_SEQ.length) {
    finishDraft(lobby).catch(err => log("ERROR", `finishDraft error L${lobby.lobbyId}:`, err));
    return;
  }
  startDraftStep(lobby).catch(err => log("ERROR", `startDraftStep error L${lobby.lobbyId}:`, err));
}

// ─── FINISH DRAFT + MAP ──────────────────────────────────────────────
async function finishDraft(lobby) {
  stopTimer(lobby);

  // Global bans display
  const globalBansStr = lobby.globalBans.length > 0
    ? lobby.globalBans.map(c => champBanDisplay(c, true)).join(", ")
    : "—";
  const regBansA = lobby.bans.A.length > 0 ? lobby.bans.A.map(c => champBanDisplay(c, false)).join(", ") : "—";
  const regBansB = lobby.bans.B.length > 0 ? lobby.bans.B.map(c => champBanDisplay(c, false)).join(", ") : "—";

  const finalEmbed = new EmbedBuilder()
    .setTitle(`✅  LOBBY #${lobby.lobbyId} — Draft Complete!`)
    .setColor(0x57F287)
    .setDescription(
      `**▬▬▬▬▬▬ FINAL RECAP ▬▬▬▬▬▬**\n\n` +
      `🗺️ **Map: ${lobby.map}**\n\n` +
      `🌍 **Global Bans:** ${globalBansStr}\n` +
      `🚫 **Bans T${lobby.teamNumA}:** ${regBansA}\n` +
      `🚫 **Bans T${lobby.teamNumB}:** ${regBansB}`
    )
    .addFields(
      { name: `🔵 TEAM ${lobby.teamNumA}`, value: lobby.teamA.map((id, i) => `<@${id}>\n${champDisplay(lobby.picks.A[i] ?? "?")}`).join("\n\n"), inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: `🔴 TEAM ${lobby.teamNumB}`, value: lobby.teamB.map((id, i) => `<@${id}>\n${champDisplay(lobby.picks.B[i] ?? "?")}`).join("\n\n"), inline: true }
    )
    .addFields({ name: "\u200b", value: "*3 votes needed to confirm the result.*" })
    .setFooter({ text: "Vote below to confirm the winner." });

  const L = `L${lobby.lobbyId}_`;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(L + "voteA").setLabel(`🔵  Team ${lobby.teamNumA} Won`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(L + "voteB").setLabel(`🔴  Team ${lobby.teamNumB} Won`).setStyle(ButtonStyle.Danger)
  );
  const rows = [row1, cancelBtnRow(lobby)];

  if (lobby.boardMsg) {
    await lobby.boardMsg.edit({ embeds: [finalEmbed], components: rows }).catch(async () => {
      lobby.boardMsg = await lobby.draftChannel.send({ embeds: [finalEmbed], components: rows }).catch(() => null);
    });
  } else {
    lobby.boardMsg = await lobby.draftChannel.send({ embeds: [finalEmbed], components: rows }).catch(() => null);
  }
  lobby.phase = "vote";

  // Ping all 6 players to log on and play
  await lobby.draftChannel.send({
    content: `🎮 **Draft complete!** ${[...lobby.teamA, ...lobby.teamB].map(id => `<@${id}>`).join(" ")} — Go play **${lobby.map}**!`,
    allowedMentions: { users: [...lobby.teamA, ...lobby.teamB] }
  }).catch(() => {});

  // Close bets after 2 minutes
  lobby.betTimeout = setTimeout(async () => {
    if (lobby.betsClosed) return;
    lobby.betsClosed = true;
    if (lobby.betMsg) {
      const L = `L${lobby.lobbyId}_`;
      const closedRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(L + "betA").setLabel(`🔵 Bets closed`).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId(L + "betB").setLabel(`🔴 Bets closed`).setStyle(ButtonStyle.Danger).setDisabled(true)
      );
      await lobby.betMsg.edit({ components: [closedRow] }).catch(() => {});
    }
    await lobby.channel.send(`🎰 **Lobby #${lobby.lobbyId}** — Bets are now closed!`).catch(() => {});
  }, 270_000);
}

// ─── LOBBY CREATION ──────────────────────────────────────────────────
async function startLobby(channel, lobbyId) {
  const lobby = createLobby(lobbyId);
  lobby.active = true; lobby.phase = "waiting"; lobby.channel = channel;
  lobby.expected = queue.splice(0, 6);
  lobbies.set(lobbyId, lobby);
  const guild = channel.guild;
  for (const id of lobby.expected) await removeRole(guild, id, inQueueRole);
  await refreshQueue(channel, false).catch(() => {});

  lobby.lobbyPingMsg = await channel.send({
    content: `🎮 **Lobby #${lobbyId} — Queue full!** ${lobby.expected.map(id => `<@${id}>`).join(" ")}\nJoin voice channel **🔊 LOBBY #${lobbyId} — JOIN** to start the match.`,
    allowedMentions: { users: lobby.expected }
  }).catch(err => { log("ERROR", "Lobby ping failed:", err); return null; });

  for (const id of lobby.expected) {
    const member = await guild.members.fetch(id).catch(() => null);
    if (member) await member.send(`🎮 **Lobby #${lobbyId} is ready!** Join the voice channel **🔊 LOBBY #${lobbyId} — JOIN** to start the match.`).catch(() => {});
  }

  lobby.lobbyVoice = await guild.channels.create({ name: `🔊 LOBBY #${lobbyId} — JOIN`, type: ChannelType.GuildVoice })
    .catch(err => { log("ERROR", "Lobby voice create failed:", err); return null; });
  log("INFO", `Lobby #${lobbyId} voice created — waiting for 6 players.`);

  lobby.lobbyTimeout = setTimeout(async () => {
    if (!lobby.active || lobby.phase !== "waiting") return;
    const inVoice = lobby.lobbyVoice ? [...lobby.lobbyVoice.members.values()].map(m => m.id) : [];
    const missing = lobby.expected.filter(id => !inVoice.includes(id));
    const present = lobby.expected.filter(id => inVoice.includes(id));
    // Re-queue present players at the FRONT (they queued before current queue players)
    const toRequeue = present.filter(id => !queue.includes(id));
    if (toRequeue.length > 0) {
      queue = [...toRequeue, ...queue];
      for (const id of toRequeue) await addRole(channel.guild, id, inQueueRole);
    }
    for (const id of missing) await removeRole(channel.guild, id, inQueueRole);
    await channel.send(
      `⌛ **Lobby #${lobbyId}** expired after **${LOBBY_TIMEOUT}s**.\nMissing: ${missing.map(id => `<@${id}>`).join(", ")}\n${present.length > 0 ? `${present.map(id => `<@${id}>`).join(", ")} have been re-added to the queue.` : ""}`
    ).catch(() => {});
    await cleanupLobby(lobby);
  }, LOBBY_TIMEOUT * 1000);
}

// ─── VOICE LISTENER ──────────────────────────────────────────────────
client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    for (const [lobbyId, lobby] of [...lobbies]) {
      if (!lobbies.has(lobbyId)) continue;
      if (!lobby.active || lobby.phase !== "waiting" || !lobby.lobbyVoice) continue;
      try {
        const inVoice = [...lobby.lobbyVoice.members.values()].map(m => m.id);
        if (lobby.expected.every(id => inVoice.includes(id)) && inVoice.length >= 6) {
          startMatch(lobby).catch(err => {
            log("ERROR", `startMatch error L${lobbyId}:`, err);
            lobby.channel?.send(`❌ Failed to start Lobby #${lobbyId}. Use \`!cancel\` to reset.`);
          });
        }
      } catch (e) { log("WARN", `Voice check failed L${lobbyId}:`, e.message); }
    }
  } catch (err) { log("ERROR", "voiceStateUpdate error:", err); }
});

// ─── START MATCH ─────────────────────────────────────────────────────
async function startMatch(lobby) {
  if (lobby.phase !== "waiting") return;
  if (!lobbies.has(lobby.lobbyId)) return;
  lobby.phase = "starting";
  clearTimeout(lobby.lobbyTimeout); lobby.lobbyTimeout = null;
  const guild = lobby.channel.guild;
  const { A, B } = balance(lobby.expected);
  lobby.teamA = A; lobby.teamB = B;
  lobby.captainA = pickCaptain(A); lobby.captainB = pickCaptain(B);
  log("INFO", `L${lobby.lobbyId}: A=[${A}] B=[${B}] capA=${lobby.captainA} capB=${lobby.captainB}`);

  for (const id of [...A, ...B]) await addRole(guild, id, inGameRole);

  lobby.category = await guild.channels.create({ name: `⚔️ LOBBY #${lobby.lobbyId}`, type: ChannelType.GuildCategory });

  lobby.draftChannel = await guild.channels.create({
    name: `📝-lobby-draft-${lobby.lobbyId}`, type: ChannelType.GuildText, parent: lobby.category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel] },
      ...lobby.expected.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }
    ]
  });

  // Private team chat channels — fetch valid admin members first, exclude if already a player
  const validAdmins = [];
  for (const id of ADMIN_IDS) {
    if ([...A, ...B].includes(id)) continue; // Admin is a player, already has permissions
    const m = await guild.members.fetch(id).catch(() => null);
    if (m) validAdmins.push(id);
  }

  lobby.chatA = await guild.channels.create({
    name: `💬-team-${lobby.teamNumA}-chat`, type: ChannelType.GuildText, parent: lobby.category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      ...A.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
      ...validAdmins.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });
  lobby.chatB = await guild.channels.create({
    name: `💬-team-${lobby.teamNumB}-chat`, type: ChannelType.GuildText, parent: lobby.category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      ...B.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
      ...validAdmins.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });

  // Voice channels: visible to all, connect only for team
  lobby.voiceA = await guild.channels.create({
    name: `🔵 Team ${lobby.teamNumA}`, type: ChannelType.GuildVoice, parent: lobby.category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.Connect] },
      ...A.map(id => ({ id, allow: [PermissionsBitField.Flags.Connect] }))
    ]
  });
  lobby.voiceB = await guild.channels.create({
    name: `🔴 Team ${lobby.teamNumB}`, type: ChannelType.GuildVoice, parent: lobby.category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.Connect] },
      ...B.map(id => ({ id, allow: [PermissionsBitField.Flags.Connect] }))
    ]
  });

  const lobbyVoiceId = lobby.lobbyVoice?.id ?? null;
  for (const id of A) { const m = await guild.members.fetch(id).catch(() => null); if (m && lobbyVoiceId && m.voice.channelId === lobbyVoiceId) await m.voice.setChannel(lobby.voiceA).catch(err => log("WARN", `Move ${id}→A:`, err)); }
  for (const id of B) { const m = await guild.members.fetch(id).catch(() => null); if (m && lobbyVoiceId && m.voice.channelId === lobbyVoiceId) await m.voice.setChannel(lobby.voiceB).catch(err => log("WARN", `Move ${id}→B:`, err)); }

  if (lobby.lobbyVoice) { await lobby.lobbyVoice.delete().catch(err => log("WARN", "Lobby voice delete:", err)); lobby.lobbyVoice = null; }
  lobby.phase = "draft";
  lobby.map = MAPS[Math.floor(Math.random() * MAPS.length)];

  lobby.announceMsg = await lobby.channel.send({ embeds: [
    new EmbedBuilder().setTitle(`⚔️  Lobby #${lobby.lobbyId} — Match Starting!`).setColor(0xFEE75C)
      .setDescription(
        `🗺️ **Map: ${lobby.map}**\n\n` +
        `**🔵 Team ${lobby.teamNumA}** — Captain <@${lobby.captainA}>\n` + A.map(id => `<@${id}>`).join("  ·  ") +
        `\n\n**🔴 Team ${lobby.teamNumB}** — Captain <@${lobby.captainB}>\n` + B.map(id => `<@${id}>`).join("  ·  ") +
        `\n\n*Draft is live in <#${lobby.draftChannel.id}>!*`
      )
  ] }).catch(err => { log("WARN", "Announce failed:", err); return null; });

  // Send welcome messages to team chats
  await lobby.chatA.send(`🔵 **Team ${lobby.teamNumA} — Private Chat**\nDiscuss your ban/pick strategy here. Only your team and admins can see this channel.`).catch(() => {});
  await lobby.chatB.send(`🔴 **Team ${lobby.teamNumB} — Private Chat**\nDiscuss your ban/pick strategy here. Only your team and admins can see this channel.`).catch(() => {});

  // Bet message in queue channel
  const L = `L${lobby.lobbyId}_`;
  const betEmbed = new EmbedBuilder()
    .setTitle(`🎰  Lobby #${lobby.lobbyId} — Bets are open!`)
    .setColor(0xF1C40F)
    .setDescription(
      `🔵 **Team ${lobby.teamNumA}:** ${A.map(id => `<@${id}>`).join(", ")}\n` +
      `🔴 **Team ${lobby.teamNumB}:** ${B.map(id => `<@${id}>`).join(", ")}\n\n` +
      `*Place your bet! +1 ELO if you're right, -1 ELO if you're wrong.\nBets close 4min30 after draft ends. Players in the match cannot bet.*`
    );
  const betRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(L + "betA").setLabel(`🔵 Bet Team ${lobby.teamNumA}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(L + "betB").setLabel(`🔴 Bet Team ${lobby.teamNumB}`).setStyle(ButtonStyle.Danger)
  );
  lobby.betMsg = await lobby.channel.send({ embeds: [betEmbed], components: [betRow] }).catch(() => null);

  await startDraftStep(lobby);
}

// ─── FINISH MATCH ────────────────────────────────────────────────────
async function finishMatch(lobby, winner) {
  log("INFO", `L${lobby.lobbyId}: ${teamLabel(lobby, winner)} wins.`);
  const winners = winner === "A" ? lobby.teamA : lobby.teamB;
  const losers = winner === "A" ? lobby.teamB : lobby.teamA;
  const winLabel = teamLabel(lobby, winner);

  const avgWinElo = winners.reduce((s, id) => s + (stats[id]?.elo ?? 1000), 0) / 3;
  const avgLoseElo = losers.reduce((s, id) => s + (stats[id]?.elo ?? 1000), 0) / 3;
  const isUpset = avgWinElo < avgLoseElo;
  const changes = {};

  // Check bounty: is top 1 player in the losing team?
  const top1 = Object.entries(stats).filter(([,s]) => s.games > 0).sort(([,a],[,b]) => b.elo - a.elo)[0];
  const top1Id = top1 ? top1[0] : null;
  let bountyTriggered = false;
  let bountyKiller = null;

  winners.forEach(id => {
    ensurePlayer(id);
    let bonus = 0;
    // Bounty: if top 1 is on losing team, winners get +15
    if (top1Id && losers.includes(top1Id)) {
      bonus = 15;
      bountyTriggered = true;
      if (!bountyKiller) bountyKiller = id;
    }
    const r = calculateElo(stats[id].elo, avgLoseElo, true);
    changes[id] = r.change + bonus;
    stats[id].elo = r.newElo + bonus;
    stats[id].mmr = Math.max(100, stats[id].mmr + r.change + bonus);
    stats[id].wins++; stats[id].games++;
    stats[id].currentStreak++;
    if (stats[id].currentStreak > stats[id].bestStreak) stats[id].bestStreak = stats[id].currentStreak;
    if (stats[id].elo > stats[id].peakElo) stats[id].peakElo = stats[id].elo;
    if (isUpset) stats[id].clutchWins = (stats[id].clutchWins || 0) + 1;
  });

  losers.forEach(id => {
    ensurePlayer(id);
    const r = calculateElo(stats[id].elo, avgWinElo, false);
    changes[id] = r.change;
    stats[id].elo = Math.max(100, stats[id].elo + r.change);
    stats[id].mmr = Math.max(100, stats[id].mmr + r.change);
    stats[id].losses++; stats[id].games++;
    stats[id].currentStreak = 0;
  });

  // Resolve bets
  const betWinners = lobby.bets[winner];
  const betLosers = lobby.bets[winner === "A" ? "B" : "A"];
  const betChanges = {};

  for (const id of betWinners) {
    ensurePlayer(id);
    stats[id].elo = Math.min(9999, stats[id].elo + 1);
    stats[id].mmr = Math.min(9999, stats[id].mmr + 1);
    stats[id].betWins = (stats[id].betWins || 0) + 1;
    stats[id].betStreak = (stats[id].betStreak || 0) + 1;
    if (stats[id].betStreak > (stats[id].bestBetStreak || 0)) stats[id].bestBetStreak = stats[id].betStreak;
    if (stats[id].elo > stats[id].peakElo) stats[id].peakElo = stats[id].elo;
    betChanges[id] = +1;
  }
  for (const id of betLosers) {
    ensurePlayer(id);
    stats[id].elo = Math.max(100, stats[id].elo - 1);
    stats[id].mmr = Math.max(100, stats[id].mmr - 1);
    stats[id].betLosses = (stats[id].betLosses || 0) + 1;
    stats[id].betStreak = 0;
    betChanges[id] = -1;
  }

  season.matchCount++;
  await saveStatsNow();
  await saveSeason();

  // Save to match history
  matchHistory.push({
    timestamp: Date.now(), lobbyId: lobby.lobbyId,
    teamA: [...lobby.teamA], teamB: [...lobby.teamB],
    picksA: [...lobby.picks.A], picksB: [...lobby.picks.B],
    bansA: [...lobby.bans.A], bansB: [...lobby.bans.B],
    globalBans: [...lobby.globalBans],
    winner, changes: { ...changes }, map: lobby.map
  });
  await saveHistory();

  // Build bet results text
  let betText = "";
  if (betWinners.length > 0 || betLosers.length > 0) {
    betText = "\n\n**🎰 Bets**\n";
    if (betWinners.length > 0) betText += betWinners.map(id => `<@${id}> **+1** ✅`).join("\n") + "\n";
    if (betLosers.length > 0) betText += betLosers.map(id => `<@${id}> **-1** ❌`).join("\n");
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle(`🏆  ${winLabel} Wins! — Lobby #${lobby.lobbyId}`)
    .setColor(winner === "A" ? 0x3498DB : 0xE74C3C)
    .setDescription(
      `🗺️ **Map:** ${lobby.map}\n\n` +
      "**🥇 Winners**\n" + winners.map(id => `<@${id}>  **${changes[id] >= 0 ? "+" : ""}${changes[id]}**  \`${stats[id].elo} ELO\``).join("\n") +
      "\n\n**💀 Losers**\n" + losers.map(id => `<@${id}>  **${changes[id] >= 0 ? "+" : ""}${changes[id]}**  \`${stats[id].elo} ELO\``).join("\n") +
      betText
    ).setTimestamp();

  if (lobby.boardMsg) await lobby.boardMsg.delete().catch(() => {});
  if (lobby.lobbyPingMsg) await lobby.lobbyPingMsg.delete().catch(() => {});
  if (lobby.announceMsg) await lobby.announceMsg.delete().catch(() => {});
  if (lobby.betMsg) await lobby.betMsg.delete().catch(() => {});
  await lobby.channel.send({ embeds: [resultEmbed] });

  // History channel
  await lobby.channel.guild.channels.fetch().catch(() => {});
  const histCh = lobby.channel.guild.channels.cache.find(c => c.name === "history-match-lobbyelo" && c.isTextBased());
  if (histCh) {
    const histEmbed = new EmbedBuilder()
      .setTitle(`🏆  ${winLabel} Wins! — Lobby #${lobby.lobbyId}`)
      .setColor(winner === "A" ? 0x3498DB : 0xE74C3C)
      .setDescription(
        `🗺️ **Map:** ${lobby.map}\n\n` +
        `**🌍 Global Bans:** ${lobby.globalBans.length > 0 ? lobby.globalBans.map(c => champBanDisplay(c, true)).join(", ") : "—"}\n` +
        `**🚫 Bans T${lobby.teamNumA}:** ${lobby.bans.A.length > 0 ? lobby.bans.A.map(c => champBanDisplay(c, false)).join(", ") : "—"}\n` +
        `**🚫 Bans T${lobby.teamNumB}:** ${lobby.bans.B.length > 0 ? lobby.bans.B.map(c => champBanDisplay(c, false)).join(", ") : "—"}\n\n` +
        `**🔵 Team ${lobby.teamNumA}** — Captain <@${lobby.captainA}>\n` +
        lobby.teamA.map((id, i) => `<@${id}> ${champDisplay(lobby.picks.A[i] ?? "?")}  **${changes[id] >= 0 ? "+" : ""}${changes[id]}**  \`${stats[id].elo} ELO\``).join("\n") +
        `\n\n**🔴 Team ${lobby.teamNumB}** — Captain <@${lobby.captainB}>\n` +
        lobby.teamB.map((id, i) => `<@${id}> ${champDisplay(lobby.picks.B[i] ?? "?")}  **${changes[id] >= 0 ? "+" : ""}${changes[id]}**  \`${stats[id].elo} ELO\``).join("\n")
      ).setTimestamp().setFooter({ text: "LobbyELO Match History" });
    await histCh.send({ embeds: [histEmbed] }).catch(err => log("WARN", "History send failed:", err));
  }

  const guild = lobby.channel.guild;
  for (const id of [...winners, ...losers]) await removeRole(guild, id, inGameRole);
  await updateLadder();
  await updateBetLadder();

  // ── Announcements in general-chat-elb ──
  const generalCh = guild.channels.cache.find(c => c.name === "general-chat-elb" && c.isTextBased());
  if (generalCh) {
    // 5 win streak announcement
    for (const id of winners) {
      if (stats[id].currentStreak === 5) {
        await generalCh.send({ embeds: [
          new EmbedBuilder().setTitle("🔥  THE UNSTOPPABLE").setColor(0xFF4500)
            .setDescription(`<@${id}> has won **5 matches in a row** without a single loss!\nCan anyone stop this player?`)
        ] }).catch(() => {});
      }
    }

    // 5 bet streak announcement
    for (const id of betWinners) {
      if (stats[id].betStreak === 5) {
        await generalCh.send({ embeds: [
          new EmbedBuilder().setTitle("🔮  THE ORACLE").setColor(0x9B59B6)
            .setDescription(`<@${id}> has predicted **5 matches correctly** in a row!\nThis player sees the future.`)
        ] }).catch(() => {});
      }
    }

    // Bounty announcement
    if (bountyTriggered && top1Id) {
      await generalCh.send({ embeds: [
        new EmbedBuilder().setTitle("🎯  BOUNTY CLAIMED!").setColor(0xE74C3C)
          .setDescription(`<@${top1Id}> was **#1 on the ladder** and just got taken down!\nAll players on the winning team earned **+15 bonus ELO**.`)
      ] }).catch(() => {});
    }

  }

  await cleanupLobby(lobby);
}

// ─── CANCEL MATCH ────────────────────────────────────────────────────
async function cancelMatch(lobby) {
  log("INFO", `Lobby #${lobby.lobbyId} cancelled.`);
  lobby.active = false; lobby.phase = null;
  const guild = lobby.channel.guild;
  const allPlayers = [...new Set([...lobby.teamA, ...lobby.teamB, ...lobby.expected])];
  for (const id of allPlayers) { await removeRole(guild, id, inGameRole); await removeRole(guild, id, inQueueRole); }
  if (lobby.boardMsg) await lobby.boardMsg.delete().catch(() => {});
  if (lobby.lobbyPingMsg) await lobby.lobbyPingMsg.delete().catch(() => {});
  if (lobby.announceMsg) await lobby.announceMsg.delete().catch(() => {});
  if (lobby.betMsg) await lobby.betMsg.delete().catch(() => {});
  await lobby.channel.send(`⚠️ **Lobby #${lobby.lobbyId}** has been cancelled. No ELO changes.`).catch(() => {});
  await cleanupLobby(lobby);
}

// ─── CLEANUP ─────────────────────────────────────────────────────────
async function cleanupLobby(lobby) {
  stopTimer(lobby); clearTimeout(lobby.lobbyTimeout); clearTimeout(lobby.betTimeout);
  if (lobby.voiceA)       await lobby.voiceA.delete().catch(() => {});
  if (lobby.voiceB)       await lobby.voiceB.delete().catch(() => {});
  if (lobby.lobbyVoice)   await lobby.lobbyVoice.delete().catch(() => {});
  if (lobby.draftChannel) await lobby.draftChannel.delete().catch(() => {});
  if (lobby.chatA)        await lobby.chatA.delete().catch(() => {});
  if (lobby.chatB)        await lobby.chatB.delete().catch(() => {});
  if (lobby.category)     await lobby.category.delete().catch(() => {});
  const ch = lobby.channel;
  lobbies.delete(lobby.lobbyId);
  log("INFO", `Lobby #${lobby.lobbyId} cleanup done.`);
  if (ch) {
    await refreshQueue(ch, false).catch(() => {});
    if (queue.length >= 6) { const slot = getFreeLobbySlot(); if (slot) await startLobby(ch, slot).catch(err => log("ERROR", "Auto-startLobby error:", err)); }
  }
}

// ─── COMMANDS ────────────────────────────────────────────────────────
client.on("messageCreate", async msg => {
  try {
  if (msg.author.bot) return;

  // ── !queue ──
  if (msg.content === "!queue") {
    if (_queueLock) return;
    _queueLock = true;
    await msg.delete().catch(() => {});
    try {
      await ensureRoles(msg.guild);
      const userId = msg.author.id;
      const queueChannel = msg.guild.channels.cache.find(c => c.name === "queue-lobby-elo" && c.isTextBased());
      const isQueueChannel = queueChannel && msg.channel.id === queueChannel.id;
      if (!allLobbiesActive() && !queue.includes(userId) && !findLobbyByPlayer(userId) && !findLobbyByExpected(userId) && queue.length < 6) {
        ensurePlayer(userId); queue.push(userId); await addRole(msg.guild, userId, inQueueRole);
      }
      if (isQueueChannel) await refreshQueue(msg.channel, false);
      else if (queueChannel) await refreshQueue(queueChannel, false).catch(() => {});
      else await refreshQueue(msg.channel, false);
      if (queue.length >= 6) {
        const slot = getFreeLobbySlot();
        const lobbyChannel = isQueueChannel ? msg.channel : (queueChannel || msg.channel);
        if (slot) startLobby(lobbyChannel, slot).catch(err => { log("ERROR", "startLobby error:", err); lobbyChannel.send("❌ Failed to create lobby."); });
      }
    } finally { _queueLock = false; }
    return;
  }

  // ── !clearqueue ──
  if (msg.content.startsWith("!clearqueue")) {
    if (!ADMIN_IDS.includes(msg.author.id)) return msg.reply("❌ You don't have permission.");
    const mentioned = msg.mentions.users.first();
    if (mentioned) {
      await msg.delete().catch(() => {});
      if (queue.includes(mentioned.id)) {
        queue = queue.filter(id => id !== mentioned.id);
        await removeRole(msg.guild, mentioned.id, inQueueRole);
        const qc = msg.guild.channels.cache.find(c => c.name === "queue-lobby-elo" && c.isTextBased());
        if (qc) await refreshQueue(qc, false).catch(() => {});
      }
      return;
    }
    if (queue.length === 0) return msg.reply("Queue is already empty.");
    const count = queue.length;
    for (const id of queue) await removeRole(msg.guild, id, inQueueRole);
    queue = [];
    const qc = msg.guild.channels.cache.find(c => c.name === "queue-lobby-elo" && c.isTextBased());
    if (qc) await refreshQueue(qc, false).catch(() => {});
    await msg.channel.send(`🧹 Queue cleared — ${count} player${count > 1 ? "s" : ""} removed. Active matches are not affected.`);
    return;
  }

  // ── !captain ──
  if (msg.content === "!captain") {
    const lobby = findLobbyByDraftChannel(msg.channel.id);
    if (!lobby) return;
    if (!lobby.active || lobby.phase !== "draft") return msg.reply("❌ You can only claim captain during the draft phase.");
    const userId = msg.author.id;
    if (lobby.teamA.includes(userId)) { lobby.captainA = userId; await msg.channel.send(`👑 <@${userId}> is now the captain of **Team ${lobby.teamNumA}**!`); pushBoard(lobby); }
    else if (lobby.teamB.includes(userId)) { lobby.captainB = userId; await msg.channel.send(`👑 <@${userId}> is now the captain of **Team ${lobby.teamNumB}**!`); pushBoard(lobby); }
    else await msg.reply("❌ You're not part of this match.");
    return;
  }

  // ── !help ──
  if (msg.content === "!help") {
    await msg.channel.send({ embeds: [
      new EmbedBuilder().setTitle("📖  LobbyELO — Commands").setColor(0x5865F2)
        .setDescription(
          "**Everyone:**\n" +
          "`!queue` — Join the queue and open the queue panel\n" +
          "`!stats` — View your stats\n" +
          "`!stats @player` — View someone else's stats\n" +
          "`!history` — View your last 5 matches\n" +
          "`!history @player` — View someone else's last 5 matches\n" +
          "`!MMR` — View your lifetime MMR and current ELO\n" +
          "`!MMR @player` — View someone else's MMR\n" +
          "`!season` — View current season info\n" +
          "`!captain` — Claim captain for your team (draft channel only)\n" +
          "`!relation @p1 @p2` — View head-to-head stats between two players\n" +
          "`!totalplayer` — View total number of players registered\n" +
          "`!ladder` — Check the ladder channel\n\n" +
          "**Admin only:**\n" +
          "`!setelo @player <elo>` — Set a player's ELO\n" +
          "`!resetstats` — Reset all player stats (new season)\n" +
          "`!resetelostats @player` — Reset a specific player\n" +
          "`!oldstats` — Restore stats from before last reset\n" +
          "`!MMRreset` — Reset all lifetime MMR\n" +
          "`!clearqueue` — Clear the entire queue\n" +
          "`!clearqueue @player` — Silently remove a player from queue\n" +
          "`!resetlobby` — Reset all lobbies\n" +
          "`!resetlobby 1/2/3` — Reset a specific lobby\n" +
          "`!cancel 1/2/3` — Cancel a specific lobby"
        )
    ] });
    return;
  }

  // ── !stats ──
  if (msg.content.startsWith("!stats")) {
    const mentioned = msg.mentions.users.first();
    const targetId = mentioned ? mentioned.id : msg.author.id;
    ensurePlayer(targetId);
    const s = stats[targetId], total = s.wins + s.losses;
    const rank = Object.entries(stats).filter(([,st]) => st.games > 0).sort(([, a], [, b]) => b.elo - a.elo).findIndex(([id]) => id === targetId) + 1;
    const totalPlayers = Object.entries(stats).filter(([,st]) => st.games > 0).length;

    // Last 10 matches
    const playerMatches = matchHistory.filter(m => [...m.teamA, ...m.teamB].includes(targetId)).slice(-10);
    const last10 = playerMatches.map(m => {
      const isWinner = (m.winner === "A" && m.teamA.includes(targetId)) || (m.winner === "B" && m.teamB.includes(targetId));
      return isWinner ? "🟢" : "🔴";
    }).join("") || "—";

    // Nemesis & Prey calculation
    const h2h = {};
    matchHistory.forEach(m => {
      const myTeam = m.teamA.includes(targetId) ? "A" : m.teamB.includes(targetId) ? "B" : null;
      if (!myTeam) return;
      const opponents = myTeam === "A" ? m.teamB : m.teamA;
      const won = m.winner === myTeam;
      opponents.forEach(oppId => {
        if (!h2h[oppId]) h2h[oppId] = { winsAgainst: 0, lossesAgainst: 0 };
        if (won) h2h[oppId].winsAgainst++;
        else h2h[oppId].lossesAgainst++;
      });
    });
    const nemesis = Object.entries(h2h).filter(([,v]) => v.lossesAgainst >= 2).sort(([,a],[,b]) => b.lossesAgainst - a.lossesAgainst)[0];
    const prey = Object.entries(h2h).filter(([,v]) => v.winsAgainst >= 2).sort(([,a],[,b]) => b.winsAgainst - a.winsAgainst)[0];

    // Clutch King check
    const topClutch = Object.entries(stats).filter(([,st]) => st.games > 0).sort(([,a],[,b]) => (b.clutchWins||0) - (a.clutchWins||0))[0];
    const isClutchKing = topClutch && topClutch[0] === targetId && (topClutch[1].clutchWins || 0) > 0;

    const fields = [
      { name: "ELO", value: `\`${s.elo}\``, inline: true },
      { name: "Peak ELO", value: `\`${s.peakElo || s.elo}\``, inline: true },
      { name: "Rank", value: `\`#${rank > 0 ? rank : "—"} / ${totalPlayers}\``, inline: true },
      { name: "Win Rate", value: `\`${total === 0 ? 0 : Math.round(s.wins / total * 100)}%\``, inline: true },
      { name: "Wins", value: `\`${s.wins}\``, inline: true },
      { name: "Losses", value: `\`${s.losses}\``, inline: true },
      { name: "Current Streak", value: `\`${s.currentStreak}W\``, inline: true },
      { name: "Best Streak", value: `\`${s.bestStreak}W\``, inline: true },
      { name: "Clutch Wins", value: `\`${s.clutchWins || 0}\`${isClutchKing ? " 👊 **The Clutch King**" : ""}`, inline: true },
      { name: "Last 10", value: last10, inline: false }
    ];
    if (nemesis) fields.push({ name: "Nemesis", value: `<@${nemesis[0]}> (${nemesis[1].lossesAgainst} losses)`, inline: true });
    if (prey) fields.push({ name: "Prey", value: `<@${prey[0]}> (${prey[1].winsAgainst} wins)`, inline: true });

    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle(`📊  Stats — ${mentioned ? mentioned.username : msg.author.username}`)
        .setColor(0x57F287)
        .addFields(fields)
    ] });
    return;
  }

  // ── !history ──
  if (msg.content.startsWith("!history")) {
    const mentioned = msg.mentions.users.first();
    const targetId = mentioned ? mentioned.id : msg.author.id;
    const playerMatches = matchHistory.filter(m => [...m.teamA, ...m.teamB].includes(targetId)).slice(-5);
    if (playerMatches.length === 0) return msg.channel.send("No match history found.");

    const lines = playerMatches.map(m => {
      const isTeamA = m.teamA.includes(targetId);
      const isWinner = (m.winner === "A" && isTeamA) || (m.winner === "B" && !isTeamA);
      const change = m.changes[targetId] ?? 0;
      const result = isWinner ? "🟢 **WIN**" : "🔴 **LOSS**";
      const teammates = (isTeamA ? m.teamA : m.teamB).filter(id => id !== targetId).map(id => `<@${id}>`).join(", ");
      const opponents = (isTeamA ? m.teamB : m.teamA).map(id => `<@${id}>`).join(", ");
      const date = new Date(m.timestamp).toLocaleDateString();
      return `${result}  **${change >= 0 ? "+" : ""}${change}**  •  ${date}\nWith: ${teammates}  |  Vs: ${opponents}`;
    }).join("\n\n");

    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle(`📜  Match History — ${mentioned ? mentioned.username : msg.author.username}`)
        .setColor(0x5865F2).setDescription(lines)
    ] });
    return;
  }

  // ── !relation ──
  if (msg.content.startsWith("!relation")) {
    const mentions = [...msg.mentions.users.values()];
    if (mentions.length < 2) return msg.reply("❌ Usage: `!relation @player1 @player2`");
    const p1 = mentions[0].id, p2 = mentions[1].id;
    let p1vsP2 = 0, p2vsP1 = 0, together = 0, togetherWins = 0, total = 0;

    matchHistory.forEach(m => {
      const p1team = m.teamA.includes(p1) ? "A" : m.teamB.includes(p1) ? "B" : null;
      const p2team = m.teamA.includes(p2) ? "A" : m.teamB.includes(p2) ? "B" : null;
      if (!p1team || !p2team) return;
      total++;
      if (p1team === p2team) {
        together++;
        if (m.winner === p1team) togetherWins++;
      } else {
        if (m.winner === p1team) p1vsP2++;
        else p2vsP1++;
      }
    });

    if (total === 0) return msg.reply("No matches found between these two players.");

    const vsTotal = p1vsP2 + p2vsP1;
    const togetherWR = together === 0 ? 0 : Math.round(togetherWins / together * 100);

    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle(`⚔️  Relation — ${mentions[0].username} vs ${mentions[1].username}`)
        .setColor(0xE67E22)
        .setDescription(
          `**Total matches involving both:** ${total}\n\n` +
          `**🤝 As teammates:** ${together} games, ${togetherWins}W / ${together - togetherWins}L (${togetherWR}% WR)\n\n` +
          `**⚔️ As opponents:** ${vsTotal} games\n` +
          `<@${p1}> won ${p1vsP2} times\n` +
          `<@${p2}> won ${p2vsP1} times`
        )
    ] });
    return;
  }

  // ── !totalplayer ──
  if (msg.content === "!totalplayer") {
    const totalPlayers = Object.keys(stats).length;
    const activePlayers = Object.entries(stats).filter(([, s]) => s.games > 0).length;
    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle("👥  LobbyELO — Total Players")
        .setColor(0x5865F2)
        .setDescription(
          `**Total registered:** \`${totalPlayers}\` players\n` +
          `**With 1+ match played:** \`${activePlayers}\` players`
        )
    ] });
    return;
  }

  // ── !season ──
  if (msg.content === "!season") {
    const startDate = new Date(season.startDate);
    const now = new Date();
    const dayNum = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));

    // Most active player
    const activity = {};
    matchHistory.forEach(m => [...m.teamA, ...m.teamB].forEach(id => { activity[id] = (activity[id] || 0) + 1; }));
    const mostActive = Object.entries(activity).sort(([, a], [, b]) => b - a)[0];

    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle("📅  Current Season").setColor(0xFEE75C)
        .setDescription(
          `**Started:** ${startDate.toLocaleDateString()}\n` +
          `**Day:** ${dayNum}\n` +
          `**Total Matches:** ${season.matchCount}\n` +
          `**Players Ranked:** ${Object.keys(stats).length}\n` +
          (mostActive ? `**Most Active:** <@${mostActive[0]}> (${mostActive[1]} games)` : "")
        )
    ] });
    return;
  }

  // ── !MMR ──
  if (msg.content.startsWith("!MMR") && !msg.content.startsWith("!MMRreset")) {
    const mentioned = msg.mentions.users.first();
    const targetId = mentioned ? mentioned.id : msg.author.id;
    ensurePlayer(targetId);
    const s = stats[targetId];
    await msg.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle(`🎯  MMR — ${mentioned ? mentioned.username : msg.author.username}`)
        .setColor(0x9B59B6)
        .addFields(
          { name: "Lifetime MMR", value: `\`${s.mmr}\``, inline: true },
          { name: "Season ELO", value: `\`${s.elo}\``, inline: true },
          { name: "Games (all time)", value: `\`${s.games}\``, inline: true }
        )
    ] });
    return;
  }

  // ── !MMRreset (admin) ──
  if (msg.content === "!MMRreset") {
    if (!ADMIN_IDS.includes(msg.author.id)) return msg.reply("❌ You don't have permission.");
    Object.keys(stats).forEach(id => { stats[id].mmr = 1000; });
    await saveStatsNow();
    await msg.channel.send("🔄 All lifetime MMR has been reset to 1000.");
    return;
  }

  // ── !ladder ──
  if (msg.content === "!ladder") {
    if (ADMIN_IDS.includes(msg.author.id)) {
      await updateLadder();
      await msg.reply("✅ Ladder updated.");
    } else {
      const lc = msg.guild.channels.cache.find(c => c.name === "top-20-ladder" && c.isTextBased());
      if (lc) await msg.reply(`📊 Check the ladder here: <#${lc.id}>`);
      else await msg.reply("📊 Ladder channel not found.");
    }
    return;
  }

  // ── !setelo (admin) ──
  if (msg.content.startsWith("!setelo")) {
    if (!ADMIN_IDS.includes(msg.author.id)) return msg.reply("❌ You don't have permission.");
    const args = msg.content.trim().split(/\s+/);
    const mentioned = msg.mentions.users.first();
    const newElo = parseInt(args[args.length - 1]);
    if (!mentioned || isNaN(newElo) || newElo < 0) return msg.reply("❌ Usage: `!setelo @player <elo>`");
    ensurePlayer(mentioned.id);
    const oldElo = stats[mentioned.id].elo;
    stats[mentioned.id].elo = newElo;
    await saveStatsNow();
    await updateLadder();
    await msg.channel.send({ embeds: [
      new EmbedBuilder().setTitle("✏️  ELO Updated").setColor(0xFEE75C)
        .setDescription(`<@${mentioned.id}>\n\`${oldElo} ELO\` → \`${newElo} ELO\``)
    ] });
    return;
  }

  // ── !resetstats (admin) ──
  if (msg.content === "!resetstats") {
    if (!ADMIN_IDS.includes(msg.author.id)) return msg.reply("❌ You don't have permission.");
    // Backup before reset
    try { await fs.promises.writeFile(backupFile, JSON.stringify(stats, null, 2)); } catch (e) { log("WARN", "Backup failed:", e); }
    const count = Object.keys(stats).length;
    Object.keys(stats).forEach(id => {
      const mmr = stats[id].mmr ?? 1000;
      stats[id] = { elo: 1000, mmr, wins: 0, losses: 0, games: 0, bestStreak: 0, currentStreak: 0, peakElo: 1000, betWins: 0, betLosses: 0, betStreak: 0, bestBetStreak: 0, clutchWins: 0 };
    });
    season = { startDate: new Date().toISOString(), matchCount: 0 };
    matchHistory = [];
    await saveStatsNow(); await saveSeason(); await saveHistory();
    await updateLadder();
    await msg.channel.send({ embeds: [
      new EmbedBuilder().setTitle("🔄  Stats Reset!").setColor(0xED4245)
        .setDescription(`**${count} players** have been reset to \`1000 ELO\`. MMR preserved.\nUse \`!oldstats\` to undo.`).setTimestamp()
    ] });
    return;
  }

  // ── !oldstats (admin) ──
  if (msg.content === "!oldstats") {
    if (!ADMIN_IDS.includes(msg.author.id)) return msg.reply("❌ You don't have permission.");
    if (!fs.existsSync(backupFile)) return msg.reply("❌ No backup found.");
    try {
      stats = JSON.parse(await fs.promises.readFile(backupFile, "utf8"));
      await saveStatsNow();
      await updateLadder();
      await msg.channel.send("✅ Stats restored from backup.");
    } catch (e) { await msg.reply("❌ Failed to restore: " + e.message); }
    return;
  }

  // ── !resetelostats @player (admin) ──
  if (msg.content.startsWith("!resetelostats")) {
    if (!ADMIN_IDS.includes(msg.author.id)) return msg.reply("❌ You don't have permission.");
    const mentioned = msg.mentions.users.first();
    if (!mentioned) return msg.reply("❌ Usage: `!resetelostats @player`");
    ensurePlayer(mentioned.id);
    const mmr = stats[mentioned.id].mmr;
    stats[mentioned.id] = { elo: 1000, mmr, wins: 0, losses: 0, games: 0, bestStreak: 0, currentStreak: 0, peakElo: 1000, betWins: 0, betLosses: 0, betStreak: 0, bestBetStreak: 0, clutchWins: 0 };
    await saveStatsNow();
    await updateLadder();
    await msg.channel.send(`✅ <@${mentioned.id}> has been reset to \`1000 ELO\`. MMR preserved at \`${mmr}\`.`);
    return;
  }

  // ── !resetlobby (admin) ──
  if (msg.content.startsWith("!resetlobby")) {
    if (!ADMIN_IDS.includes(msg.author.id)) return msg.reply("❌ You don't have permission.");
    const args = msg.content.trim().split(/\s+/);
    const num = parseInt(args[1]);
    if (num >= 1 && num <= 3) {
      const lobby = lobbies.get(num);
      if (!lobby) return msg.reply(`❌ Lobby #${num} is not active.`);
      await cancelMatch(lobby);
      await msg.channel.send(`🔄 Lobby #${num} has been reset.`);
      return;
    }
    const hadLobbies = lobbies.size > 0;
    for (const id of queue) await removeRole(msg.guild, id, inQueueRole);
    for (const [, lobby] of lobbies) {
      lobby.active = false; lobby.phase = null;
      const all = [...new Set([...lobby.expected, ...lobby.teamA, ...lobby.teamB])];
      for (const id of all) { await removeRole(msg.guild, id, inGameRole); await removeRole(msg.guild, id, inQueueRole); }
      stopTimer(lobby); clearTimeout(lobby.lobbyTimeout); clearTimeout(lobby.betTimeout);
      if (lobby.voiceA) await lobby.voiceA.delete().catch(() => {});
      if (lobby.voiceB) await lobby.voiceB.delete().catch(() => {});
      if (lobby.lobbyVoice) await lobby.lobbyVoice.delete().catch(() => {});
      if (lobby.draftChannel) await lobby.draftChannel.delete().catch(() => {});
      if (lobby.chatA) await lobby.chatA.delete().catch(() => {});
      if (lobby.chatB) await lobby.chatB.delete().catch(() => {});
      if (lobby.category) await lobby.category.delete().catch(() => {});
      if (lobby.boardMsg) await lobby.boardMsg.delete().catch(() => {});
      if (lobby.lobbyPingMsg) await lobby.lobbyPingMsg.delete().catch(() => {});
      if (lobby.announceMsg) await lobby.announceMsg.delete().catch(() => {});
      if (lobby.betMsg) await lobby.betMsg.delete().catch(() => {});
    }
    lobbies.clear(); queue = [];
    await refreshQueue(msg.channel, false).catch(() => {});
    await msg.channel.send(hadLobbies ? "🔄 All lobbies cancelled and queue reset." : "🔄 Queue reset — all players removed.");
    return;
  }

  // ── !cancel ──
  if (msg.content.startsWith("!cancel")) {
    const hasPerms = msg.member?.permissions.has(PermissionsBitField.Flags.ManageChannels) || ADMIN_IDS.includes(msg.author.id);
    if (!hasPerms) return msg.reply("❌ You don't have permission.");
    const args = msg.content.trim().split(/\s+/);
    const num = parseInt(args[1]);
    if (num >= 1 && num <= 3) {
      const lobby = lobbies.get(num);
      if (!lobby) return msg.reply(`❌ Lobby #${num} is not active.`);
      await msg.channel.send(`⚠️ Lobby #${num} cancelled by a moderator.`);
      await cancelMatch(lobby);
      return;
    }
    const lobby = findLobbyByDraftChannel(msg.channel.id);
    if (lobby) { await msg.channel.send(`⚠️ Lobby #${lobby.lobbyId} cancelled.`); await cancelMatch(lobby); return; }
    if (lobbies.size === 0) return msg.reply("No active lobbies to cancel.");
    return msg.reply(`❌ Please specify: \`!cancel 1\`, \`!cancel 2\`, or \`!cancel 3\`\nActive: **#${[...lobbies.keys()].join(", ")}**`);
  }

  } catch (err) { log("ERROR", "messageCreate error:", err); }
});

// ─── BUTTON INTERACTIONS ─────────────────────────────────────────────
client.on("interactionCreate", async interaction => {
  try {
  if (!interaction.isButton()) return;
  const cid = interaction.customId;

  // ─── QUEUE BUTTONS ─────────────────────────────────────────
  if (cid === "q_join") {
    if (_queueLock) return interaction.reply({ content: "⏳ Processing, try again.", ephemeral: true });
    _queueLock = true;
    try {
      if (allLobbiesActive()) { _queueLock = false; return interaction.reply({ content: "⏳ All lobbies are in progress. Please wait for one to finish.", ephemeral: true }); }
      await ensureRoles(interaction.guild); ensurePlayer(interaction.user.id);
      if (findLobbyByPlayer(interaction.user.id) || findLobbyByExpected(interaction.user.id)) { _queueLock = false; return interaction.reply({ content: "❌ You're already in an active match.", ephemeral: true }); }
      if (queue.includes(interaction.user.id)) { _queueLock = false; return interaction.reply({ content: "You're already in the queue.", ephemeral: true }); }
      if (queue.length >= 6) { _queueLock = false; return interaction.reply({ content: "The queue is full.", ephemeral: true }); }
      queue.push(interaction.user.id);
      await addRole(interaction.guild, interaction.user.id, inQueueRole);
      await interaction.update({ embeds: [queueEmbed()], components: [queueBtns(false)] });
      if (queue.length >= 6) {
        const slot = getFreeLobbySlot();
        if (slot) { await interaction.message.edit({ embeds: [queueEmbed()], components: [queueBtns(true)] }).catch(() => {}); startLobby(interaction.channel, slot).catch(err => { log("ERROR", "startLobby error:", err); }); }
      }
    } finally { _queueLock = false; }
    return;
  }

  if (cid === "q_leave") {
    if (_queueLock) return interaction.reply({ content: "⏳ Processing, try again.", ephemeral: true });
    _queueLock = true;
    try {
      const wasIn = queue.includes(interaction.user.id);
      queue = queue.filter(id => id !== interaction.user.id);
      if (wasIn) await removeRole(interaction.guild, interaction.user.id, inQueueRole);
      await interaction.update({ embeds: [queueEmbed()], components: [queueBtns(false)] });
    } finally { _queueLock = false; }
    return;
  }

  // ─── LOBBY BUTTONS ─────────────────────────────────────────
  if (!cid.startsWith("L")) return;
  const lobbyId = parseInt(cid[1]);
  if (isNaN(lobbyId)) return;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return interaction.reply({ content: "❌ This lobby no longer exists.", ephemeral: true });
  const rest = cid.substring(3);

  // ── Bet ──
  if (rest === "betA" || rest === "betB") {
    const userId = interaction.user.id;
    // Players in the match cannot bet
    if ([...lobby.teamA, ...lobby.teamB].includes(userId))
      return interaction.reply({ content: "❌ You can't bet on your own match.", ephemeral: true });
    // Bets closed after 2 minutes
    if (lobby.betsClosed)
      return interaction.reply({ content: "❌ Bets are closed for this match.", ephemeral: true });
    // Already bet?
    if (lobby.bets.A.includes(userId) || lobby.bets.B.includes(userId))
      return interaction.reply({ content: "❌ You already placed a bet on this match.", ephemeral: true });

    const side = rest === "betA" ? "A" : "B";
    lobby.bets[side].push(userId);
    ensurePlayer(userId);

    await interaction.reply({
      content: `✅ You bet on **${teamLabel(lobby, side)}**. Good luck!`,
      ephemeral: true
    });
    await lobby.channel.send(`🎰 <@${userId}> bet on **${teamLabel(lobby, side)}**!`).catch(() => {});
    return;
  }

  // ── Cancel match vote ──
  if (rest === "cancel_match") {
    const allPlayers = [...lobby.teamA, ...lobby.teamB];
    if (!allPlayers.includes(interaction.user.id)) return interaction.reply({ content: "❌ You are not part of this match.", ephemeral: true });
    if (lobby.cancelVotes.has(interaction.user.id)) return interaction.reply({ content: "❌ You already voted to cancel.", ephemeral: true });
    lobby.cancelVotes.add(interaction.user.id);
    if (lobby.cancelVotes.size >= CANCEL_VOTES) { await interaction.deferUpdate().catch(() => {}); lobby.phase = "cancelled"; await cancelMatch(lobby); }
    else {
      await interaction.reply({ content: `✅ Cancel vote registered. (${lobby.cancelVotes.size}/${CANCEL_VOTES})`, ephemeral: true });
      if (lobby.phase === "draft") pushBoard(lobby);
      else if (lobby.phase === "vote" && lobby.boardMsg) {
        const L = `L${lobby.lobbyId}_`;
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(L + "voteA").setLabel(`🔵  Team ${lobby.teamNumA} Won`).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(L + "voteB").setLabel(`🔴  Team ${lobby.teamNumB} Won`).setStyle(ButtonStyle.Danger)
        );
        await lobby.boardMsg.edit({ components: [row1, cancelBtnRow(lobby)] }).catch(() => {});
      }
    }
    return;
  }

  // ── Category selector ──
  if (lobby.active && lobby.phase === "draft" && rest.startsWith("cat_")) {
    const s = stepOf(lobby);
    if (!s) return interaction.reply({ content: "❌ Draft is over.", ephemeral: true });
    if (interaction.user.id !== captainOf(lobby))
      return interaction.reply({ content: `❌ Only the ${teamLabel(lobby, s.team)} captain can act right now.`, ephemeral: true });
    const cat = rest.replace("cat_", "");
    if (cat === "back") { lobby.activeCategory = null; await interaction.update({ embeds: [boardEmbed(lobby)], components: buildDraftButtons(lobby) }); return; }
    lobby.activeCategory = cat;
    await interaction.update({ embeds: [boardEmbed(lobby)], components: buildDraftButtons(lobby) });
    return;
  }

  // ── Ban ──
  if (lobby.active && lobby.phase === "draft" && rest.startsWith("ban_")) {
    const s = stepOf(lobby);
    if (!s) return interaction.reply({ content: "❌ Draft is over.", ephemeral: true });
    const capId = captainOf(lobby);
    if (interaction.user.id !== capId) return interaction.reply({ content: `❌ Only the ${teamLabel(lobby, s.team)} captain can ban.`, ephemeral: true });
    if (s.type !== "ban") return interaction.reply({ content: "❌ It's pick phase, not ban phase.", ephemeral: true });
    const champ = rest.replace("ban_", "");
    if (lobby.globalBans.includes(champ)) return interaction.reply({ content: "❌ Already globally banned.", ephemeral: true });
    if (lobby.bans[s.team].includes(champ)) return interaction.reply({ content: "❌ Already banned by your team.", ephemeral: true });
    const expectedStep = lobby.draftStep;
    stopTimer(lobby);
    await interaction.deferUpdate().catch(() => {});
    if (lobby.draftStep !== expectedStep) return;

    if (s.global) {
      // Global ban: remove for BOTH teams
      lobby.globalBans.push(champ);
      lobby.available = lobby.available.filter(c => c !== champ);
      log("INFO", `L${lobby.lobbyId}: ${teamLabel(lobby, s.team)} GLOBAL banned ${champ}`);
    } else {
      // Regular ban: only for enemy team
      lobby.bans[s.team].push(champ);
      const opponent = s.team === "A" ? "B" : "A";
      if (lobby.bans[opponent].includes(champ)) { lobby.available = lobby.available.filter(c => c !== champ); }
      log("INFO", `L${lobby.lobbyId}: ${teamLabel(lobby, s.team)} banned ${champ}`);
    }
    advanceDraft(lobby);
    return;
  }

  // ── Pick ──
  if (lobby.active && lobby.phase === "draft" && rest.startsWith("pick_")) {
    const s = stepOf(lobby);
    if (!s) return interaction.reply({ content: "❌ Draft is over.", ephemeral: true });
    if (interaction.user.id !== captainOf(lobby)) return interaction.reply({ content: `❌ Only the ${teamLabel(lobby, s.team)} captain can pick.`, ephemeral: true });
    if (s.type !== "pick") return interaction.reply({ content: "❌ It's ban phase, not pick phase.", ephemeral: true });
    const champ = rest.replace("pick_", "");
    const oppBans = s.team === "A" ? lobby.bans.B : lobby.bans.A;
    const myPicks = lobby.picks[s.team];
    if (oppBans.includes(champ) && !lobby.bans[s.team].includes(champ)) return interaction.reply({ content: "❌ Banned for your team.", ephemeral: true });
    if (!lobby.available.includes(champ)) return interaction.reply({ content: "❌ Unavailable (double-banned).", ephemeral: true });
    if (myPicks.includes(champ)) return interaction.reply({ content: "❌ Already picked by your team.", ephemeral: true });
    const expectedStep = lobby.draftStep;
    stopTimer(lobby); // Stop timer immediately to prevent double action
    await interaction.deferUpdate().catch(() => {});
    if (lobby.draftStep !== expectedStep) return; // Step already advanced
    lobby.picks[s.team].push(champ);
    advanceDraft(lobby);
    return;
  }

  // ── Vote ──
  if (lobby.active && lobby.phase === "vote" && (rest === "voteA" || rest === "voteB")) {
    if (![...lobby.teamA, ...lobby.teamB].includes(interaction.user.id))
      return interaction.reply({ content: "❌ You are not part of this match.", ephemeral: true });
    if (lobby.phase !== "vote") return interaction.reply({ content: "❌ Already being processed.", ephemeral: true });
    const side = rest === "voteA" ? "A" : "B";
    lobby.votes.A.delete(interaction.user.id); lobby.votes.B.delete(interaction.user.id);
    lobby.votes[side].add(interaction.user.id);
    const vA = lobby.votes.A.size, vB = lobby.votes.B.size;
    if (vA >= 3 || vB >= 3) {
      lobby.phase = "finished";
      await interaction.reply({ content: `✅ You voted **${teamLabel(lobby, side)}**. Match is being resolved...`, ephemeral: true });
      finishMatch(lobby, vA >= 3 ? "A" : "B").catch(err => log("ERROR", `finishMatch error:`, err));
    } else {
      await interaction.reply({ content: `✅ You voted **${teamLabel(lobby, side)}**. (🔵 T${lobby.teamNumA}: ${vA}/3  |  🔴 T${lobby.teamNumB}: ${vB}/3)`, ephemeral: true });
    }
    return;
  }

  } catch (err) {
    log("ERROR", "interactionCreate error:", err);
    if (interaction.deferred || interaction.replied) return;
    interaction.reply({ content: "❌ An error occurred. Try again.", ephemeral: true }).catch(() => {});
  }
});

// ─── READY ───────────────────────────────────────────────────────────
client.once("ready", async () => {
  log("INFO", `Bot ready — ${client.user.tag}`);
  for (const [, guild] of client.guilds.cache) {
    await ensureRoles(guild).catch(err => log("WARN", `ensureRoles failed:`, err));
    const lc = guild.channels.cache.find(c => c.name === "top-20-ladder" && c.isTextBased());
    if (lc) { ladderChannel = lc; await updateLadder(); }
    const blc = guild.channels.cache.find(c => c.name === "top-20-ladder-bet" && c.isTextBased());
    if (blc) { betLadderChannel = blc; await updateBetLadder(); }
  }

  // Weekly recap — check every hour, post on Sundays at 20:00 UTC
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCDay() !== 0 || now.getUTCHours() !== 20) return;
    for (const [, guild] of client.guilds.cache) {
      const generalCh = guild.channels.cache.find(c => c.name === "general-chat-elb" && c.isTextBased());
      if (!generalCh) continue;

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekMatches = matchHistory.filter(m => m.timestamp > weekAgo);
      if (weekMatches.length === 0) continue;

      // Most active player
      const activity = {};
      weekMatches.forEach(m => [...m.teamA, ...m.teamB].forEach(id => { activity[id] = (activity[id] || 0) + 1; }));
      const mostActive = Object.entries(activity).sort(([,a],[,b]) => b - a)[0];

      // Biggest upset
      let biggestUpset = null, biggestUpsetDiff = 0;
      weekMatches.forEach(m => {
        const avgA = m.teamA.reduce((s, id) => s + (stats[id]?.elo ?? 1000), 0) / 3;
        const avgB = m.teamB.reduce((s, id) => s + (stats[id]?.elo ?? 1000), 0) / 3;
        const diff = Math.abs(avgA - avgB);
        const underdogWon = (avgA < avgB && m.winner === "A") || (avgB < avgA && m.winner === "B");
        if (underdogWon && diff > biggestUpsetDiff) { biggestUpsetDiff = diff; biggestUpset = m; }
      });

      // Best duo
      const duos = {};
      weekMatches.forEach(m => {
        const processTeam = (team, won) => {
          for (let i = 0; i < team.length; i++) {
            for (let j = i + 1; j < team.length; j++) {
              const key = [team[i], team[j]].sort().join("_");
              if (!duos[key]) duos[key] = { ids: [team[i], team[j]], games: 0, wins: 0 };
              duos[key].games++;
              if (won) duos[key].wins++;
            }
          }
        };
        processTeam(m.teamA, m.winner === "A");
        processTeam(m.teamB, m.winner === "B");
      });
      const bestDuo = Object.values(duos).filter(d => d.games >= 3).sort((a, b) => (b.wins / b.games) - (a.wins / a.games))[0];

      let desc = `**📊 Matches played:** ${weekMatches.length}\n`;
      if (mostActive) desc += `**🏃 Most active:** <@${mostActive[0]}> (${mostActive[1]} games)\n`;
      if (biggestUpset) {
        const underdogTeam = biggestUpset.winner;
        const underdogs = underdogTeam === "A" ? biggestUpset.teamA : biggestUpset.teamB;
        desc += `**😱 Biggest upset:** ${underdogs.map(id => `<@${id}>`).join(", ")} won with a **${Math.round(biggestUpsetDiff)} ELO** disadvantage\n`;
      }
      if (bestDuo) desc += `**🤝 Best duo:** <@${bestDuo.ids[0]}> & <@${bestDuo.ids[1]}> (${bestDuo.wins}W/${bestDuo.games - bestDuo.wins}L, ${Math.round(bestDuo.wins / bestDuo.games * 100)}% WR)\n`;

      await generalCh.send({ embeds: [
        new EmbedBuilder().setTitle("📅  Weekly Recap").setColor(0xF1C40F).setDescription(desc).setTimestamp()
      ] }).catch(() => {});
    }
  }, 3600_000);
});

// ─── LOGIN ───────────────────────────────────────────────────────────
log("INFO", `Attempting login, TOKEN present: ${!!process.env.TOKEN}`);
client.login(process.env.TOKEN)
  .then(() => log("INFO", "Login successful"))
  .catch(err => { log("ERROR", "Login failed:", err.message); process.exit(1); });