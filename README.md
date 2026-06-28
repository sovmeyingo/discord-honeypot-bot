# Discord Honeypot (Tuzak) Güvenlik Botu

Bu bot, sunucunuza sızan spam botlarını, reklam botlarını ve hesabı ele geçirilmiş kullanıcıları (selfbot) otomatik olarak tespit edip sunucudan **Softban** (yasaklayıp hemen yasak kaldırma) ile uzaklaştırır ve attıkları tüm mesajları temizler.

Ayrıca yöneticiler için durum sorgulama ve test komutları sunar.

---

## 🛠️ Kurulum Adımları

### 1. Discord Developer Portal Üzerinde Botu Oluşturma
Eğer henüz hazırda bir botunuz yoksa:
1. [Discord Developer Portal](https://discord.com/developers/applications) adresine gidin.
2. Sağ üstten **New Application** butonuna tıklayın ve botunuza bir isim verin.
3. Soldaki menüden **Bot** sekmesine gelin.
4. **Token** bölümündeki **Reset Token** butonuna tıklayarak botunuzun token'ını kopyalayın (Bu sizin `DISCORD_TOKEN` anahtarınızdır).
5. **Privileged Gateway Intents** bölümüne inin ve şu üç seçeneği de aktifleştirin:
   - **Presence Intent**
   - **Server Members Intent** (Üyeleri banlayıp unbanlayabilmesi için zorunludur)
   - **Message Content Intent** (Tuzak kanalına yazılan mesajı okuyabilmesi için zorunludur)
6. Değişiklikleri kaydedin (**Save Changes**).
7. Genel Bilgiler (**General Information**) sekmesine gelin ve oradaki **Application ID** değerini kopyalayın (Bu sizin `CLIENT_ID` değerinizdir).

---

### 2. Proje Yapılandırması
1. Proje klasöründeki `.env` dosyasını açın.
2. Kopyaladığınız değerleri ve Discord kanallarınızın ID'lerini girin:
   ```env
   DISCORD_TOKEN=kopyaladiginiz_bot_tokeni
   CLIENT_ID=kopyaladiginiz_application_id
   HONEYPOT_CHANNEL_ID=tuzak_kanalinin_id_degeri
   LOG_CHANNEL_ID=mod_log_kanalinin_id_degeri
   ```

> 💡 **Kanal ID'lerini Nasıl Alırsınız?**
> Discord ayarlarınızdan **Gelişmiş** sekmesine girip **Geliştirici Modu**'nu aktifleştirin. Ardından tuzak kanalı ve log kanalına sağ tıklayıp **Kanal Kimliğini Kopyala** diyerek ID'leri alabilirsiniz.

---

### 3. Botu Sunucuya Davet Etme
Botunuza ban atma ve mesaj yönetme yetkisi vermek için şu davet linkini kullanın:
1. Tarayıcınızda şu linki açın (`APPLICATION_ID` kısmına kendi Client ID'nizi yazın):
   `https://discord.com/oauth2/authorize?client_id=APPLICATION_ID&permissions=1099511627782&scope=bot%20applications.commands`
2. Botu sunucunuza ekleyin.
3. **Önemli:** Botun rolünü (sunucu ayarlarındaki roller kısmında) banlamak istediğiniz diğer normal rollerin **üzerine** taşıyın. Discord hiyerarşisi gereği botlar sadece kendilerinden daha düşük roldeki kişileri banlayabilir.

---

### 4. Komutları Kaydetme ve Çalıştırma

Terminalinizde proje klasöründeyken sırasıyla şu komutları çalıştırın:

1. **Slash Komutlarını Discord'a Tanıtma:**
   ```bash
   npm run register
   ```
   *(Bu işlem başarılı olduğunda "Slash komutları başarıyla küresel olarak kaydedildi!" uyarısını göreceksiniz.)*

2. **Botu Başlatma (Geliştirici Modu):**
   ```bash
   npm run dev
   ```
   *(Bot çalışmaya başladığında konsolda "[BAŞARILI] Bot başarıyla bağlandı!" mesajı görünecektir.)*

---

## 🤖 Kullanılabilir Slash Komutları (Sadece Yöneticiler)

* `/tuzak-durum`: Sistem durumunu, yapılandırılan kanalların adlarını ve botun erişim durumunu gösterir.
* `/tuzak-test`: Log kanalına test bildirimi göndererek botun loglama yeteneğini test eder.
