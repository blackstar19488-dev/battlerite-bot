
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");

/* ================= CLIENT ================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.once("ready", () => {
    console.log("🔥 ULTIMATE COMPETITIVE SYSTEM READY");
});

/* ================= DATA ================= */

let queue = [];

let stats = fs.existsSync("./stats.json")
    ? JSON.parse(fs.readFileSync("./stats.json"))
    : {};

function saveStats(){
    fs.writeFileSync("./stats.json", JSON.stringify(stats, null, 2));
}

function ensurePlayer(id){
    if(!stats[id]){
        stats[id] = { elo:1000, wins:0, losses:0 };
        saveStats();
    }
}

/* ================= CHAMPIONS ================= */

const ALL_CHAMPIONS = [
"Alysia","Ashka","Bakko","Blossom","Croak","Destiny","Ezmo",
"Freya","Iva","Jade","Jamila","Jumong","Lucie","Oldur","Pearl",
"Pestilus","Poloma","Raigon","Rook","Ruh Kaan","Shen Rao",
"Shifu","Sirius","Taya","Thorn","Ulric","Varesh"
];

/* ================= MATCH STATE ================= */

function resetMatch(){
    return {
        active:false,
        phase:null,
        teamA:[],
        teamB:[],
        captainA:null,
        captainB:null,
        available:[...ALL_CHAMPIONS],
        picks:{},
        turn:null,
        timeout:null,
        channel:null,
        lobbyVoice:null,
        category:null,
        voiceA:null,
        voiceB:null
    };
}

let match = resetMatch();

/* ================= QUEUE ================= */

function buildQueueEmbed(){
    return new EmbedBuilder()
        .setTitle("🔥 Battlerite 3v3 Queue")
        .setColor(0xFF0000)
        .setDescription(
            queue.length===0
            ? "Queue empty."
            : queue.map((id,i)=>`#${i+1} <@${id}> | ELO: ${stats[id]?.elo||1000}`).join("\n")
        )
        .setFooter({text:`${queue.length}/6`});
}

function buildQueueButtons(){
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("join").setLabel("Join").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("leave").setLabel("Leave").setStyle(ButtonStyle.Danger)
    );
}

client.on("messageCreate", async msg=>{
    if(msg.author.bot) return;
    if(msg.content==="!queue"){
        await msg.channel.send({
            embeds:[buildQueueEmbed()],
            components:[buildQueueButtons()]
        });
    }
});

/* ================= TEAM BALANCE ================= */

function balance(players){
    const sorted=[...players].sort((a,b)=>stats[b].elo-stats[a].elo);
    const A=[],B=[];
    sorted.forEach((id,i)=> i%2===0?A.push(id):B.push(id));
    return {A,B};
}

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction=>{

    if(!interaction.isButton()) return;

    /* QUEUE */

    if(interaction.customId==="join"){
        if(match.active) return interaction.reply({content:"Match running.",ephemeral:true});
        ensurePlayer(interaction.user.id);
        if(queue.includes(interaction.user.id))
            return interaction.reply({content:"Already queued.",ephemeral:true});
        if(queue.length>=6)
            return interaction.reply({content:"Queue full.",ephemeral:true});

        queue.push(interaction.user.id);

        await interaction.update({
            embeds:[buildQueueEmbed()],
            components:[buildQueueButtons()]
        });

        if(queue.length===6){
            await createLobby(interaction.channel);
        }
    }

    if(interaction.customId==="leave"){
        queue=queue.filter(id=>id!==interaction.user.id);
        await interaction.update({
            embeds:[buildQueueEmbed()],
            components:[buildQueueButtons()]
        });
    }

    /* VOTE */

    if(match.active && interaction.customId==="voteA"){
        finishMatch("A");
        await interaction.reply({content:"Team A wins!",ephemeral:true});
    }

    if(match.active && interaction.customId==="voteB"){
        finishMatch("B");
        await interaction.reply({content:"Team B wins!",ephemeral:true});
    }
});

/* ================= LOBBY VOICE ================= */

async function createLobby(channel){

    match = resetMatch();
    match.active=true;
    match.phase="waiting_voice";
    match.channel=channel;

    match.teamA=[];
    match.teamB=[];

    match.lobbyVoice=await channel.guild.channels.create({
        name:"🎧 3v3 LOBBY JOIN",
        type:ChannelType.GuildVoice
    });

    channel.send("🎧 Lobby created. All 6 players must join this voice channel.");

    client.on("voiceStateUpdate", async (oldState,newState)=>{

        if(!match.active || match.phase!=="waiting_voice") return;

        const members = match.lobbyVoice.members.map(m=>m.id);
        const allPresent = queue.every(id=>members.includes(id));

        if(allPresent && members.length===6){
            await startMatch();
        }
    });
}

/* ================= START MATCH ================= */

async function startMatch(){

    const {A,B}=balance(queue);

    match.teamA=A;
    match.teamB=B;
    match.captainA=A[0];
    match.captainB=B[0];
    match.available=[...ALL_CHAMPIONS];

    await match.lobbyVoice.delete().catch(()=>{});

    match.category=await match.channel.guild.channels.create({
        name:"MATCH",
        type:ChannelType.GuildCategory
    });

    match.voiceA=await match.channel.guild.channels.create({
        name:"🔴 Team A",
        type:ChannelType.GuildVoice,
        parent:match.category.id
    });

    match.voiceB=await match.channel.guild.channels.create({
        name:"🔵 Team B",
        type:ChannelType.GuildVoice,
        parent:match.category.id
    });

    for(const id of A){
        const member = await match.channel.guild.members.fetch(id);
        await member.voice.setChannel(match.voiceA).catch(()=>{});
    }

    for(const id of B){
        const member = await match.channel.guild.members.fetch(id);
        await member.voice.setChannel(match.voiceB).catch(()=>{});
    }

    match.phase="draft";
    match.turn=match.captainA;

    match.channel.send("⚔️ Teams ready. Draft starting.");
    sendDraft();
}

/* ================= DRAFT ================= */

function sendDraft(){

    const embed=new EmbedBuilder()
        .setTitle("🎯 Draft Phase")
        .setDescription(`Turn: <@${match.turn}>`)
        .setColor(0x00AEFF);

    const rows=[];
    for(let i=0;i<match.available.length;i+=5){
        const row=new ActionRowBuilder();
        match.available.slice(i,i+5).forEach(c=>{
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId("champ_"+c)
                    .setLabel(c)
                    .setStyle(ButtonStyle.Primary)
            );
        });
        rows.push(row);
    }

    match.channel.send({embeds:[embed],components:rows});
    startTimeout();
}

function startTimeout(){
    clearTimeout(match.timeout);
    match.timeout=setTimeout(()=>{
        const random=match.available[Math.floor(Math.random()*match.available.length)];
        match.available=match.available.filter(c=>c!==random);
        nextPick(random,true);
    },240000);
}

client.on("interactionCreate", async interaction=>{

    if(!interaction.isButton()) return;
    if(!match.active || !interaction.customId.startsWith("champ_")) return;

    if(interaction.user.id!==match.turn)
        return interaction.reply({content:"Not your turn.",ephemeral:true});

    const champ=interaction.customId.replace("champ_","");
    if(!match.available.includes(champ))
        return interaction.reply({content:"Unavailable.",ephemeral:true});

    clearTimeout(match.timeout);
    match.available=match.available.filter(c=>c!==champ);

    nextPick(champ,false,interaction);
});

function nextPick(champ,auto=false,interaction=null){

    if(match.phase==="draft"){
        match.picks[match.turn]=champ;
        if(interaction) interaction.update({content:`Picked ${champ}`,components:[]});

        const order=[...match.teamA,...match.teamB];
        const picked=Object.keys(match.picks).length;

        if(picked>=6){
            finishDraft();
            return;
        }

        match.turn=order[picked];
        sendDraft();
    }
}

/* ================= FINISH DRAFT ================= */

async function finishDraft(){

    clearTimeout(match.timeout);

    const embed=new EmbedBuilder()
        .setTitle("⚔️ MATCH READY")
        .setDescription(
            "**Team A**\n"+match.teamA.map(id=>`<@${id}> → ${match.picks[id]||"?"}`).join("\n")+
            "\n\n**Team B**\n"+match.teamB.map(id=>`<@${id}> → ${match.picks[id]||"?"}`).join("\n")
        );

    await match.channel.send({embeds:[embed]});

    const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("voteA").setLabel("Team A Win").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("voteB").setLabel("Team B Win").setStyle(ButtonStyle.Danger)
    );

    await match.channel.send({content:"Select winner:",components:[row]});
}

/* ================= FINISH MATCH ================= */

async function finishMatch(winner){

    const winners=winner==="A"?match.teamA:match.teamB;
    const losers=winner==="A"?match.teamB:match.teamA;

    winners.forEach(id=>{
        stats[id].elo+=25;
        stats[id].wins++;
    });

    losers.forEach(id=>{
        stats[id].elo-=25;
        stats[id].losses++;
    });

    saveStats();

    await match.channel.send("🏆 ELO Updated (+25 / -25)");

    await cleanup();
}

/* ================= CLEANUP ================= */

async function cleanup(){

    clearTimeout(match.timeout);

    if(match.category) await match.category.delete().catch(()=>{});

    queue=[];
    match=resetMatch();
}

client.login(process.env.TOKEN);
