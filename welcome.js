/**
 * Yeni üye katıldığında otomatik rol ve hoş geldin mesajı lojiği
 * @param {import('discord.js').GuildMember} member 
 */
export async function handleMemberJoin(member) {
  const welcomeRoleId = process.env.WELCOME_ROLE_ID;
  const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;

  // 1. Yeni gelen üyeye otomatik rol tanımlama
  if (welcomeRoleId && welcomeRoleId !== 'YOUR_WELCOME_ROLE_ID_HERE') {
    try {
      await member.roles.add(welcomeRoleId);
      console.log(`[ROL] ${member.user.tag} kullanıcısına otomatik rol verildi.`);
    } catch (error) {
      console.error(`[HATA] Otomatik rol (${welcomeRoleId}) verilirken hata oluştu:`, error);
      console.error(`Not: Botun rolünün sunucu ayarlarında verilecek rolden daha üstte olduğundan emin olun.`);
    }
  }

  // 2. Belirtilen kanala hoş geldin mesajı gönderme
  if (welcomeChannelId && welcomeChannelId !== 'YOUR_WELCOME_CHANNEL_ID_HERE') {
    try {
      const channel = await member.guild.channels.fetch(welcomeChannelId);
      if (channel && channel.isTextBased()) {
        const memberCount = member.guild.memberCount;
        const guildName = member.guild.name;

        // Görseldeki şablonun birebir aynısı:
        // ✨ **Hoş Geldin** @Kvaratshelia! **1920x1080** topluluğumuza hoş geldin! Sunucumuzun 40. üyesi oldun! 🎉
        const messageText = `✨ **Hoş Geldin** ${member}! **${guildName}** topluluğumuza hoş geldin! Sunucumuzun ${memberCount}. üyesi oldun! 🎉`;

        await channel.send(messageText);
        console.log(`[MESAJ] ${member.user.tag} için hoş geldin mesajı başarıyla gönderildi.`);
      }
    } catch (error) {
      console.error(`[HATA] Hoş geldin mesajı gönderilirken hata oluştu:`, error);
    }
  }
}
