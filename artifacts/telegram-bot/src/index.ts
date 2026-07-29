import http from 'node:http';
import { bot } from './bot.js';

console.log('🤖 جاري تشغيل بوت تيليجرام...');

// سيرفر HTTP بسيط لإبقاء الخدمة حية على Render
const PORT = process.env.PORT ?? 3000;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', bot: '@dqaalifadel_bot' }));
});
server.listen(PORT, () => {
  console.log(`🌐 Health server يعمل على port ${PORT}`);
});

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
  server.close();
});
process.once('SIGTERM', () => {
  console.log('⏹️ إيقاف البوت...');
  bot.stop('SIGTERM');
  server.close();
});
