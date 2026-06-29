import fs from 'fs';
import path from 'path';

const memoryFilePath = path.resolve('memory.json');

// Belleği yükle
function loadMemory() {
  try {
    if (fs.existsSync(memoryFilePath)) {
      const data = fs.readFileSync(memoryFilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[CHATBOT] Bellek dosyası yüklenemedi, yeni bellek oluşturuluyor:', err);
  }
  return {};
}

// Belleği kaydet
function saveMemory(memory) {
  try {
    fs.writeFileSync(memoryFilePath, JSON.stringify(memory, null, 2), 'utf-8');
  } catch (err) {
    console.error('[CHATBOT] Bellek dosyası kaydedilemedi:', err);
  }
}

// HTML karakterlerini temizle
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

// Web araması yap (DuckDuckGo HTML Scraper)
async function searchWeb(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) return [];
    
    const html = await response.text();
    const results = [];
    const resultBlockRegex = /<div class="result results_links results_links_deep web-result[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
    let match;
    let count = 0;
    
    while ((match = resultBlockRegex.exec(html)) !== null && count < 4) {
      const block = match[0];
      const titleMatch = block.match(/<a class="result__url"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      
      if (titleMatch && snippetMatch) {
        const title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]*>/g, '').trim());
        const snippet = decodeHtmlEntities(snippetMatch[1].replace(/<[^>]*>/g, '').trim());
        results.push({ title, snippet });
        count++;
      }
    }
    return results;
  } catch (err) {
    console.error('[CHATBOT ARAMA HATASI]', err);
    return [];
  }
}

// OpenAI Uyumlu API'ler için (Groq, OpenRouter)
async function askOpenAICompatible(prompt, userMemory, apiKey, provider, searchContext = '') {
  let url, model;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  if (provider === 'groq') {
    url = 'https://api.groq.com/openai/v1/chat/completions';
    model = 'llama-3.1-8b-instant'; // Groq üzerinde ücretsiz ve hızlı Llama 3.1 modeli
  } else if (provider === 'openrouter') {
    url = 'https://openrouter.ai/api/v1/chat/completions';
    model = 'meta-llama/llama-3-8b-instruct:free'; // OpenRouter ücretsiz Llama 3 modeli
    headers['HTTP-Referer'] = 'https://github.com/discord-honeypot-bot';
    headers['X-Title'] = 'Discord Honeypot Bot';
  }

  const history = userMemory.history || [];
  const profile = userMemory.profile || 'Kullanıcı hakkında henüz hiçbir şey bilinmiyor.';
  const lastTopic = userMemory.lastTopic || 'Henüz bir konu konuşulmadı.';

  const systemInstruction = `Sen bir Discord sunucusunda çalışan zeki, samimi, güncel bilgilere erişebilen ve yardımsever bir yapay zeka asistanısın. Kullanıcılar sana "ai " yazarak ulaşıyor. 
Konuştuğun kullanıcı hakkında bilinen bilgiler şunlar:
[KULLANICI_PROFİLİ]
${profile}

En son konuştuğunuz konu: ${lastTopic}

Görevlerin:
1. Sohbet geçmişine, kullanıcı hakkındaki bilgilere ve varsa sağlanan en güncel web arama sonuçlarına dayanarak samimi, doğal ve yardımcı bir cevap ver.
2. Türkçe dil kurallarına son derece dikkat et. İngilizce terimleri doğrudan Türkçe'ye çevirirken komik/hatalı çeviriler yapma (Örn: "mobility" terimini "mobilya" değil "hareketlilik" olarak çevir, oyun terimlerini bağlamına uygun kullan).
3. Bu konuşma sırasında kullanıcının kendisi hakkında verdiği yeni bilgileri (örneğin ismi, hobileri, ilgi alanları veya bahsettiği önemli şeyler) tespit et.
4. Cevabının en sonuna tam olarak şu formatta güncellenmiş bilgileri ekle:
|||{"profile": "kullanıcı hakkında bilinen tüm güncel bilgilerin tek cümlelik özeti", "lastTopic": "şu an konuşulan ana konu"}|||
Bu JSON bloğu cevabın sonunda mutlaka olmalı ve kullanıcı hakkında yeni bir şey öğrenmediysen bile mevcut bilgileri koruyarak yer almalı. Kullanıcı bu JSON kısmını görmeyecektir.`;

  const messages = [
    { role: 'system', content: systemInstruction }
  ];

  // Sohbet geçmişini ekle (OpenAI formatı için assistant ve user rolleri kullanılır)
  history.forEach(item => {
    messages.push({
      role: item.role === 'model' ? 'assistant' : item.role,
      content: item.content
    });
  });

  // Eğer web arama sonucu varsa, son mesaja bağlam olarak ekle
  let finalPrompt = prompt;
  if (searchContext) {
    finalPrompt = `İnternet arama sonuçları:\n${searchContext}\n\nKullanıcı Sorusu: ${prompt}`;
  }

  // Yeni soruyu ekle
  messages.push({ role: 'user', content: finalPrompt });

  const payload = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 800
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${provider.toUpperCase()} API Hatası (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const rawResponse = result.choices?.[0]?.message?.content;
  if (!rawResponse) {
    throw new Error(`${provider.toUpperCase()} boş yanıt döndürdü.`);
  }

  return rawResponse;
}

// Gemini API'sine istek gönder
async function askGemini(prompt, userMemory, geminiKey, searchContext = '') {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${geminiKey}`;
  
  const history = userMemory.history || [];
  const profile = userMemory.profile || 'Kullanıcı hakkında henüz hiçbir şey bilinmiyor.';
  const lastTopic = userMemory.lastTopic || 'Henüz bir konu konuşulmadı.';

  const chatContents = history.map(item => ({
    role: item.role === 'assistant' ? 'model' : item.role,
    parts: [{ text: item.content }]
  }));

  // Eğer web arama sonucu varsa, son mesaja bağlam olarak ekle
  let finalPrompt = prompt;
  if (searchContext) {
    finalPrompt = `İnternet arama sonuçları:\n${searchContext}\n\nKullanıcı Sorusu: ${prompt}`;
  }

  chatContents.push({
    role: 'user',
    parts: [{ text: finalPrompt }]
  });

  const systemInstruction = `Sen bir Discord sunucusunda çalışan zeki, samimi, güncel bilgilere erişebilen ve yardımsever bir yapay zeka asistanısın. Kullanıcılar sana "ai " yazarak ulaşıyor. 
Konuştuğun kullanıcı hakkında bilinen bilgiler şunlar:
[KULLANICI_PROFİLİ]
${profile}

En son konuştuğunuz konu: ${lastTopic}

Görevlerin:
1. Sohbet geçmişine, kullanıcı hakkındaki bilgilere ve varsa sağlanan en güncel web arama sonuçlarına dayanarak samimi, doğal ve yardımcı bir cevap ver.
2. Türkçe dil kurallarına son derece dikkat et. İngilizce terimleri doğrudan Türkçe'ye çevirirken komik/hatalı çeviriler yapma (Örn: "mobility" terimini "mobilya" değil "hareketlilik" olarak çevir, oyun terimlerini bağlamına uygun kullan).
3. Bu konuşma sırasında kullanıcının kendisi hakkında verdiği yeni bilgileri (örneğin ismi, hobileri, ilgi alanları veya bahsettiği önemli şeyler) tespit et.
4. Cevabının en sonuna tam olarak şu formatta güncellenmiş bilgileri ekle:
|||{"profile": "kullanıcı hakkında bilinen tüm güncel bilgilerin tek cümlelik özeti", "lastTopic": "şu an konuşulan ana konu"}|||
Bu JSON bloğu cevabın sonunda mutlaka olmalı ve kullanıcı hakkında yeni bir şey öğrenmediysen bile mevcut bilgileri koruyarak yer almalı. Kullanıcı bu JSON kısmını görmeyecektir.`;

  const payload = {
    contents: chatContents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Hatası (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) {
    throw new Error('Gemini API boş yanıt döndürdü.');
  }

  return rawText;
}

// API Ninjas Chatbot API'sine istek gönder (Hafızasız Fallback)
async function askApiNinjas(prompt, apiKey) {
  const url = `https://api.api-ninjas.com/v1/chatbot?text=${encodeURIComponent(prompt)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Ninjas Hatası (${response.status}): ${errText}`);
  }

  const result = await response.json();
  return result.response || 'Bir cevap alınamadı.';
}

export async function handleChatbotMessage(message) {
  const content = message.content;
  
  const triggerRegex = /^ai\s+(.+)$/i;
  const match = content.match(triggerRegex);
  
  if (!match) return;
  
  const userPrompt = match[1].trim();
  if (!userPrompt) return;

  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const apiNinjasKey = process.env.API_NINJAS_KEY || 'oeSNLor4nQRwVUyKvf1f42XHlfBulJe9KMeJtvjh';

  try {
    await message.channel.sendTyping();
  } catch (err) {
    // Yazıyor durumunu tetikleyemezsek hatayı yut
  }

  const userId = message.author.id;
  const memory = loadMemory();

  if (!memory[userId]) {
    memory[userId] = {
      profile: `Kullanıcının Discord adı: ${message.author.displayName || message.author.username}.`,
      lastTopic: 'Sohbet yeni başladı.',
      history: []
    };
  }

  const userMemory = memory[userId];

  try {
    let rawResponse = '';
    let isMemorySupported = false;

    // Basit sohbet dışındaki konularda DuckDuckGo ile web araması yap
    const conversationalPatterns = /^(merhaba|selam|selamlar|naber|nasılsın|hey|günaydın|tünaydın|iyi akşamlar|iyi geceler|kimsin|adın ne|ismin ne|neler yapabilirsin|help|yardım)$/i;
    const isConversational = conversationalPatterns.test(userPrompt.toLowerCase().trim());
    
    let searchContext = '';
    if (!isConversational) {
      console.log(`[CHATBOT ARAMA] Web araması yapılıyor: ${userPrompt}`);
      const searchResults = await searchWeb(userPrompt);
      if (searchResults.length > 0) {
        searchContext = searchResults.map((r, i) => `[Sonuç ${i+1}] Başlık: ${r.title}\nÖzet: ${r.snippet}`).join('\n\n');
        console.log(`[CHATBOT ARAMA] ${searchResults.length} adet arama sonucu eklendi.`);
      }
    }

    if (groqKey && groqKey !== 'YOUR_GROQ_KEY') {
      // 1. Groq (Llama 3.1) - Hafızalı + RAG Arama
      rawResponse = await askOpenAICompatible(userPrompt, userMemory, groqKey, 'groq', searchContext);
      isMemorySupported = true;
    } else if (openrouterKey && openrouterKey !== 'YOUR_OPENROUTER_KEY') {
      // 2. OpenRouter (Llama 3 Free) - Hafızalı + RAG Arama
      rawResponse = await askOpenAICompatible(userPrompt, userMemory, openrouterKey, 'openrouter', searchContext);
      isMemorySupported = true;
    } else if (geminiKey && geminiKey !== 'YOUR_GEMINI_KEY') {
      // 3. Gemini - Hafızalı + RAG Arama
      rawResponse = await askGemini(userPrompt, userMemory, geminiKey, searchContext);
      isMemorySupported = true;
    } else if (apiNinjasKey) {
      // 4. API Ninjas - Hafızasız Fallback
      const reply = await askApiNinjas(userPrompt, apiNinjasKey);
      await message.reply(reply);
      return;
    } else {
      await message.reply('⚠️ Yapay Zeka sohbet özelliğini kullanabilmek için lütfen `.env` dosyasına `GROQ_API_KEY`, `OPENROUTER_API_KEY` veya `GEMINI_API_KEY` ekleyin!');
      return;
    }

    if (isMemorySupported) {
      const separator = '|||';
      const parts = rawResponse.split(separator);
      let reply = parts[0].trim();
      
      if (parts[1]) {
        try {
          const parsed = JSON.parse(parts[1].trim());
          userMemory.profile = parsed.profile || userMemory.profile;
          userMemory.lastTopic = parsed.lastTopic || userMemory.lastTopic;
        } catch (e) {
          // JSON ayrıştırma hatasını yut
        }
      }

      // Geçmişe ekle (Son 10 soru-cevap çiftini tut)
      userMemory.history.push({ role: 'user', content: userPrompt });
      userMemory.history.push({ role: 'assistant', content: reply });
      if (userMemory.history.length > 20) {
        userMemory.history = userMemory.history.slice(-20);
      }

      saveMemory(memory);
      await message.reply(reply);
    }
  } catch (error) {
    console.error('[CHATBOT HATA]', error);
    await message.reply('❌ Üzgünüm, yapay zeka servisine bağlanırken bir hata oluştu.');
  }
}
