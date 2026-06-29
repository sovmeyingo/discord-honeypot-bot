import fs from 'fs';
import path from 'path';

const statsFilePath = path.resolve('stats.json');

// Aktif ses oturumları: Map<userId, joinTimestamp>
const activeVoiceSessions = new Map();

// İstatistik verilerini yükle
function loadStats() {
  try {
    if (fs.existsSync(statsFilePath)) {
      const data = fs.readFileSync(statsFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[STATS] İstatistik verisi yüklenirken hata:', err);
  }
  return {};
}

// İstatistik verilerini kaydet
function saveStats(stats) {
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2), 'utf-8');
  } catch (err) {
    console.error('[STATS] İstatistik verisi kaydedilirken hata:', err);
  }
}

/**
 * Kullanıcının mesaj sayısını artırır
 * @param {string} userId 
 */
export function trackMessage(userId) {
  const stats = loadStats();
  if (!stats[userId]) {
    stats[userId] = { messages: 0, voiceTime: 0 };
  }
  stats[userId].messages = (stats[userId].messages || 0) + 1;
  saveStats(stats);
}

/**
 * Ses durumunu takip eder ve ses aktiflik süresini hesaplar
 * @param {import('discord.js').VoiceState} oldState 
 * @param {import('discord.js').VoiceState} newState 
 */
export function trackVoiceState(oldState, newState) {
  const userId = oldState.id;
  const now = Date.now();

  // 1. Durum: Ses kanalına giriş yaptı (Eski kanal yok, yeni kanal var)
  if (!oldState.channelId && newState.channelId) {
    activeVoiceSessions.set(userId, now);
  }
  
  // 2. Durum: Ses kanalından çıkış yaptı (Eski kanal var, yeni kanal yok)
  else if (oldState.channelId && !newState.channelId) {
    const joinTime = activeVoiceSessions.get(userId);
    if (joinTime) {
      const duration = now - joinTime;
      activeVoiceSessions.delete(userId);
      
      const stats = loadStats();
      if (!stats[userId]) {
        stats[userId] = { messages: 0, voiceTime: 0 };
      }
      stats[userId].voiceTime = (stats[userId].voiceTime || 0) + duration;
      saveStats(stats);
    }
  }
  
  // 3. Durum: Kanal değiştirdi (Eski kanal var, yeni kanal da var ama farklı)
  else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
    const joinTime = activeVoiceSessions.get(userId);
    if (joinTime) {
      const duration = now - joinTime;
      // Oturumu sıfırla ve yeni kanala geçiş süresini başlat
      activeVoiceSessions.set(userId, now);
      
      const stats = loadStats();
      if (!stats[userId]) {
        stats[userId] = { messages: 0, voiceTime: 0 };
      }
      stats[userId].voiceTime = (stats[userId].voiceTime || 0) + duration;
      saveStats(stats);
    } else {
      activeVoiceSessions.set(userId, now);
    }
  }
}

/**
 * Belirli bir kullanıcının mesaj ve ses istatistiklerini getirir
 * @param {string} userId 
 */
export function getUserStats(userId) {
  const stats = loadStats();
  return stats[userId] || { messages: 0, voiceTime: 0 };
}

/**
 * Milisaniye cinsinden süreyi saat/dakika formatına çevirir
 * @param {number} ms 
 */
export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours} saat, ${minutes} dk`;
  }
  return `${minutes} dakika`;
}

/**
 * En çok mesaj atan ilk N kullanıcıyı getirir
 * @param {number} limit 
 */
export function getTopMessages(limit = 10) {
  const stats = loadStats();
  return Object.entries(stats)
    .map(([userId, val]) => ({ userId, messages: val.messages || 0 }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, limit);
}

/**
 * En çok seste kalan ilk N kullanıcıyı getirir
 * @param {number} limit 
 */
export function getTopVoice(limit = 10) {
  const stats = loadStats();
  return Object.entries(stats)
    .map(([userId, val]) => ({ userId, voiceTime: val.voiceTime || 0 }))
    .sort((a, b) => b.voiceTime - a.voiceTime)
    .slice(0, limit);
}
