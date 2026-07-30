import { Telegraf } from 'telegraf';
import { initDatabase } from './db/database.js';
import { setupHandlers } from './handlers/index.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('❌ TELEGRAM_BOT_TOKEN غير محدد في متغيرات البيئة.');
}

// تهيئة قاعدة البيانات (Supabase)
await initDatabase();

// إنشاء البوت
export const bot = new Telegraf(BOT_TOKEN);

// إعداد المعالجات
setupHandlers(bot);
