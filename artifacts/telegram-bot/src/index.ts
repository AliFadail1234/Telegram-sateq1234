import http from 'node:http';
import { bot } from './bot.js';
import { handleAdminRequest } from './admin/api.js';

console.log('🤖 جاري تشغيل بوت تيليجرام...');

const PORT = process.env.PORT ?? 3000;

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';

  // Admin dashboard & API
  if (url.startsWith('/admin')) {
    const handled = await handleAdminRequest(req, res);
    if (handled) return;
  }

  // Health check
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', bot: '@dqaalifadel_bot' }));
});

server.listen(PORT, () => {
  console.log(`🌐 Server يعمل على port ${PORT}`);
  console.log(`🛠️  لوحة التحكم: http://localhost:${PORT}/admin`);
  console.log(`🔑  كلمة المرور: ${process.env.ADMIN_PASSWORD ?? 'admin123 (افتراضي)'}`);
});

// bot.launch() يبدأ الاستطلاع ولا يُرجع إلا عند الإيقاف
bot.launch({
  dropPendingUpdates: true,
}).catch((err: unknown) => {
  // لا ننهي العملية تلقائياً عند وجود تصادم 409 بسبب وجود مثيل آخر للـ getUpdates
  // (حالة شائعة عند إعادة التشغيل أو تشغيل أكثر من نسخة). بدلاً من الخروج، نطبع تحذيراً
  // ونترك الخادم يعمل حتى تتمكن من إعادة النشر أو حل مشكلة التكوين.
  const anyErr = err as any;
  if (anyErr && anyErr.response && anyErr.response.error_code === 409) {
    console.warn('⚠️ تحذير: خطأ Telegram 409 — يوجد مثيل آخر يقوم بالاستطلاع (getUpdates). لن أنهِ العملية.');
    console.warn('تفاصيل:', anyErr.response.description || anyErr);
  } else {
    console.error('❌ خطأ في البوت:', err);
    process.exit(1);
  }
});

console.log('✅ البوت يعمل الآن!');
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
