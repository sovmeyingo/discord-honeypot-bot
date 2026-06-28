import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || token === 'YOUR_BOT_TOKEN_HERE') {
  console.error('\x1b[31m[HATA] .env dosyasında DISCORD_TOKEN bulunamadı!\x1b[0m');
  process.exit(1);
}

if (!clientId || clientId === 'YOUR_CLIENT_ID_HERE') {
  console.error('\x1b[31m[HATA] .env dosyasında CLIENT_ID (Application ID) bulunamadı!\x1b[0m');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('tuzak-durum')
    .setDescription('Honeypot sistem durumunu ve yapılandırılan kanalları gösterir.'),
  new SlashCommandBuilder()
    .setName('tuzak-test')
    .setDescription('Honeypot log kanalına test mesajı göndererek sistemi kontrol eder.')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('[BİLGİ] Slash komutları Discord API\'sine kaydediliyor...');

    // Global olarak komutları kaydet
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    console.log('\x1b[32m[BAŞARILI] Slash komutları başarıyla küresel (global) olarak kaydedildi!\x1b[0m');
  } catch (error) {
    console.error('[HATA] Komutlar kaydedilirken bir hata oluştu:', error);
  }
})();
