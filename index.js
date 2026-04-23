// ============================================================
//  FICTIF COMMANDS — Visual mockup testing
// ============================================================
//  !fictifqueue  →  envoie 3 styles (A/B/C) de panneau Queue
//  !fictifdraft  →  envoie 3 styles (A/B/C) de panneau Draft
//
//  Données 100% fictives, aucune fonction du bot n'est touchée.
//  À intégrer dans ton index.js :
//    1. Colle tout ce fichier au-dessus du listener messageCreate
//    2. Ajoute les 2 lignes de routage (tout en bas du fichier)
//    3. Remplace ELBPRO_EMOJI par ton vrai emoji ID
// ============================================================

const { EmbedBuilder } = require('discord.js');

// ⚠️  Remplace par ton vrai ID d'emoji :ELBPRO:
const ELBPRO_EMOJI = '<:ELBPRO:REPLACE_WITH_EMOJI_ID>';

// Helper : récupère l'emoji d'un champion depuis ton CHAMP_EMOJIS,
// avec fallback unicode si la clé n'existe pas.
function champEmoji(name) {
  try {
    if (typeof CHAMP_EMOJIS !== 'undefined' && CHAMP_EMOJIS[name]) {
      return CHAMP_EMOJIS[name];
    }
  } catch (_) {}
  return '🎭';
}

// ---------- MOCK DATA ----------
const FICTIF_PLAYERS = [
  { name: 'ShadowViper',   elo: 1542 },
  { name: 'Frostweaver',   elo: 1418 },
  { name: 'Ironblade',     elo: 1356 },
  { name: 'Nightwhisper',  elo: 1289 },
  { name: 'Bloodhawk',     elo: 1201 },
  { name: 'Stormcaller',   elo: 1098 },
];
const FICTIF_QUEUE_COUNT = 3;        // 3/6 joueurs en queue pour le test
const FICTIF_MAP = 'Dragon Garden Night';

// Draft fictif : step 5/10, Team A est en train de pick
const FICTIF_DRAFT = {
  matchId: 42,
  lobbyId: 1,
  step: 5,
  totalSteps: 10,
  timerSec: 58,
  map: 'Dragon Garden Night',
  currentTeam: 'A',
  currentAction: 'PICK',
  teamA: {
    name: 'Team Alpha',
    players: ['ShadowViper', 'Ironblade', 'Bloodhawk'],
    picks: [
      { name: 'Jade' },
      { name: 'Ruh Kaan' },
    ],
    bans: [],
  },
  teamB: {
    name: 'Team Omega',
    players: ['Frostweaver', 'Nightwhisper', 'Stormcaller'],
    picks: [
      { name: 'Lucie' },
    ],
    bans: [],
  },
  globalBans: [
    { name: 'Bakko' },
    { name: 'Raigon' },
  ],
};

// ============================================================
//  QUEUE  —  STYLE A · ARENA BROADCAST
// ============================================================
function buildQueueStyleA() {
  const queued = FICTIF_PLAYERS.slice(0, FICTIF_QUEUE_COUNT);
  const filled = '█'.repeat(queued.length);
  const empty  = '░'.repeat(6 - queued.length);

  let roster = '';
  for (let i = 0; i < 6; i++) {
    const n = String(i + 1).padStart(2, ' ');
    if (queued[i]) {
      roster += `\`${n}\` ${ELBPRO_EMOJI} **${queued[i].name}** ▸ \`${queued[i].elo}\`\n`;
    } else {
      roster += `\`${n}\` ─────── *empty slot* ───────\n`;
    }
  }

  return new EmbedBuilder()
    .setColor(0xC9A227)
    .setTitle(`${ELBPRO_EMOJI}  ⚔️   PRO QUEUE   ⚔️`)
    .setDescription(
      '```\n' +
      '╔══════════════════════════════╗\n' +
      '    ARENA BROADCAST · LIVE\n' +
      '╚══════════════════════════════╝\n' +
      '```' +
      `▸ **LOBBY** · \`#1 PRO\`\n` +
      `▸ **MAP** · ${FICTIF_MAP}\n` +
      `▸ **SLOTS** · \`[${filled}${empty}]\` ${queued.length}/6\n\n` +
      `▎ **QUEUED PLAYERS**\n${roster}`
    )
    .setFooter({ text: '─── STYLE A · ARENA BROADCAST ───' });
}

// ============================================================
//  QUEUE  —  STYLE B · CYBER / HUD
// ============================================================
function buildQueueStyleB() {
  const queued = FICTIF_PLAYERS.slice(0, FICTIF_QUEUE_COUNT);
  const dots = '⬤'.repeat(queued.length) + '○'.repeat(6 - queued.length);

  const list = queued.length
    ? queued.map(p => `▸ ${ELBPRO_EMOJI} \`${p.name.padEnd(14, ' ')}\` · \`ELO ${p.elo}\``).join('\n')
    : '*— no players queued —*';

  return new EmbedBuilder()
    .setColor(0x00D9FF)
    .setTitle(`${ELBPRO_EMOJI}  PRO QUEUE  »  LOBBY #1`)
    .setDescription(
      `─────────────────────────────\n` +
      `› **STATUS**   \`[ WAITING ]\`\n` +
      `› **PLAYERS**  ${queued.length}/6  ${dots}\n` +
      `› **MAP**      ${FICTIF_MAP}\n` +
      `─────────────────────────────\n` +
      `› **QUEUE**\n${list}`
    )
    .setFooter({ text: '─── STYLE B · CYBER / HUD ───' });
}

// ============================================================
//  QUEUE  —  STYLE C · BATTLE CARD
// ============================================================
function buildQueueStyleC() {
  const queued = FICTIF_PLAYERS.slice(0, FICTIF_QUEUE_COUNT);
  const avgElo = queued.length
    ? Math.round(queued.reduce((s, p) => s + p.elo, 0) / queued.length)
    : 0;

  const roster = queued.length
    ? queued.map((p, i) => `\`${i + 1}.\` ${ELBPRO_EMOJI} **${p.name}** — \`ELO ${p.elo}\``).join('\n')
    : '*— empty —*';

  return new EmbedBuilder()
    .setColor(0xE63946)
    .setTitle(`${ELBPRO_EMOJI}  PRO QUEUE  •  LOBBY #1`)
    .setDescription('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    .addFields(
      { name: '🗺️  MAP',     value: FICTIF_MAP,       inline: true },
      { name: '🟡  STATUS',  value: 'WAITING',         inline: true },
      { name: '👥  SLOTS',   value: `${queued.length}/6`, inline: true },
      { name: '📊  AVG ELO', value: `\`${avgElo}\``,   inline: true },
      { name: '🎯  MODE',    value: '3v3 Ranked',      inline: true },
      { name: '⏱️  OPENED',  value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      { name: '▎ ROSTER',    value: roster,            inline: false },
    )
    .setFooter({ text: '─── STYLE C · BATTLE CARD ───' });
}

// ============================================================
//  DRAFT  —  STYLE A · ARENA BROADCAST
// ============================================================
function buildDraftStyleA() {
  const d = FICTIF_DRAFT;
  const progFilled = '▰'.repeat(d.step);
  const progEmpty  = '▱'.repeat(d.totalSteps - d.step);
  const mm = Math.floor(d.timerSec / 60);
  const ss = String(d.timerSec % 60).padStart(2, '0');

  const buildTeamCol = (team, teamLetter) => {
    const lines = [];
    for (let i = 0; i < 3; i++) {
      if (team.picks[i]) {
        lines.push(`${champEmoji(team.picks[i].name)} **${team.picks[i].name}**`);
      } else if (d.currentTeam === teamLetter && i === team.picks.length) {
        lines.push(`⋯ *picking...*`);
      } else {
        lines.push(`─ *waiting*`);
      }
    }
    return lines.join('\n');
  };

  const gBans = d.globalBans.map(b => `${champEmoji(b.name)} ~~${b.name}~~`).join(' · ') || '*none*';

  return new EmbedBuilder()
    .setColor(0xC9A227)
    .setTitle(`⚔️   DRAFT IN PROGRESS   ⚔️`)
    .setDescription(
      '```\n' +
      '╔════════════════════════════════╗\n' +
      `   MATCH #${d.matchId}  ·  LOBBY #${d.lobbyId}\n` +
      '╚════════════════════════════════╝\n' +
      '```' +
      `▸ **MAP** · ${d.map}\n` +
      `▸ **STEP** · ${d.step}/${d.totalSteps} — TEAM ${d.currentTeam} ${d.currentAction}\n` +
      `▸ **PROGRESS** · \`[${progFilled}${progEmpty}]\`\n` +
      `▸ **TIMER** · ⏱️ \`${mm}:${ss}\``
    )
    .addFields(
      { name: '🔴 TEAM ALPHA',  value: buildTeamCol(d.teamA, 'A'), inline: true },
      { name: '\u200b',         value: '**⚔️**',                    inline: true },
      { name: '🔵 TEAM OMEGA',  value: buildTeamCol(d.teamB, 'B'), inline: true },
      { name: '⛔ GLOBAL BANS', value: gBans,                      inline: false },
      { name: '⛔ TEAM BANS',   value: `**Alpha :** —\n**Omega :** —`, inline: false },
    )
    .setFooter({ text: '─── STYLE A · ARENA BROADCAST ───' });
}

// ============================================================
//  DRAFT  —  STYLE B · CYBER / HUD
// ============================================================
function buildDraftStyleB() {
  const d = FICTIF_DRAFT;
  const progFilled = '▰'.repeat(d.step);
  const progEmpty  = '▱'.repeat(d.totalSteps - d.step);
  const mm = Math.floor(d.timerSec / 60);
  const ss = String(d.timerSec % 60).padStart(2, '0');

  const colA = [];
  const colB = [];
  for (let i = 0; i < 3; i++) {
    if (d.teamA.picks[i]) colA.push(`${champEmoji(d.teamA.picks[i].name)} ${d.teamA.picks[i].name}`);
    else if (d.currentTeam === 'A' && i === d.teamA.picks.length) colA.push('⋯ picking');
    else colA.push('○ waiting');

    if (d.teamB.picks[i]) colB.push(`${champEmoji(d.teamB.picks[i].name)} ${d.teamB.picks[i].name}`);
    else if (d.currentTeam === 'B' && i === d.teamB.picks.length) colB.push('⋯ picking');
    else colB.push('○ waiting');
  }

  const gBans = d.globalBans.map(b => `${champEmoji(b.name)} ~~${b.name}~~`).join('  ') || '—';

  return new EmbedBuilder()
    .setColor(0x7B2CBF)
    .setTitle(`${ELBPRO_EMOJI}  DRAFT  »  MATCH #${d.matchId}  »  LOBBY #${d.lobbyId}`)
    .setDescription(
      `────────────────────────────────────\n` +
      `› **STEP**      \`[ ${d.step}/${d.totalSteps} ]\` — TEAM ${d.currentTeam} ${d.currentAction}\n` +
      `› **TIMER**     ⏱️ \`${mm}:${ss}\`\n` +
      `› **MAP**       ${d.map}\n` +
      `› **PROGRESS**  ${progFilled}${progEmpty}\n` +
      `────────────────────────────────────`
    )
    .addFields(
      { name: '[ TEAM A ]', value: colA.join('\n'), inline: true },
      { name: '[ TEAM B ]', value: colB.join('\n'), inline: true },
      { name: '\u200b',     value: '\u200b',         inline: true },
      { name: '[ BANS ]',   value: `› **GLOBAL**  ${gBans}\n› **A** —    › **B** —`, inline: false },
    )
    .setFooter({ text: '─── STYLE B · CYBER / HUD ───' });
}

// ============================================================
//  DRAFT  —  STYLE C · BATTLE CARD
// ============================================================
function buildDraftStyleC() {
  const d = FICTIF_DRAFT;
  const progPct = Math.round((d.step / d.totalSteps) * 100);
  const mm = Math.floor(d.timerSec / 60);
  const ss = String(d.timerSec % 60).padStart(2, '0');

  const fmtTeam = (team, letter) => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      if (team.picks[i]) {
        out.push(`**${i + 1}.** ${champEmoji(team.picks[i].name)} ${team.picks[i].name}`);
      } else if (d.currentTeam === letter && i === team.picks.length) {
        out.push(`**${i + 1}.** 🎯 *picking...*`);
      } else {
        out.push(`**${i + 1}.** ⬚ *—*`);
      }
    }
    return out.join('\n');
  };

  const gBans = d.globalBans.map(b => `${champEmoji(b.name)} ~~${b.name}~~`).join('\n') || '*—*';

  return new EmbedBuilder()
    .setColor(0xE63946)
    .setTitle(`⚔️  MATCH #${d.matchId}  •  DRAFT  •  LOBBY #${d.lobbyId}`)
    .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🗺️ **${d.map}**  ·  ⏱️ **${mm}:${ss}**  ·  🎯 **${progPct}%**`)
    .addFields(
      { name: '🔴  TEAM ALPHA', value: fmtTeam(d.teamA, 'A'), inline: true },
      { name: '⚔️',             value: `\n**STEP**\n\`${d.step}/${d.totalSteps}\`\n\n**TURN**\nTEAM ${d.currentTeam}`, inline: true },
      { name: '🔵  TEAM OMEGA', value: fmtTeam(d.teamB, 'B'), inline: true },
      { name: '⛔ GLOBAL BANS', value: gBans,                 inline: true },
      { name: '⛔ ALPHA BANS',  value: '*—*',                 inline: true },
      { name: '⛔ OMEGA BANS',  value: '*—*',                 inline: true },
    )
    .setFooter({ text: '─── STYLE C · BATTLE CARD ───' });
}

// ============================================================
//  HANDLERS
// ============================================================
async function handleFictifQueue(message) {
  await message.channel.send({
    content: '🎨  **FICTIF QUEUE** — 3 styles à comparer (données 100% fictives) :',
    embeds: [buildQueueStyleA(), buildQueueStyleB(), buildQueueStyleC()],
  });
}

async function handleFictifDraft(message) {
  await message.channel.send({
    content: '🎨  **FICTIF DRAFT** — 3 styles à comparer (Match #42 fictif, step 5/10) :',
    embeds: [buildDraftStyleA(), buildDraftStyleB(), buildDraftStyleC()],
  });
}

// ============================================================
//  ROUTAGE — à coller dans ton listener messageCreate
// ============================================================
//
//  client.on('messageCreate', async (message) => {
//    if (message.author.bot) return;
//
//    if (message.content === '!fictifqueue') return handleFictifQueue(message);
//    if (message.content === '!fictifdraft') return handleFictifDraft(message);
//
//    // ... tes autres commandes existantes ...
//  });
//
// ============================================================