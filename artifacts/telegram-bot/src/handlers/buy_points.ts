import type { Context } from 'telegraf';
import { getUserByTelegramId, getSetting } from '../db/queries.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';

export async function handleBuyPoints(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.reply('⚠️ أرسل /start للتسجيل.'); return; }

  const [contact, msgTemplate] = await Promise.all([
    getSetting('buy_points_contact'),
    getSetting('buy_points_msg'),
  ]);

  if (!contact) {
    await ctx.reply('💰 شراء النقاط\n\nعذراً، هذه الخدمة غير متاحة حالياً. تواصل مع الإدارة.', mainMenuKeyboard);
    return;
  }

  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  const defaultMsg = `💰 شراء النقاط\n\n👤 مرحباً {name}!\n💰 رصيدك الحالي: {points} نقطة\n\nللشراء تواصل مع:\n🔗 {contact}`;
  const template = msgTemplate || defaultMsg;

  const text = template
    .replace(/{name}/g, name)
    .replace(/{points}/g, String(user.points))
    .replace(/{contact}/g, contact);

  // إذا كان الـ contact معرّف تيليجرام أنشئ زر url
  const isUsername = contact.startsWith('@') || /^[a-zA-Z0-9_]{5,}$/.test(contact);
  const username = contact.startsWith('@') ? contact.slice(1) : contact;

  if (isUsername && !contact.startsWith('http')) {
    const { Markup } = await import('telegraf');
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.url('💬 تواصل للشراء', `https://t.me/${username}`)],
      ]).reply_markup,
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML' });
  }
}
