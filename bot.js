const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
} = require("discord.js");

const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let players = fs.existsSync("./players.json")
  ? JSON.parse(fs.readFileSync("./players.json"))
  : {};

let lobby = [];
let currentMatch = null;
let disbandVotes = new Set();
let winVotes = { team1: new Set(), team2: new Set() };

function savePlayers() {
  fs.writeFileSync("./players.json", JSON.stringify(players, null, 2));
}

function getName(id) {
  return players[id]?.ign || "Unknown";
}

function updateElo(winners, losers) {
  winners.forEach(id => {
    players[id].elo += 15;
    players[id].wins = (players[id].wins || 0) + 1;
  });

  losers.forEach(id => {
    players[id].elo -= 15;
    players[id].losses = (players[id].losses || 0) + 1;
  });

  savePlayers();
}

function balanceTeams(ids) {
  const sorted = [...ids].sort((a, b) => players[b].elo - players[a].elo);
  const t1 = [], t2 = [];

  sorted.forEach(id => {
    if (t1.length <= t2.length) t1.push(id);
    else t2.push(id);
  });

  return [t1, t2];
}

function massiveLobbyEmbed() {
  const desc = lobby.length === 0
    ? "```diff\n- LOBBY EMPTY\n```"
    : lobby.map((id, i) => {
        return `
━━━━━━━━━━━━━━━━━━━━━━━━━━
#${i + 1}  ⚔️  ${getName(id)}

ELO: ${players[id].elo}
WINS: ${players[id].wins || 0}
LOSSES: ${players[id].losses || 0}`;
      }).join("\n");

  return new EmbedBuilder()
    .setTitle("🔥 BATTLE RITE 3v3 LOBBY 🔥")
    .setDescription(desc)
    .setFooter({ text: `PLAYERS: ${lobby.length}/6` })
    .setColor(0xff0000);
}

function leaderboardEmbed() {
  const sorted = Object.values(players)
    .sort((a, b) => b.elo - a.elo);

  const desc = sorted.length === 0
    ? "No players yet"
    : sorted.map((p, i) => `
━━━━━━━━━━━━━━━━━━━━━━━━━━
#${i + 1}  ⚔️  ${p.ign}

ELO: ${p.elo}
WINS: ${p.wins || 0}
LOSSES: ${p.losses || 0}
`).join("\n");

  return new EmbedBuilder()
    .setTitle("🏆 GLOBAL LEADERBOARD 🏆")
    .setDescription(desc)
    .setColor(0xffd700);
}

function lobbyButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("join").setLabel("Join").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("leave").setLabel("Leave").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("leaderboard").setLabel("Leaderboard").setStyle(ButtonStyle.Secondary)
  );
}

function matchButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("t1").setLabel("Team 1 Win").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("t2").setLabel("Team 2 Win").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("disband").setLabel("Disband").setStyle(ButtonStyle.Danger)
  );
}

function matchEmbed(t1, t2) {
  const ascii = `
╔══════════════════════════════╗
        TOURNAMENT MATCH
╚══════════════════════════════╝`;

  return new EmbedBuilder()
    .setTitle("⚔️ MATCH READY ⚔️")
    .setDescription(`
${ascii}

━━━━━━━━ TEAM 1 ━━━━━━━━
${t1.map(id => `⚔️ ${getName(id)} (ELO: ${players[id].elo})`).join("\n")}

━━━━━━━━ TEAM 2 ━━━━━━━━
${t2.map(id => `⚔️ ${getName(id)} (ELO: ${players[id].elo})`).join("\n")}
`)
    .setColor(0x00ff00);
}

client.on("messageCreate", async message => {
  if (message.content === "!lobby") {
    lobby = [];
    currentMatch = null;
    message.channel.send({
      embeds: [massiveLobbyEmbed()],
      components: [lobbyButtons()]
    });
  }
});

client.on("interactionCreate", async interaction => {

  if (interaction.isButton()) {

    const id = interaction.user.id;

    if (interaction.customId === "join") {

      if (!players[id]) {
        const modal = new ModalBuilder()
          .setCustomId("register")
          .setTitle("Enter Your IGN");

        const input = new TextInputBuilder()
          .setCustomId("ign")
          .setLabel("In-Game Name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      if (!lobby.includes(id)) lobby.push(id);

      await interaction.update({
        embeds: [massiveLobbyEmbed()],
        components: [lobbyButtons()]
      });

      if (lobby.length === 6) {
        const [t1, t2] = balanceTeams(lobby);
        currentMatch = { t1, t2 };
        disbandVotes.clear();
        winVotes.team1.clear();
        winVotes.team2.clear();

        interaction.channel.send({
          embeds: [matchEmbed(t1, t2)],
          components: [matchButtons()]
        });
      }
    }

    if (interaction.customId === "leave") {
      lobby = lobby.filter(p => p !== id);
      return interaction.update({
        embeds: [massiveLobbyEmbed()],
        components: [lobbyButtons()]
      });
    }

    if (interaction.customId === "leaderboard") {
      return interaction.reply({ embeds: [leaderboardEmbed()], ephemeral: true });
    }

    if (interaction.customId === "disband") {
      disbandVotes.add(id);
      if (disbandVotes.size >= 2) {
        lobby = [];
        currentMatch = null;
        return interaction.update({ content: "MATCH DISBANDED.", embeds: [], components: [] });
      }
      return interaction.reply({ content: `Disband vote (${disbandVotes.size}/2)`, ephemeral: true });
    }

    if (interaction.customId === "t1" || interaction.customId === "t2") {

      const teamKey = interaction.customId === "t1" ? "team1" : "team2";
      winVotes[teamKey].add(id);

      if (winVotes[teamKey].size >= 3) {

        const winners = teamKey === "team1" ? currentMatch.t1 : currentMatch.t2;
        const losers = teamKey === "team1" ? currentMatch.t2 : currentMatch.t1;

        updateElo(winners, losers);

        lobby = [];
        currentMatch = null;

        return interaction.update({
          content: "MATCH VALIDATED. ELO UPDATED.",
          embeds: [],
          components: []
        });
      }

      return interaction.reply({ content: `Win vote (${winVotes[teamKey].size}/3)`, ephemeral: true });
    }
  }

  if (interaction.type === InteractionType.ModalSubmit) {

    if (interaction.customId === "register") {

      const ign = interaction.fields.getTextInputValue("ign");

      players[interaction.user.id] = {
        ign,
        elo: 1000,
        wins: 0,
        losses: 0
      };

      savePlayers();
      lobby.push(interaction.user.id);

      return interaction.reply({
        content: `IGN registered: ${ign}. You joined the lobby.`,
        ephemeral: true
      });
    }
  }
});

client.login(process.env.TOKEN);