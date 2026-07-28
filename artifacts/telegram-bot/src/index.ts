import { bot } from './bot.js';

async function main(): Promise<void> {
  console.log('🤖 جاري تشغيل بوت تيليجرام...');

  await bot.launch({
    dropPendingUpdates: true, // تجاهل الرسائل القديمة عند الإعادة
  });

  console.log('✅ البوت يعمل الآن!');
  console.log(`🤖 اسم البوت: @${bot.botInfo?.username ?? 'غير معروف'}`);

  // إيقاف نظيف عند إشارات النظام
  process.once('SIGINT', () => {
    console.log('⏹️ إيقاف البوت...');
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    console.log('⏹️ إيقاف البوت...');
    bot.stop('SIGTERM');
  });
}

main().catch((err: unknown) => {
  console.error('❌ خطأ في تشغيل البوت:', err);
  process.exit(1);
});
