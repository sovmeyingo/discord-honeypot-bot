import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import http from 'http';
import { handleHoneypotMessage } from './honeypot.js';
import { handleInteraction } from './commands.js';

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
});

// Yeni mesaj atıldığında honeypot denetimini tetikle
client.on('messageCreate', async (message) => {
  try {
    await handleHoneypotMessage(message);
  } catch (error) {
    console.error('[HATA] Mesaj denetlenirken bir sorun oluştu:', error);
  }
});

// Slash komutlarını dinle
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error('[HATA] Komut işlenirken bir sorun oluştu:', error);
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
