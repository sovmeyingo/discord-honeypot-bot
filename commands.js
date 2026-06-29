import { 
  PermissionFlagsBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType
} from 'discord.js';
import { isModerator, addInfraction, getInfractions } from './moderation.js';
import { getUserStats, getTopMessages, getTopVoice, formatDuration } from './stats.js';
import { createBackup, loadBackup, listBackups } from './backup.js';

/**
 * Slash komutlarının işlenmesi
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 */
export async function handleInteraction(interaction) {
  const { commandName, guild, member, options, user } = interaction;

  // --- KAMU (HERKESE AÇIK) KOMUTLAR ---

  // 1. Profil Komutu
  if (commandName === 'profil') {
    const targetUser = options.getUser('kullanici') || user;
    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    
    const stats = getUserStats(targetUser.id);
    const infractions = getInfractions(targetUser.id);
    const formattedVoice = formatDuration(stats.voiceTime);
    
    const embed = new EmbedBuilder()
      .setColor('#9b59b6') // Premium Mor
      .setTitle(`📊 Kullanıcı Profili: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Hesap Bilgileri', value: `**ID:** \`${targetUser.id}\`\n**Oluşturulma:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: false },
        { name: '📥 Sunucuya Katılım', value: targetMember ? `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>` : 'Bilinmiyor', inline: true },
        { name: '🛡️ Ceza Sicili', value: `\`${infractions.length}\` adet ceza kaydı`, inline: true },
        { name: '✉️ Mesaj Aktifliği', value: `\`${stats.messages || 0}\` mesaj`, inline: true },
        { name: '🔊 Ses Aktifliği', value: `\`${formattedVoice}\``, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: guild.name, iconURL: guild.iconURL() });

    if (targetMember && targetMember.roles.cache.size > 1) {
      const rolesList = targetMember.roles.cache
        .filter(role => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map(role => `${role}`)
        .slice(0, 8)
        .join(', ');
      embed.addFields({ name: '🎭 Roller', value: rolesList || 'Rol yok', inline: false });
    }

    return interaction.reply({ embeds: [embed] });
  }

  // 2. Top Mesaj Liderlik Tablosu
  if (commandName === 'top-mesaj') {
    const top = getTopMessages(10);
    if (top.length === 0) {
      return interaction.reply({ content: '📭 Henüz kaydedilmiş aktiflik verisi yok.', ephemeral: true });
    }

    const leaderboard = top.map((entry, index) => {
      const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
      return `${emoji} <@${entry.userId}> — **${entry.messages}** mesaj`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#e67e22') // Turuncu
      .setTitle('✉️ Sunucu Mesaj Aktiflik Liderleri')
      .setDescription(leaderboard)
      .setTimestamp()
      .setFooter({ text: `${guild.name} Aktiflik İstatistikleri`, iconURL: guild.iconURL() });

    return interaction.reply({ embeds: [embed] });
  }

  // 3. Top Ses Liderlik Tablosu
  if (commandName === 'top-ses') {
    const top = getTopVoice(10);
    if (top.length === 0) {
      return interaction.reply({ content: '📭 Henüz kaydedilmiş aktiflik verisi yok.', ephemeral: true });
    }

    const leaderboard = top.map((entry, index) => {
      const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
      return `${emoji} <@${entry.userId}> — **${formatDuration(entry.voiceTime)}**`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#2ecc71') // Yeşil
      .setTitle('🔊 Sunucu Ses Aktiflik Liderleri')
      .setDescription(leaderboard)
      .setTimestamp()
      .setFooter({ text: `${guild.name} Aktiflik İstatistikleri`, iconURL: guild.iconURL() });

    return interaction.reply({ embeds: [embed] });
  }

  // --- YETKİLİ / MODERASYON KOMUTLARI ---

  // Tüm bu komutlar için yetkili kontrolü yapılır
  if (!isModerator(member)) {
    return interaction.reply({
      content: '❌ Bu komutu kullanmak için yetkili rollerden birine veya **Yönetici** iznine sahip olmalısınız!',
      ephemeral: true
    });
  }

  // 4. Temizle Komutu
  if (commandName === 'temizle') {
    const amount = options.getInteger('sayi');
    
    if (amount < 1 || amount > 200) {
      return interaction.reply({ content: '❌ Lütfen 1 ile 200 arasında bir sayı girin.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      let deletedCount = 0;
      let remaining = amount;

      while (remaining > 0) {
        const deleteBatch = Math.min(remaining, 100);
        const deleted = await interaction.channel.bulkDelete(deleteBatch, true);
        deletedCount += deleted.size;
        remaining -= deleteBatch;
        
        // bulkDelete 14 günden eski mesajları silemez, eğer hiç mesaj silinemediyse döngüyü kır
        if (deleted.size === 0) break;
      }

      return interaction.editReply({
        content: `🧹 Başarıyla **${deletedCount}** adet mesaj temizlendi. (14 günden eski mesajlar otomatik olarak atlandı).`
      });
    } catch (err) {
      console.error('[TEMİZLE HATA]', err);
      return interaction.editReply({ content: '❌ Mesajlar silinirken bir hata oluştu.' });
    }
  }

  // 5. Uyarı Komutu
  if (commandName === 'uyar') {
    const targetUser = options.getUser('kullanici');
    const reason = options.getString('sebep') || 'Sebep belirtilmedi.';

    if (targetUser.bot) {
      return interaction.reply({ content: '❌ Botları uyaramazsınız!', ephemeral: true });
    }

    const inf = addInfraction(targetUser.id, 'UYARI', reason, user.id);

    const embed = new EmbedBuilder()
      .setColor('#f1c40f') // Sarı
      .setTitle('⚠️ Kullanıcı Uyarıldı')
      .addFields(
        { name: 'Kullanıcı', value: `${targetUser} (${targetUser.tag})`, inline: true },
        { name: 'Yetkili', value: `${user}`, inline: true },
        { name: 'Ceza ID', value: `\`${inf.id}\``, inline: true },
        { name: 'Sebep', value: reason, inline: false }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // 6. Timeout Komutu
  if (commandName === 'timeout') {
    const targetUser = options.getUser('kullanici');
    const minutes = options.getInteger('sure');
    const reason = options.getString('sebep') || 'Sebep belirtilmedi.';

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: '❌ Kullanıcı bu sunucuda bulunamadı!', ephemeral: true });
    }

    if (!targetMember.moderatable) {
      return interaction.reply({ content: '❌ Bu kullanıcıya ceza uygulamak için yetkim yetersiz.', ephemeral: true });
    }

    try {
      await targetMember.timeout(minutes * 60 * 1000, `${reason} (Yetkili: ${user.tag})`);
      const inf = addInfraction(targetUser.id, 'TIMEOUT', `${minutes} dakika - ${reason}`, user.id);

      const embed = new EmbedBuilder()
        .setColor('#e67e22') // Turuncu
        .setTitle('🔇 Kullanıcı Susturuldu (Timeout)')
        .addFields(
          { name: 'Kullanıcı', value: `${targetUser} (${targetUser.tag})`, inline: true },
          { name: 'Süre', value: `${minutes} dakika`, inline: true },
          { name: 'Ceza ID', value: `\`${inf.id}\``, inline: true },
          { name: 'Sebep', value: reason, inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Timeout uygulanırken bir hata oluştu.', ephemeral: true });
    }
  }

  // 7. Ban Komutu
  if (commandName === 'ban') {
    const targetUser = options.getUser('kullanici');
    const reason = options.getString('sebep') || 'Sebep belirtilmedi.';
    const deleteDays = options.getInteger('mesaj_temizleme_gun') || 0;

    const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
    if (targetMember && !targetMember.bannable) {
      return interaction.reply({ content: '❌ Bu kullanıcıyı banlamak için yetkim yetersiz.', ephemeral: true });
    }

    try {
      await guild.members.ban(targetUser.id, {
        reason: `${reason} (Yetkili: ${user.tag})`,
        deleteMessageSeconds: deleteDays * 24 * 60 * 60
      });

      const inf = addInfraction(targetUser.id, 'BAN', reason, user.id);

      const embed = new EmbedBuilder()
        .setColor('#c0392b') // Koyu Kırmızı
        .setTitle('🔨 Kullanıcı Yasaklandı (Ban)')
        .addFields(
          { name: 'Yasaklanan', value: `${targetUser} (${targetUser.tag})`, inline: true },
          { name: 'Yetkili', value: `${user}`, inline: true },
          { name: 'Ceza ID', value: `\`${inf.id}\``, inline: true },
          { name: 'Sebep', value: reason, inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Yasaklama işlemi gerçekleştirilirken bir hata oluştu.', ephemeral: true });
    }
  }

  // 8. Sicil Komutu
  if (commandName === 'sicil') {
    const targetUser = options.getUser('kullanici');
    const infractions = getInfractions(targetUser.id);

    if (infractions.length === 0) {
      return interaction.reply({ content: `✅ ${targetUser} kullanıcısının sicil kaydı tamamen temizdir.` });
    }

    const list = infractions.map(inf => {
      const date = new Date(inf.timestamp).toLocaleDateString('tr-TR');
      return `\`${inf.id}\` **[${inf.type}]** - ${inf.reason} *(Yetkili: <@${inf.moderator}>, Tarih: ${date})*`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#7f8c8d')
      .setTitle(`📋 Sicil Raporu: ${targetUser.username}`)
      .setDescription(list)
      .setTimestamp()
      .setFooter({ text: `Toplam ${infractions.length} kayıt bulundu.` });

    return interaction.reply({ embeds: [embed] });
  }

  // 9. Sunucu Durum Komutu (Honeypot)
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

  // 10. Test Komutu
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

  // 11. Doğrulama Kur Komutu
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

      await interaction.channel.send({ embeds: [embed], components: [row] });
      
      return interaction.reply({
        content: '✅ Doğrulama (Captcha) paneli bu kanala başarıyla kuruldu!',
        ephemeral: true
      });
    } catch (error) {
      console.error('[HATA] Panel kurulamadı:', error);
      return interaction.reply({
        content: `❌ Panel kurulurken hata oluştu: ${error.message}`,
        ephemeral: true
      });
    }
  }

  // 12. Yedek Al Komutu
  if (commandName === 'yedek-al') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const backupId = await createBackup(guild);
      return interaction.editReply({
        content: `✅ Sunucu yedeği başarıyla alındı!\n🔑 **Yedek ID'si:** \`${backupId}\`\n\n*Not: Bu yedek ID'sini kullanarak dilediğiniz an sunucuyu bu ayarlara geri yükleyebilirsiniz.*`
      });
    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: '❌ Yedek alınırken bir hata oluştu.' });
    }
  }

  // 13. Yedek Yükle Komutu (Güvenli Onaylı)
  if (commandName === 'yedek-yukle') {
    const backupId = options.getString('yedek_id');

    // Onay butonu oluştur
    const confirmBtn = new ButtonBuilder()
      .setCustomId('confirm_backup_load')
      .setLabel('Onayla (Sil ve Yükle)')
      .setStyle(ButtonStyle.Danger);

    const cancelBtn = new ButtonBuilder()
      .setCustomId('cancel_backup_load')
      .setLabel('İptal Et')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

    const warningEmbed = new EmbedBuilder()
      .setColor('#d35400')
      .setTitle('⚠️ DİKKAT: YIKICI İŞLEM ONAYI')
      .setDescription(`Sunucu yedeği (\`${backupId}\`) yüklenmek üzere.\n\n**UYARI:** Bu işlem sunucudaki **tüm mevcut kanalları, kategorileri ve rolleri silecek** ve yedek dosyasındakileri baştan kuracaktır. Bu işlem geri alınamaz!\n\nOnaylıyor musunuz?`);

    const response = await interaction.reply({
      embeds: [warningEmbed],
      components: [row],
      ephemeral: true
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000 // 1 dakika bekler
    });

    collector.on('collect', async btnInteraction => {
      if (btnInteraction.customId === 'confirm_backup_load') {
        await btnInteraction.deferUpdate();
        await btnInteraction.editReply({ content: '🔄 Yedek yükleme işlemi başlatıldı. Bu işlem sunucu büyüklüğüne göre 1-2 dakika sürebilir...', embeds: [], components: [] });
        
        try {
          await loadBackup(guild, backupId);
          await btnInteraction.followUp({ content: '✅ Sunucu yedeği başarıyla geri yüklendi!', ephemeral: true }).catch(() => null);
        } catch (err) {
          console.error(err);
          await btnInteraction.followUp({ content: `❌ Yedek yüklenirken hata oluştu: ${err.message}`, ephemeral: true }).catch(() => null);
        }
      } else {
        await btnInteraction.update({ content: '❌ Yedek yükleme işlemi iptal edildi.', embeds: [], components: [] });
      }
      collector.stop();
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        interaction.editReply({ content: '⏱️ İşlem zaman aşımına uğradı, yedek yükleme iptal edildi.', embeds: [], components: [] }).catch(() => null);
      }
    });
  }
}
