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
  // 1. Durum Komutu
  new SlashCommandBuilder()
    .setName('tuzak-durum')
    .setDescription('Honeypot sistem durumunu ve yapılandırılan kanalları gösterir.'),
    
  // 2. Test Komutu
  new SlashCommandBuilder()
    .setName('tuzak-test')
    .setDescription('Honeypot log kanalına test mesajı göndererek sistemi kontrol eder.'),
    
  // 3. Doğrulama Paneli Kur
  new SlashCommandBuilder()
    .setName('dogrulama-kur')
    .setDescription('Bulunduğunuz kanala butonlu doğrulama (Captcha) paneli kurar.'),

  // 4. Ban Komutu
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Belirtilen kullanıcıyı sunucudan yasaklar.')
    .addUserOption(option => 
      option.setName('kullanici')
        .setDescription('Yasaklanacak kullanıcıyı seçin')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('sebep')
        .setDescription('Yasaklama sebebini yazın')
        .setRequired(false))
    .addIntegerOption(option => 
      option.setName('mesaj_temizleme_gun')
        .setDescription('Geçmiş mesajların kaç günlük kısmı temizlensin?')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)),

  // 5. Timeout Komutu
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Belirtilen kullanıcıyı susturur (Timeout).')
    .addUserOption(option => 
      option.setName('kullanici')
        .setDescription('Susturulacak kullanıcıyı seçin')
        .setRequired(true))
    .addIntegerOption(option => 
      option.setName('sure')
        .setDescription('Susturma süresi (Dakika cinsinden)')
        .setMinValue(1)
        .setRequired(true))
    .addStringOption(option => 
      option.setName('sebep')
        .setDescription('Susturma sebebini yazın')
        .setRequired(false)),

  // 6. Uyar Komutu
  new SlashCommandBuilder()
    .setName('uyar')
    .setDescription('Belirtilen kullanıcıya uyarı cezası ekler.')
    .addUserOption(option => 
      option.setName('kullanici')
        .setDescription('Uyarılacak kullanıcıyı seçin')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('sebep')
        .setDescription('Uyarı sebebini yazın')
        .setRequired(true)),

  // 7. Sicil Raporu
  new SlashCommandBuilder()
    .setName('sicil')
    .setDescription('Kullanıcının geçmiş ceza sicilini listeler.')
    .addUserOption(option => 
      option.setName('kullanici')
        .setDescription('Sicili sorgulanacak kullanıcıyı seçin')
        .setRequired(true)),

  // 8. Temizle Komutu
  new SlashCommandBuilder()
    .setName('temizle')
    .setDescription('Belirtilen sayıda mesajı topluca temizler.')
    .addIntegerOption(option => 
      option.setName('sayi')
        .setDescription('Silinecek mesaj sayısı (1-200)')
        .setMinValue(1)
        .setMaxValue(200)
        .setRequired(true)),

  // 9. Profil İstatistik Komutu
  new SlashCommandBuilder()
    .setName('profil')
    .setDescription('Kullanıcının istatistiklerini ve profil kartını görüntüler.')
    .addUserOption(option => 
      option.setName('kullanici')
        .setDescription('Profili görüntülenecek kullanıcı')
        .setRequired(false)),

  // 10. Top Mesaj Liderlik Tablosu
  new SlashCommandBuilder()
    .setName('top-mesaj')
    .setDescription('En çok mesaj gönderen ilk 10 kullanıcıyı listeler.'),

  // 11. Top Ses Liderlik Tablosu
  new SlashCommandBuilder()
    .setName('top-ses')
    .setDescription('Ses kanallarında en çok vakit geçiren ilk 10 kullanıcıyı listeler.'),

  // 12. Yedek Al Komutu
  new SlashCommandBuilder()
    .setName('yedek-al')
    .setDescription('Sunucunun kanallarını ve rollerini yedekler.'),

  // 13. Yedek Yükle Komutu
  new SlashCommandBuilder()
    .setName('yedek-yukle')
    .setDescription('Daha önce alınmış bir sunucu yedeğini geri yükler (Mevcut kanalları siler!).')
    .addStringOption(option => 
      option.setName('yedek_id')
        .setDescription('Yüklenecek yedek ID\'si')
        .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('[BİLGİ] Yeni Slash komutları Discord API\'sine kaydediliyor...');

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    console.log('\x1b[32m[BAŞARILI] Tüm yeni Slash komutları başarıyla kaydedildi!\x1b[0m');
  } catch (error) {
    console.error('[HATA] Komutlar kaydedilirken bir hata oluştu:', error);
  }
})();
