import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import http from 'http';
import { handleHoneypotMessage } from './honeypot.js';
import { handleInteraction } from './commands.js';
import { handleMemberJoin } from './welcome.js';
import { checkAntiSpam, checkAntiLink, checkAntiMalware } from './security.js';
import { handleVerificationInteraction, startVerificationReminder } from './verification.js';

dotenv.config();

const token = process.env.DISCORD_TOKEN;

if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
  console.error('\x1b[31m[HATA] Lütfen .env dosyasındaki DISCORD_TOKEN alanını doldurun!\x1b[0m');
  process.exit(1);
}

// Bot istemcisi kurulumu (Gerekli Gateway Intent'leri ile)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', () => {
  console.log(`\x1b[32m[BAŞARILI] Bot başarıyla bağlandı! Aktif kullanıcı: ${client.user.tag}\x1b[0m`);
  console.log(`[BİLGİ] Davet linki oluşturmak için Client ID: ${process.env.CLIENT_ID || 'Belirtilmemiş'}`);
  
  // Doğrulama yapmayanlar için 4 saatlik hatırlatıcı döngüsünü başlat
  startVerificationReminder(client);
});

// Yeni üye katıldığında tetiklenen olay (Rol verme ve yaş engeli kontrolü)
client.on('guildMemberAdd', async (member) => {
  try {
    await handleMemberJoin(member);
  } catch (error) {
    console.error('[HATA] Yeni üye katılım işlemleri sırasında hata:', error);
  }
});

// Yeni mesaj atıldığında güvenlik ve honeypot denetimlerini tetikle
client.on('messageCreate', async (message) => {
  // DM'leri veya botları es geç
  if (!message.guild || message.author.bot) return;

  try {
    // 1. Güvenlik Denetimleri (Anti-Spam, Anti-Link, Anti-Malware)
    const isSpam = await checkAntiSpam(message);
    if (isSpam) return;

    const isLinkScam = await checkAntiLink(message);
    if (isLinkScam) return;

    const isMalware = await checkAntiMalware(message);
    if (isMalware) return;

    // 2. Honeypot Denetimi (Yasaklı kanala yazma tuzağı)
    await handleHoneypotMessage(message);
  } catch (error) {
    console.error('[HATA] Mesaj denetlenirken bir sorun oluştu:', error);
  }
});

// Etkileşimleri (Slash komutları ve Buton tıklamaları) dinle
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    try {
      await handleInteraction(interaction);
    } catch (error) {
      console.error('[HATA] Komut işlenirken bir sorun oluştu:', error);
    }
  } else if (interaction.isButton()) {
    try {
      await handleVerificationInteraction(interaction);
    } catch (error) {
      console.error('[HATA] Buton doğrulama işlemi sırasında hata:', error);
    }
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
