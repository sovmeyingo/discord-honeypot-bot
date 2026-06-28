import { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * Slash komutlarının işlenmesi
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 */
export async function handleInteraction(interaction) {
  const { commandName, guild, member } = interaction;

  // Sadece yöneticiler bu komutları kullanabilir
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ Bu komutu kullanmak için **Yönetici** yetkisine sahip olmalısınız!',
      ephemeral: true
    });
  }

  // Durum komutu
  if (commandName === 'tuzak-durum') {
    const honeypotChanId = process.env.HONEYPOT_CHANNEL_ID;
    const logChanId = process.env.LOG_CHANNEL_ID;

    let honeypotChanName = 'Ayarlanmamış ❌';
    let logChanName = 'Ayarlanmamış ❌';

    try {
      if (honeypotChanId && honeypotChanId !== 'YOUR_HONEYPOT_CHANNEL_ID_HERE') {
        const ch = await guild.channels.fetch(honeypotChanId);
        if (ch) honeypotChanName = `\`#${ch.name}\` (ID: ${ch.id}) ✅`;
      }
    } catch {
      honeypotChanName = `Erişilemiyor veya ID Geçersiz (ID: ${honeypotChanId}) ⚠️`;
    }

    try {
      if (logChanId && logChanId !== 'YOUR_LOG_CHANNEL_ID_HERE') {
        const ch = await guild.channels.fetch(logChanId);
        if (ch) logChanName = `\`#${ch.name}\` (ID: ${ch.id}) ✅`;
      }
    } catch {
      logChanName = `Erişilemiyor veya ID Geçersiz (ID: ${logChanId}) ⚠️`;
    }

    const embed = new EmbedBuilder()
      .setTitle('🍯 Honeypot Güvenlik Sistemi Durumu')
      .setColor(0xffa500)
      .addFields(
        { name: 'Tuzak Kanalı (Honeypot)', value: honeypotChanName, inline: false },
        { name: 'Mod Günlük Kanalı (Log)', value: logChanName, inline: false },
        { name: 'İzin Denetimi', value: 'Botun çalışması için bu kanallarda `Mesaj Okuma/Yazma`, `Üyeleri Yasakla` ve `Mesajları Yönet` yetkilerinin bota tanımlandığından emin olun.' }
      )
      .setTimestamp()
      .setFooter({ text: 'Honeypot Security System' });

    return interaction.reply({ embeds: [embed] });
  }

  // Test komutu
  if (commandName === 'tuzak-test') {
    const logChanId = process.env.LOG_CHANNEL_ID;
    if (!logChanId || logChanId === 'YOUR_LOG_CHANNEL_ID_HERE') {
      return interaction.reply({
        content: '❌ .env dosyasında `LOG_CHANNEL_ID` tanımlanmamış veya hatalı!',
        ephemeral: true
      });
    }

    try {
      const logChannel = await guild.channels.fetch(logChanId);
      if (logChannel && logChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle('🍯 Honeypot Test Bildirimi')
          .setDescription('Bu bir test bildirimidir. Honeypot log mekanizması aktif ve sorunsuz çalışıyor.')
          .setColor(0x3498db)
          .setTimestamp();

        await logChannel.send({ embeds: [embed] });
        return interaction.reply({ content: '✅ Test bildirimi mod log kanalına başarıyla gönderildi!', ephemeral: true });
      } else {
        return interaction.reply({ content: '❌ Belirtilen log kanalı bulunamadı veya yazı yazılamaz durumda.', ephemeral: true });
      }
    } catch (error) {
      return interaction.reply({ content: `❌ Test bildirimi gönderilirken hata oluştu: ${error.message}`, ephemeral: true });
    }
  }

  // Doğrulama kurma komutu
  if (commandName === 'dogrulama-kur') {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🍯 Sunucu Doğrulaması')
        .setDescription('Sunucumuza hoş geldiniz! Kanalları görebilmek ve aktif üye olabilmek için lütfen aşağıdaki yeşil **"Doğrula"** butonuna tıklayarak hesabınızı onaylayın.')
        .setColor(0x00ff00)
        .setThumbnail(guild.iconURL({ dynamic: true }))
        .setFooter({ text: 'Honeypot Security System', iconURL: interaction.client.user.displayAvatarURL() });

      const button = new ButtonBuilder()
        .setCustomId('verify_user')
        .setLabel('🟢 Doğrula')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(button);

      // Etkileşim yapılan kanala gönder
      await interaction.channel.send({ embeds: [embed], components: [row] });
      
      return interaction.reply({
        content: '✅ Doğrulama (Captcha) paneli bu kanala başarıyla kuruldu!',
        ephemeral: true
      });
    } catch (error) {
      console.error('[HATA] Doğrulama paneli kurulamadı:', error);
      return interaction.reply({
        content: `❌ Panel kurulurken hata oluştu: ${error.message}`,
        ephemeral: true
      });
    }
  }
}
