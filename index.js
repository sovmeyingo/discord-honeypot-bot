import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import dotenv from 'dotenv';
import http from 'http';
import { handleHoneypotMessage } from './honeypot.js';
import { handleInteraction } from './commands.js';
import { handleMemberJoin } from './welcome.js';
import { checkAntiSpam, checkAntiLink, checkAntiMalware, checkToxicity } from './security.js';
import { handleVerificationInteraction, startVerificationReminder } from './verification.js';
import { handleChatbotMessage } from './chatbot.js';
import { initInviteTracker, handleInviteCreate, handleInviteDelete, trackMemberInvite } from './inviteTracker.js';
import { trackMessage, trackVoiceState } from './stats.js';

dotenv.config();

const token = process.env.DISCORD_TOKEN;

if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
  console.error('\x1b[31m[HATA] Lütfen .env dosyasındaki DISCORD_TOKEN alanını doldurun!\x1b[0m');
  process.exit(1);
}

// Bot sahibi ID'sini saklamak için değişken
let ownerId = null;

// Bot istemcisi kurulumu (Gerekli Gateway Intent'leri ile)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites
  ]
});

client.once('ready', async () => {
  console.log(`\x1b[32m[BAŞARILI] Bot başarıyla bağlandı! Aktif kullanıcı: ${client.user.tag}\x1b[0m`);
  console.log(`[BİLGİ] Davet linki oluşturmak için Client ID: ${process.env.CLIENT_ID || 'Belirtilmemiş'}`);
  
  try {
    const app = await client.application.fetch();
    if (app.owner) {
      ownerId = app.owner.ownerId || app.owner.id;
      console.log(`[BİLGİ] Bot Sahibi ID'si başarıyla alındı: ${ownerId}`);
    }
  } catch (err) {
    console.error('[HATA] Bot sahibi bilgisi alınamadı:', err);
  }

  // Doğrulama yapmayanlar için 4 saatlik hatırlatıcı döngüsünü başlat
  startVerificationReminder(client);

  // Davet takipçisini başlat
  await initInviteTracker(client);

  // Bot açıldığında eğer sahibi zaten müzik dinliyorsa durumu hemen güncelle
  setTimeout(() => {
    const targetUserId = process.env.SPOTIFY_TRACK_USER_ID || ownerId;
    if (!targetUserId) return;
    
    for (const guild of client.guilds.cache.values()) {
      const member = guild.members.cache.get(targetUserId);
      if (member && member.presence) {
        const activities = member.presence.activities || [];
        const spotifyActivity = activities.find(
          (activity) => activity.name === 'Spotify' && activity.type === ActivityType.Listening
        );
        if (spotifyActivity) {
          const song = spotifyActivity.details;
          const artist = spotifyActivity.state;
          client.user.setPresence({
            activities: [{
              name: 'custom',
              type: ActivityType.Custom,
              state: `🎵 ${song} - ${artist}`
            }]
          });
          console.log(`[SPOTIFY] Bot açılışında Spotify durumu algılandı: ${song} - ${artist}`);
          break;
        }
      }
    }
  }, 5000);
});

// Yeni üye katıldığında tetiklenen olay (Rol verme, yaş engeli ve davet takibi)
client.on('guildMemberAdd', async (member) => {
  try {
    await handleMemberJoin(member);
    await trackMemberInvite(member);
  } catch (error) {
    console.error('[HATA] Yeni üye katılım işlemleri sırasında hata:', error);
  }
});

// Yeni mesaj atıldığında güvenlik, aktiflik ve honeypot denetimlerini tetikle
client.on('messageCreate', async (message) => {
  // DM'leri veya botları es geç
  if (!message.guild || message.author.bot) return;

  // Aktiflik Mesaj Sayacı
  trackMessage(message.author.id);

  try {
    // 1. Güvenlik Denetimleri (Anti-Spam, Anti-Link, Anti-Malware)
    const isSpam = await checkAntiSpam(message);
    if (isSpam) return;

    const isLinkScam = await checkAntiLink(message);
    if (isLinkScam) return;

    const isMalware = await checkAntiMalware(message);
    if (isMalware) return;

    // AI Destekli Toksiklik / Kaba Kelime Filtresi
    const isToxic = await checkToxicity(message);
    if (isToxic) return;

    // 2. Honeypot Denetimi (Yasaklı kanala yazma tuzağı)
    if (message.channel.id === process.env.HONEYPOT_CHANNEL_ID) {
      await handleHoneypotMessage(message);
      return;
    }

    // 3. AI Chatbot Denetimi ("ai " ile başlayan mesajlar)
    await handleChatbotMessage(message);
  } catch (error) {
    console.error('[HATA] Mesaj denetlenirken bir sorun oluştu:', error);
  }
});

// Etkileşimleri (Slash komutları, Buton tıklamaları ve Modal formları) dinle
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    try {
      await handleInteraction(interaction);
    } catch (error) {
      console.error('[HATA] Komut işlenirken bir sorun oluştu:', error);
    }
  } else if (interaction.isButton() || interaction.isModalSubmit()) {
    try {
      await handleVerificationInteraction(interaction);
    } catch (error) {
      console.error('[HATA] Doğrulama işlemi sırasında hata:', error);
    }
  }
});

// Davet oluşturulduğunda önbelleği güncelle
client.on('inviteCreate', (invite) => {
  try {
    handleInviteCreate(invite);
  } catch (err) {
    console.error('[HATA] inviteCreate işlenirken hata:', err);
  }
});

// Davet silindiğinde önbelleği güncelle
client.on('inviteDelete', (invite) => {
  try {
    handleInviteDelete(invite);
  } catch (err) {
    console.error('[HATA] inviteDelete işlenirken hata:', err);
  }
});

// Ses kanalı hareketlerini takip et (Aktiflik İstatistikleri için)
client.on('voiceStateUpdate', (oldState, newState) => {
  try {
    trackVoiceState(oldState, newState);
  } catch (err) {
    console.error('[HATA] voiceStateUpdate işlenirken hata:', err);
  }
});

// Spotify durumunu takip edip botun durumunu güncelleme olayı
client.on('presenceUpdate', (oldPresence, newPresence) => {
  if (!newPresence || !newPresence.userId) return;

  const targetUserId = process.env.SPOTIFY_TRACK_USER_ID || ownerId;
  if (!targetUserId || newPresence.userId !== targetUserId) return;

  const activities = newPresence.activities || [];
  const spotifyActivity = activities.find(
    (activity) => activity.name === 'Spotify' && activity.type === ActivityType.Listening
  );

  if (spotifyActivity) {
    const song = spotifyActivity.details;
    const artist = spotifyActivity.state;
    const activityText = `🎵 ${song} - ${artist}`;
    
    client.user.setPresence({
      activities: [{
        name: 'custom',
        type: ActivityType.Custom,
        state: activityText
      }]
    });
    console.log(`[SPOTIFY] Bot durumu güncellendi: ${activityText}`);
  } else {
    // Spotify durdurulduğunda durumu temizle
    client.user.setPresence({ activities: [] });
    console.log('[SPOTIFY] Spotify durduruldu, bot durumu temizlendi.');
  }
});

// Hataları yakala
client.on('error', (error) => console.error('[D.JS HATASI]', error));
process.on('unhandledRejection', (error) => console.error('[BEKLENMEYEN HATA]', error));

// 7/24 Hosting platformları (Koyeb, Render vb.) için basit HTTP sunucusu
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Honeypot Bot aktif ve çalışıyor! 🍯');
}).listen(PORT, () => {
  console.log(`[BİLGİ] HTTP sunucu ${PORT} portunda dinleniyor. (Uptime Kontrolü İçin)`);
});

client.login(token);
