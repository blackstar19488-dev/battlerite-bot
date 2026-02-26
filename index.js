process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log("BOT READY");
});

/* ==========================
   DATA
========================== */

let queue = [];

let stats = fs.existsSync("./stats.json")
  ? JSON.parse(fs.readFileSync("./stats.json"))
  : {};

function saveStats() {
  fs.writeFileSync("./stats.json", JSON.stringify(stats, null, 2));
}

function ensurePlayer(id) {
  if (!stats[id]) {
    stats[id] = { elo: 1000, wins: 0, losses: 0 };
    saveStats();
  }
}

/* ==========================
   TEAM BALANCE
========================== */

function createBalancedTeams(players) {
  const sorted = [...players].sort(
    (a, b) => (stats[b]?.elo || 1000) - (stats[a]?.elo || 1000)
  );

  const team1 = [];
  const team2 = [];

  sorted.forEach((id, i) => {
    if (i % 2 === 0) team1.push(id);
    else team2.push(id);
  });

  function pickCaptain(team) {
    const max = Math.max(...team.map(id => stats[id]?.elo || 1000));
    const candidates = team.filter(id => (stats[id]?.elo || 1000) === max);
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  return {
    team1,
    team2,
    captain1: pickCaptain(team1),
    captain2: pickCaptain(team2)
  };
}

/* ==========================
   EMBED
========================== */

function buildQueueEmbed() {
  return new EmbedBuilder()
    .setTitle("🔥 Battlerite 3v3 Queue")
    .setDescription(
      queue.length === 0
        ? "Queue is empty."
        : queue
            .map(
              (id, i) =>
                `#${i + 1} | <@${id}> 🏆 ELO: ${stats[id]?.elo || 1000}`
            )
            .join("\n")
    )
    .setFooter({ text: `Queue ${queue.length}/6` })
    .setColor(0xff0000);
}

function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("join")
      .setLabel("Join")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("leave")
      .setLabel("Leave")
      .setStyle(ButtonStyle.Danger)
  );
}

/* ==========================
   COMMAND
========================== */

client.on("messageCreate", async message => {
  if (message.content === "!queue") {
    await message.channel.send({
      embeds: [buildQueueEmbed()],
      components: [buildButtons()]
    });
  }
});

/* ==========================
   SINGLE INTERACTION HANDLER
========================== */

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  /* JOIN */
  if (interaction.customId === "join") {
    ensurePlayer(interaction.user.id);

    if (queue.includes(interaction.user.id)) {
      return interaction.reply({
        content: "Already in queue.",
        ephemeral: true
      });
    }

    if (queue.length >= 6) {
      return interaction.reply({
        content: "Queue full.",
        ephemeral: true
      });
    }

    queue.push(interaction.user.id);

    await interaction.update({
      embeds: [buildQueueEmbed()],
      components: [buildButtons()]
    });

    /* MATCH FOUND */
    if (queue.length === 6) {
      const { team1, team2, captain1, captain2 } =
        createBalancedTeams(queue);

      const matchEmbed = new EmbedBuilder()
        .setTitle("⚔️ MATCH FOUND ⚔️")
        .setColor(0x00ff00)
        .setDescription(
          `**Team 1**\n${team1
            .map(id => `<@${id}> ${id === captain1 ? "👑" : ""}`)
            .join("\n")}\n\n` +
            `**Team 2**\n${team2
              .map(id => `<@${id}> ${id === captain2 ? "👑" : ""}`)
              .join("\n")}`
        );

      await interaction.channel.send({
        content: queue.map(id => `<@${id}>`).join(" "),
        embeds: [matchEmbed]
      });

      queue = [];

      await interaction.message.edit({
        embeds: [buildQueueEmbed()],
        components: [buildButtons()]
      });
    }

    return;
  }

  /* LEAVE */
  if (interaction.customId === "leave") {
    queue = queue.filter(id => id !== interaction.user.id);

    await interaction.update({
      embeds: [buildQueueEmbed()],
      components: [buildButtons()]
    });

    return;
  }
});

client.login(process.env.TOKEN);