import { bot } from './bot.js';

console.log('🤖 جاري تشغيل بوت تيليجرام...');

// bot.launch() يبدأ الاستطلاع ولا يُرجع إلا عند الإيقاف — لا نستخدم await هنا
bot.launch({
  dropPendingUpdates: true,
}).catch((err: unknown) => {
  console.error('❌ خطأ في البوت:', err);
  process.exit(1);
});

// يُطبع فوراً بعد بدء الاستطلاع
console.log('✅ البوت يعمل الآن!');
console.log(`🤖 اسم البوت: @dqaalifadel_bot`);
console.log('📡 جاهز لاستقبال الرسائل...');

// إيقاف نظيف
process.once('SIGINT', () => {
  console.log('⏹️ إيقاف البوت...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  console.log('⏹️ إيقاف البوت...');
  bot.stop('SIGTERM');
});
