import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';

/**
 * Honeypot kanalı mesaj denetleyicisi
 * @param {import('discord.js').Message} message 
 */
export async function handleHoneypotMessage(message) {
  // Mesajın geldiği kanalın ID'sini al
  const honeypotChannelId = process.env.HONEYPOT_CHANNEL_ID;
  const logChannelId = process.env.LOG_CHANNEL_ID;

  // Honeypot kanalı yapılandırılmamışsa veya mesaj bu kanalda değilse işlem yapma
  if (!honeypotChannelId || message.channel.id !== honeypotChannelId) {
    return;
  }

  // Kendi mesajlarımızı veya diğer bot komutlarını es geç (Botun kendisi banlanmamalı!)
  if (message.author.id === message.client.user.id) {
    return;
  }

  // Yöneticileri veya moderatörleri koruma (Yanlışlıkla yazarlarsa banlanmasınlar)
  if (message.member && message.member.permissions.has(PermissionFlagsBits.Administrator)) {
    console.log(`[BİLGİ] Yönetici/Moderatör (${message.author.tag}) honeypot kanalına yazdı. İşlem yapılmadı.`);
    return;
  }

  const { author, guild, member, content } = message;

  console.log(`[TUZAK] ${author.tag} (${author.id}) honeypot kanalına yazdı. Softban işlemi başlatılıyor...`);

  // Log bilgileri için veriler (Discord'un zengin zaman damgaları biçimi)
  const accountCreatedAt = `<t:${Math.floor(author.createdTimestamp / 1000)}:R>`;
  const joinedAt = member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Bilinmiyor';

  let actionStatus = 'Başarılı';
  let errorMsg = '';

  try {
    // 1. Kullanıcıyı banla (Son 7 gündeki tüm mesajlarını temizlemek için deleteMessageSeconds kullanılır)
    await guild.members.ban(author.id, {
      reason: 'Honeypot Tuzağı: Yasaklı kanala mesaj gönderildi.',
      deleteMessageSeconds: 7 * 24 * 60 * 60 // 7 gün
    });

    // 2. Banı hemen kaldır (Softban mantığı: banla + unbanla)
    await guild.members.unban(author.id, 'Honeypot Tuzağı: Softban temizliği sonrası ban kaldırma.');

  } catch (error) {
    console.error(`[HATA] Softban uygulanırken hata oluştu:`, error);
    actionStatus = 'Hata Oluştu';
    errorMsg = error.message;

    // Ban yetkisi yoksa veya başka hata varsa mesajı en azından silmeyi deneyelim
    try {
      if (message.deletable) await message.delete();
    } catch (delError) {
      console.error('[HATA] Mesaj silinemedi:', delError);
    }
  }

  // 3. Log kanalına bildirim gönder
  if (logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(logChannelId);
      if (logChannel && logChannel.isTextBased()) {
        
        // Zengin içerikli embed oluşturma
        const embed = new EmbedBuilder()
          .setTitle('🍯 Honeypot Tuzağı Tetiklendi!')
          .setDescription(`Bir hesap yasaklı kanala mesaj gönderdiği için otomatik olarak sunucudan uzaklaştırıldı (**Softban**).`)
          .setColor(actionStatus === 'Başarılı' ? 0xffa500 : 0xff0000) // Turuncu veya Kırmızı
          .setThumbnail(author.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Kullanıcı', value: `${author.tag} (${author})`, inline: true },
            { name: 'Kullanıcı ID', value: `\`${author.id}\``, inline: true },
            { name: 'İşlem Durumu', value: actionStatus === 'Başarılı' ? '✅ Softban Başarılı (Mesajlar Temizlendi & Sunucudan Atıldı)' : `❌ Hata: ${errorMsg}`, inline: false },
            { name: 'Hesap Oluşturulma Tarihi', value: accountCreatedAt, inline: true },
            { name: 'Sunucuya Katılım Tarihi', value: joinedAt, inline: true },
            { name: 'Gönderilen Mesaj İçeriği', value: content ? `\`\`\`${content.slice(0, 1000)}\`\`\`` : '*Mesaj içeriği boş veya alınamadı*', inline: false }
          )
          .setTimestamp()
          .setFooter({ text: 'Honeypot Security System', iconURL: message.client.user.displayAvatarURL() });

        await logChannel.send({ embeds: [embed] });
      }
    } catch (logError) {
      console.error('[HATA] Mod-log kanalına bilgi gönderilemedi:', logError);
    }
  }
}
