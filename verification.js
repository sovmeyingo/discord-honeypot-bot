import { EmbedBuilder } from 'discord.js';

const UNVERIFIED_ROLE_ID = process.env.UNVERIFIED_ROLE_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID;

/**
 * Butonla doğrulama etkileşiminin işlenmesi
 * @param {import('discord.js').ButtonInteraction} interaction 
 */
export async function handleVerificationInteraction(interaction) {
  if (!interaction.isButton()) return;
  if (interaction.customId !== 'verify_user') return;

  const { member, guild, user } = interaction;

  // Zaten doğrulanmışsa bildir
  if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
    return interaction.reply({
      content: 'ℹ️ Zaten doğrulanmış durumdasınız!',
      ephemeral: true
    });
  }

  try {
    // 1. Rolleri güncelle
    // Önce doğrulanmamış rolü sil, sonra doğrulanmış rolü ver
    await member.roles.remove(UNVERIFIED_ROLE_ID).catch(e => console.error('Unverified rolü silinemedi:', e));
    await member.roles.add(VERIFIED_ROLE_ID);

    // Doğrulama kanalındaki kullanıcıya özel izinleri kaldır
    const verificationChannel = await guild.channels.fetch(VERIFICATION_CHANNEL_ID).catch(() => null);
    if (verificationChannel) {
      await verificationChannel.permissionOverwrites.delete(member.id).catch(() => null);
    }

    // 2. Kullanıcıya başarı mesajı dön (sadece kendisinin göreceği şekilde)
    await interaction.reply({
      content: '✅ Doğrulama başarılı! Sunucuya hoş geldiniz.',
      ephemeral: true
    });

    console.log(`[DOĞRULAMA] ${user.tag} başarıyla doğrulandı.`);

    // 3. Hoş geldin kanalına mesaj gönder
    if (WELCOME_CHANNEL_ID) {
      const channel = await guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
      if (channel && channel.isTextBased()) {
        const memberCount = guild.memberCount;
        const guildName = guild.name;

        // Birebir istenen mesaj şablonu:
        // ✨ **Hoş Geldin** @Kvaratshelia! **1920x1080** topluluğumuza hoş geldin! Sunucumuzun 40. üyesi oldun! 🎉
        const messageText = `✨ **Hoş Geldin** ${member}! **${guildName}** topluluğumuza hoş geldin! Sunucumuzun ${memberCount}. üyesi oldun! 🎉`;

        await channel.send(messageText);
      }
    }
  } catch (error) {
    console.error('[HATA] Doğrulama işlemi gerçekleştirilemedi:', error);
    await interaction.reply({
      content: '❌ Doğrulama işlemi sırasında yetki hatası oluştu. Lütfen botun rolünün üst sıralarda olduğundan emin olun.',
      ephemeral: true
    });
  }
}

/**
 * Doğrulama yapmamış kullanıcılara 4 saatte bir hatırlatıcı mesaj gönderir
 * Mesaj 10 saniye sonra otomatik olarak silinir.
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
          
          // Sunucudaki üyelerin güncel rollerini fetch et (cache'i güncelle)
          await guild.members.fetch().catch(() => {});
          const membersWithRole = role.members;

          // Eğer bu role sahip üye varsa hatırlatıcı mesaj at
          if (membersWithRole.size > 0) {
            console.log(`[HATIRLATICI] Sunucuda doğrulanmamış ${membersWithRole.size} üye tespit edildi. Etiketleniyor.`);
            
            // Doğrulanmamış rolü etiketle
            const reminderMsg = await channel.send(`⚠️ <@&${UNVERIFIED_ROLE_ID}> Sunucuya tam erişim sağlamak ve kanalları görmek için lütfen yukarıdaki yeşil **"Doğrula"** butonuna basarak hesabınızı doğrulayın.`);
            
            // 10 saniye sonra mesajı sil
            setTimeout(async () => {
              try {
                await reminderMsg.delete().catch(() => null);
              } catch (delErr) {
                // Mesaj zaten silinmişse veya silinemiyorsa sessiz kal
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
