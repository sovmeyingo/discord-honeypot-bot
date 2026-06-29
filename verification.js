import { 
  EmbedBuilder, 
  AttachmentBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} from 'discord.js';
import { Jimp, loadFont } from 'jimp';
import { SANS_32_BLACK } from 'jimp/fonts';

const UNVERIFIED_ROLE_ID = process.env.UNVERIFIED_ROLE_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID;

// Kullanıcıların bekleyen captcha kodları: Map<userId, { code: string, timestamp: number }>
const pendingCaptchas = new Map();

// Karıştırıcı / Çizgi çizme yardımcısı (Bresenham)
function drawLine(image, x0, y0, x1, y1, color) {
  x0 = Math.floor(x0); y0 = Math.floor(y0);
  x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = (x0 < x1) ? 1 : -1;
  const sy = (y0 < y1) ? 1 : -1;
  let err = dx - dy;
  
  while (true) {
    if (x0 >= 0 && x0 < image.bitmap.width && y0 >= 0 && y0 < image.bitmap.height) {
      image.setPixelColor(color, x0, y0);
    }
    if ((x0 === x1) && (y0 === y1)) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

// Görsel Captcha Oluşturucu (Jimp ile saf JS tabanlı)
async function generateCaptchaImage(text) {
  const width = 220;
  const height = 80;
  const image = new Jimp({ width, height, color: 0xF0F3F4FF }); // Açık gri arka plan
  
  // Jimp fontu yükle
  const font = await loadFont(SANS_32_BLACK);
  
  // Harfleri hafif dalgalı/rastgele bas
  let currentX = 20;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charY = 15 + Math.random() * 15;
    image.print({ font, x: currentX, y: charY, text: char });
    currentX += 32 + Math.random() * 8;
  }
  
  // Gürültü çizgileri çek
  for (let i = 0; i < 6; i++) {
    const startX = Math.random() * width;
    const startY = Math.random() * height;
    const endX = Math.random() * width;
    const endY = Math.random() * height;
    
    // Rastgele renk
    const r = Math.floor(Math.random() * 150);
    const g = Math.floor(Math.random() * 150);
    const b = Math.floor(Math.random() * 150);
    // RGBA hexadecimal rengi
    const color = (r << 24) + (g << 16) + (b << 8) + 255;
    
    drawLine(image, startX, startY, endX, endY, color);
  }
  
  // Rastgele pikseller (kumlanma)
  for (let i = 0; i < 300; i++) {
    const px = Math.random() * width;
    const py = Math.random() * height;
    
    const r = Math.floor(Math.random() * 255);
    const g = Math.floor(Math.random() * 255);
    const b = Math.floor(Math.random() * 255);
    const color = (r << 24) + (g << 16) + (b << 8) + 200;
    
    image.setPixelColor(color, px, py);
  }
  
  return await image.getBuffer('image/png');
}

// Kolay okunabilen karakterler (0, O, 1, I vb. elendi)
function generateRandomCode(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Butonla doğrulama etkileşiminin işlenmesi
 * @param {import('discord.js').Interaction} interaction 
 */
export async function handleVerificationInteraction(interaction) {
  const { member, guild, user } = interaction;

  // Zaten doğrulanmışsa bildir
  if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
    const replyContent = { content: 'ℹ️ Zaten doğrulanmış durumdasınız!', ephemeral: true };
    if (interaction.isButton()) {
      return interaction.reply(replyContent);
    } else if (interaction.isModalSubmit()) {
      return interaction.reply(replyContent);
    }
    return;
  }

  // 1. Durum: İlk "Doğrula" butonuna tıklama (verify_user)
  if (interaction.isButton() && interaction.customId === 'verify_user') {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const code = generateRandomCode(5);
      pendingCaptchas.set(user.id, { code, timestamp: Date.now() });

      const imageBuffer = await generateCaptchaImage(code);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'captcha.png' });

      const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🔒 Görsel Doğrulama (CAPTCHA)')
        .setDescription('Aşağıdaki resimde gördüğünüz **5 haneli** doğrulama kodunu girmek için **"Kodu Gir"** butonuna basın.\n\n*Not: Harfler BÜYÜK olmalıdır. Karışıklığı önlemek için sıfır (0), bir (1) gibi karakterler kullanılmamıştır.*')
        .setImage('attachment://captcha.png');

      const enterButton = new ButtonBuilder()
        .setCustomId('enter_captcha')
        .setLabel('Kodu Gir')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(enterButton);

      await interaction.editReply({
        embeds: [embed],
        files: [attachment],
        components: [row]
      });

    } catch (error) {
      console.error('[CAPTCHA HATA] Captcha oluşturulamadı:', error);
      await interaction.followUp({
        content: '❌ Görsel doğrulama kodunu oluştururken bir sorun oluştu. Lütfen tekrar deneyin.',
        ephemeral: true
      });
    }
  }

  // 2. Durum: "Kodu Gir" butonuna tıklama (enter_captcha)
  else if (interaction.isButton() && interaction.customId === 'enter_captcha') {
    const pending = pendingCaptchas.get(user.id);
    if (!pending) {
      return interaction.reply({
        content: '⚠️ Süreniz dolmuş veya geçersiz bir işlem gerçekleştirdiniz. Lütfen yeşil "Doğrula" butonuna basarak yeni bir kod üretin.',
        ephemeral: true
      });
    }

    // Modalı göster
    const modal = new ModalBuilder()
      .setCustomId('captcha_modal')
      .setTitle('CAPTCHA Doğrulaması');

    const input = new TextInputBuilder()
      .setCustomId('captcha_input')
      .setLabel('Resimdeki 5 Haneli Kodu Yazın')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Örn: K9T4P')
      .setMinLength(5)
      .setMaxLength(5)
      .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // 3. Durum: Modalı gönderme (captcha_modal)
  else if (interaction.isModalSubmit() && interaction.customId === 'captcha_modal') {
    const pending = pendingCaptchas.get(user.id);
    if (!pending) {
      return interaction.reply({
        content: '⚠️ Süreniz dolmuş veya geçersiz bir doğrulama başlattınız. Lütfen tekrar deneyin.',
        ephemeral: true
      });
    }

    const userInput = interaction.fields.getTextInputValue('captcha_input').trim().toUpperCase();

    if (userInput !== pending.code) {
      return interaction.reply({
        content: '❌ Hatalı doğrulama kodu girdiniz! Lütfen ana doğrulama butonuna basarak yeni bir resim isteyin ve tekrar deneyin.',
        ephemeral: true
      });
    }

    // Kod doğru! Doğrulama işlemini tamamla
    try {
      await interaction.deferReply({ ephemeral: true });

      // Rolleri güncelle
      await member.roles.remove(UNVERIFIED_ROLE_ID).catch(e => console.error('Unverified rolü silinemedi:', e));
      await member.roles.add(VERIFIED_ROLE_ID);

      // Doğrulama kanalındaki kullanıcıya özel izinleri kaldır
      const verificationChannel = await guild.channels.fetch(VERIFICATION_CHANNEL_ID).catch(() => null);
      if (verificationChannel) {
        await verificationChannel.permissionOverwrites.delete(member.id).catch(() => null);
      }

      pendingCaptchas.delete(user.id);

      await interaction.editReply({
        content: '✅ Doğrulama başarılı! Sunucuya başarıyla katıldınız. Keyifli sohbetler!',
      });

      console.log(`[DOĞRULAMA] ${user.tag} captcha'yı doğru tamamlayarak sunucuya giriş yaptı.`);

      // Hoş geldin kanalına mesaj gönder
      if (WELCOME_CHANNEL_ID) {
        const channel = await guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (channel && channel.isTextBased()) {
          const memberCount = guild.memberCount;
          const guildName = guild.name;
          const messageText = `✨ **Hoş Geldin** ${member}! **${guildName}** topluluğumuza hoş geldin! Sunucumuzun ${memberCount}. üyesi oldun! 🎉`;
          await channel.send(messageText);
        }
      }
    } catch (error) {
      console.error('[HATA] Doğrulama tamamlanırken hata oluştu:', error);
      await interaction.followUp({
        content: '❌ Doğrulama işlem sırasında bir yetki hatası oluştu. Lütfen bot yöneticisi ile iletişime geçin.',
        ephemeral: true
      });
    }
  }
}

/**
 * Doğrulama yapmamış kullanıcılara 4 saatte bir hatırlatıcı mesaj gönderir
 * @param {import('discord.js').Client} client 
 */
export function startVerificationReminder(client) {
  const reminderInterval = 4 * 60 * 60 * 1000; // 4 saat

  setInterval(async () => {
    try {
      console.log('[HAZIRLIK] Doğrulanmamış üyeler için hatırlatıcı kontrolü başlatılıyor...');
      
      for (const [guildId, guild] of client.guilds.cache) {
        const channel = await guild.channels.fetch(VERIFICATION_CHANNEL_ID).catch(() => null);
        if (channel && channel.isTextBased()) {
          const role = await guild.roles.fetch(UNVERIFIED_ROLE_ID).catch(() => null);
          if (!role) continue;
          
          await guild.members.fetch().catch(() => {});
          const membersWithRole = role.members;

          if (membersWithRole.size > 0) {
            console.log(`[HATIRLATICI] Sunucuda doğrulanmamış ${membersWithRole.size} üye tespit edildi. Etiketleniyor.`);
            const reminderMsg = await channel.send(`⚠️ <@&${UNVERIFIED_ROLE_ID}> Sunucuya tam erişim sağlamak ve kanalları görmek için lütfen yukarıdaki yeşil **"Doğrula"** butonuna basarak hesabınızı doğrulayın.`);
            
            setTimeout(async () => {
              try {
                await reminderMsg.delete().catch(() => null);
              } catch (delErr) {
                // Silinmişse yut
              }
            }, 10000);
          }
        }
      }
    } catch (error) {
      console.error('[HATA] Doğrulama hatırlatıcısı döngüsünde hata oluştu:', error);
    }
  }, reminderInterval);
}
