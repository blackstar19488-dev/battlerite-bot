// MASSIVE FULL SYSTEM - BATTLE RITE 3V3

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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

client.once("ready", () => {
    console.log("BOT READY");
});

/* ===========================
   BASIC DATA
=========================== */

const champions = [
    "Bakko","Croak","Freya","Jamila","Raigon","Rook","Ruh'kaan","Shifu Thorn",
    "Alysia","Ashka","Destiny","Ezmo","Iva","Jade","Jumong","Shen Rao","Taya","Varesh",
    "Blossom","Lucie","Oldur","Peal","Pestilus","Poloma","Sirius","Ulric","Zander"
];

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

function updateElo(winners, losers) {
    const K = 30;

    function calc(rA, rB, win) {
        const expected = 1 / (1 + Math.pow(10, (rB - rA) / 400));
        return rA + K * (win - expected);
    }

    const avgWin = winners.reduce((a, id) => a + stats[id].elo, 0) / winners.length;
    const avgLose = losers.reduce((a, id) => a + stats[id].elo, 0) / losers.length;

    winners.forEach(id => {
        stats[id].elo = Math.round(calc(stats[id].elo, avgLose, 1));
        stats[id].wins++;
    });

    losers.forEach(id => {
        stats[id].elo = Math.round(calc(stats[id].elo, avgWin, 0));
        stats[id].losses++;
    });

    saveStats();
}

/* ===========================
   TEAM BALANCE
=========================== */

function createBalancedTeams(players) {

    const sorted = [...players].sort((a,b)=>stats[b].elo - stats[a].elo);

    const team1 = [];
    const team2 = [];

    sorted.forEach((id,i)=>{
        if(i%2===0) team1.push(id);
        else team2.push(id);
    });

    function pickCaptain(team){
        const max = Math.max(...team.map(id=>stats[id].elo));
        const candidates = team.filter(id=>stats[id].elo===max);
        return candidates[Math.floor(Math.random()*candidates.length)];
    }

    return {
        team1,
        team2,
        captain1: pickCaptain(team1),
        captain2: pickCaptain(team2)
    };
}

/* ===========================
   GLOBAL DRAFT STATE
=========================== */

let draft = null;

/* ===========================
   QUEUE COMMAND
=========================== */

client.on("messageCreate", async message => {

    if(message.content==="!queue"){

        const embed = new EmbedBuilder()
            .setTitle("🔥 Battlerite 3v3 Queue")
            .setDescription(queue.length===0
                ? "Queue is empty."
                : queue.map((id,i)=>`#${i+1} | <@${id}> ELO: ${stats[id]?.elo||1000}`).join("\n"))
            .setFooter({text:`Queue ${queue.length}/6`});

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("join").setLabel("Join").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("leave").setLabel("Leave").setStyle(ButtonStyle.Danger)
        );

        message.channel.send({embeds:[embed],components:[row]});
    }
});

/* ===========================
   BUTTON HANDLER
=========================== */

client.on("interactionCreate", async interaction=>{

if(!interaction.isButton()) return;

/* JOIN */

if(interaction.customId==="join"){

    ensurePlayer(interaction.user.id);

    if(queue.includes(interaction.user.id)){
        return interaction.reply({content:"Already in queue.",ephemeral:true});
    }

    if(queue.length>=6){
        return interaction.reply({content:"Queue full.",ephemeral:true});
    }

    queue.push(interaction.user.id);

    if(queue.length===6){

        const {team1,team2,captain1,captain2} = createBalancedTeams(queue);

        draft = {
            team1,
            team2,
            captain1,
            captain2,
            bans:[],
            picks:{},
            phase:"ban1",
            turn: captain1,
            votes:{team1:[],team2:[]}
        };

        const embed = new EmbedBuilder()
            .setTitle("⚔️ MATCH FOUND ⚔️")
            .setDescription(
                `Team 1\n${team1.map(id=>`<@${id}> ${id===captain1?"👑":""}`).join("\n")}\n\n`+
                `Team 2\n${team2.map(id=>`<@${id}> ${id===captain2?"👑":""}`).join("\n")}`
            );

        await interaction.channel.send({content:queue.map(id=>`<@${id}>`).join(" "),embeds:[embed]});

        const lobbyVoice = await interaction.guild.channels.create({
            name:"LOBBY 3V3 DRAFT",
            type:2
        });

        draft.lobbyVoiceId = lobbyVoice.id;
        draft.textChannelId = interaction.channel.id;

        interaction.channel.send("Join LOBBY 3V3 DRAFT within 240 seconds.");

        draft.disbandTimer = setTimeout(async()=>{
            if(!draft) return;
            const ch = interaction.guild.channels.cache.get(draft.lobbyVoiceId);
            if(ch) await ch.delete().catch(()=>{});
            interaction.channel.send("Lobby disbanded (timeout).");
            draft=null;
        },240000);

        queue=[];
    }

    return interaction.reply({content:"Joined queue.",ephemeral:true});
}

/* LEAVE */

if(interaction.customId==="leave"){
    queue=queue.filter(id=>id!==interaction.user.id);
    return interaction.reply({content:"Left queue.",ephemeral:true});
}

});
/* ===========================
   VOICE LISTENER
=========================== */

client.on("voiceStateUpdate", async (oldState,newState)=>{

if(!draft) return;

const lobby = newState.guild.channels.cache.get(draft.lobbyVoiceId);
if(!lobby) return;

const allPlayers=[...draft.team1,...draft.team2];

const inside = lobby.members.filter(m=>allPlayers.includes(m.id));

if(inside.size===6){

    clearTimeout(draft.disbandTimer);

    const t1 = await newState.guild.channels.create({name:"TEAM 1",type:2});
    const t2 = await newState.guild.channels.create({name:"TEAM 2",type:2});

    draft.team1Voice=t1.id;
    draft.team2Voice=t2.id;

    for(const id of draft.team1){
        const m=await newState.guild.members.fetch(id);
        if(m.voice.channel) await m.voice.setChannel(t1);
    }

    for(const id of draft.team2){
        const m=await newState.guild.members.fetch(id);
        if(m.voice.channel) await m.voice.setChannel(t2);
    }

    startBanPhase(newState.guild);
}

});

/* ===========================
   BAN + PICK SYSTEM
=========================== */

async function startBanPhase(guild){

const channel = guild.channels.cache.get(draft.textChannelId);

channel.send({
    content:`🔴 BAN PHASE\n<@${draft.turn}> must ban.`,
    components:createChampButtons("ban")
});

startTimer(guild);
}

function createChampButtons(type){

const rows=[];
let row=new ActionRowBuilder();

champions.forEach((c,i)=>{
    if(draft.bans.includes(c) || draft.picks[c]){
        return;
    }

    if(row.components.length===5){
        rows.push(row);
        row=new ActionRowBuilder();
    }

    row.addComponents(
        new ButtonBuilder()
        .setCustomId(`${type}_${c}`)
        .setLabel(c)
        .setStyle(type==="ban"?ButtonStyle.Danger:ButtonStyle.Primary)
    );
});

if(row.components.length>0) rows.push(row);

return rows;
}

function startTimer(guild){

draft.timer=setTimeout(()=>{
    autoAction(guild);
},90000);
}

function autoAction(guild){

const available=champions.filter(c=>!draft.bans.includes(c)&&!draft.picks[c]);

const random=available[Math.floor(Math.random()*available.length)];

if(draft.phase.startsWith("ban")){
    draft.bans.push(random);
}else{
    draft.picks[random]=draft.turn;
}

nextPhase(guild,random,true);
}

client.on("interactionCreate", async interaction=>{

if(!interaction.isButton()) return;
if(!draft) return;

if(interaction.customId.startsWith("ban_")||interaction.customId.startsWith("pick_")){

if(interaction.user.id!==draft.turn)
    return interaction.reply({content:"Not your turn.",ephemeral:true});

clearTimeout(draft.timer);

const champ=interaction.customId.split("_")[1];

if(draft.phase.startsWith("ban")){
    draft.bans.push(champ);
}else{
    draft.picks[champ]=draft.turn;
}

nextPhase(interaction.guild,champ,false);
}
});

function nextPhase(guild,champ,auto){

const channel=guild.channels.cache.get(draft.textChannelId);

let msg=auto?`⏳ Auto selected ${champ}`:`${champ} selected`;

if(draft.phase==="ban1"){
    draft.phase="ban2";
    draft.turn=draft.captain2;
    channel.send(`${msg}\n<@${draft.turn}> must ban.`);
    startTimer(guild);
    return;
}

if(draft.phase==="ban2"){
    draft.phase="pick1";
    draft.turn=draft.captain1;
    channel.send(`${msg}\n🔵 PICK PHASE\n<@${draft.turn}> pick.`);
    startTimer(guild);
    return;
}

if(draft.phase==="pick1"){
    draft.phase="pick2a";
    draft.turn=draft.captain2;
    channel.send(`${msg}\n<@${draft.turn}> pick 2.`);
    startTimer(guild);
    return;
}

if(draft.phase==="pick2a"){
    draft.phase="pick2b";
    draft.turn=draft.captain2;
    channel.send(`${msg}\n<@${draft.turn}> pick again.`);
    startTimer(guild);
    return;
}

if(draft.phase==="pick2b"){
    draft.phase="pick3a";
    draft.turn=draft.captain1;
    channel.send(`${msg}\n<@${draft.turn}> pick 2.`);
    startTimer(guild);
    return;
}

if(draft.phase==="pick3a"){
    draft.phase="pick3b";
    draft.turn=draft.captain1;
    channel.send(`${msg}\n<@${draft.turn}> pick again.`);
    startTimer(guild);
    return;
}

if(draft.phase==="pick3b"){
    draft.phase="pick4";
    draft.turn=draft.captain2;
    channel.send(`${msg}\n<@${draft.turn}> final pick.`);
    startTimer(guild);
    return;
}

if(draft.phase==="pick4"){
    channel.send("Draft complete. Start your match.");

    startValidation(guild);
}
}

/* ===========================
   MATCH VALIDATION
=========================== */

function startValidation(guild){

const channel=guild.channels.cache.get(draft.textChannelId);

const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("win1").setLabel("Team 1 Win").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("win2").setLabel("Team 2 Win").setStyle(ButtonStyle.Primary)
);

channel.send({content:"Vote winner (4 votes required).",components:[row]});
}

client.on("interactionCreate", async interaction=>{

if(!interaction.isButton()) return;
if(!draft) return;

if(interaction.customId==="win1"){
    if(!draft.votes.team1.includes(interaction.user.id))
        draft.votes.team1.push(interaction.user.id);
}

if(interaction.customId==="win2"){
    if(!draft.votes.team2.includes(interaction.user.id))
        draft.votes.team2.push(interaction.user.id);
}

if(draft.votes.team1.length>=4){
    updateElo(draft.team1,draft.team2);
    endMatch(interaction.guild,"Team 1 Wins");
}

if(draft.votes.team2.length>=4){
    updateElo(draft.team2,draft.team1);
    endMatch(interaction.guild,"Team 2 Wins");
}

interaction.reply({content:"Vote registered.",ephemeral:true});
});

async function endMatch(guild,msg){

const channel=guild.channels.cache.get(draft.textChannelId);
channel.send(`🏆 ${msg}`);

const t1=guild.channels.cache.get(draft.team1Voice);
const t2=guild.channels.cache.get(draft.team2Voice);
const lobby=guild.channels.cache.get(draft.lobbyVoiceId);

if(t1) await t1.delete().catch(()=>{});
if(t2) await t2.delete().catch(()=>{});
if(lobby) await lobby.delete().catch(()=>{});

draft=null;
}

/* ===========================
   LOGIN
=========================== */

client.login(process.env.TOKEN);