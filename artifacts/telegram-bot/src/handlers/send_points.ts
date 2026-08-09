import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getUserByTelegramId, getUserById, transferPoints } from '../db/queries.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';

interface SendState {
  step: 'waiting_username' | 'waiting_amount' | 'waiting_confirm';
  recipientTelegramId?: number;
  recipientName?: string;
  amount?: number;
}

const states = new Map<number, SendState>();

export function getSendState(userId: number): SendState | undefined {
  return states.get(userId);
}
export function clearSendState(userId: number): void {
  states.delete(userId);
}

export async function handleSendPoints(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.reply('⚠️ أرسل /start للتسجيل أولاً.'); return; }
  if (user.points < 10) {
    await ctx.reply('💸 رصيدك لا يكفي للتحويل (الحد الأدنى 10 نقاط).', mainMenuKeyboard);
    return;
  }
  states.set(from.id, { step: 'waiting_username' });
  await ctx.reply(
    '💸 <b>إرسال نقاط</b>\n\nأدخل <b>معرّف المستخدم</b> الذي تريد إرسال النقاط إليه:\n<i>مثال: @username</i>\n\nأرسل /cancel للإلغاء.',
    { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } },
  );
}

export async function handleSendPointsText(ctx: Context, text: string): Promise<boolean> {
  const from = ctx.from;
  if (!from) return false;
  const state = states.get(from.id);
  if (!state) return false;

  if (text === '/cancel') {
    clearSendState(from.id);
    await ctx.reply('🚫 تم الإلغاء.', mainMenuKeyboard);
    return true;
  }

  // الخطوة 1: استقبال المعرّف
  if (state.step === 'waiting_username') {
    const raw = text.replace(/^@/, '').trim();
    if (!raw) {
      await ctx.reply('⚠️ أدخل معرّفاً صحيحاً مثل @username أو أرسل /cancel.');
      return true;
    }
    // نبحث عن المستخدم بواسطة username أو telegram_id
    let recipient = null;
    const asNum = parseInt(raw, 10);
    if (!isNaN(asNum)) {
      recipient = await getUserByTelegramId(asNum);
    } else {
      // البحث بالـ username في DB
      const { pool } = await import('../db/database.js');
      const { rows } = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [raw]);
      if (rows[0]) {
        const { default: queries } = await import('../db/queries.js') as any;
        recipient = { id: rows[0].id, telegram_id: rows[0].telegram_id, first_name: rows[0].first_name, last_name: rows[0].last_name, points: rows[0].points };
      }
    }
    if (!recipient) {
      await ctx.reply('❌ المستخدم غير موجود. تأكد من المعرّف وأرسل مجدداً، أو /cancel للإلغاء.');
      return true;
    }
    if (recipient.telegram_id === from.id) {
      await ctx.reply('❌ لا يمكنك إرسال نقاط لنفسك.', mainMenuKeyboard);
      clearSendState(from.id);
      return true;
    }
    const name = recipient.first_name + (recipient.last_name ? ` ${recipient.last_name}` : '');
    state.recipientTelegramId = Number(recipient.telegram_id);
    state.recipientName = name;
    state.step = 'waiting_amount';
    states.set(from.id, state);
    await ctx.reply(
      `👤 المستلم: <b>${name}</b>\n\nكم نقطة تريد إرسالها؟ (رصيدك: ${(await getUserByTelegramId(from.id))?.points ?? 0} نقطة)\n\nأرسل /cancel للإلغاء.`,
      { parse_mode: 'HTML' },
    );
    return true;
  }

  // الخطوة 2: استقبال المبلغ
  if (state.step === 'waiting_amount') {
    const amount = parseInt(text, 10);
    const sender = await getUserByTelegramId(from.id);
    if (!sender) { clearSendState(from.id); return true; }
    if (isNaN(amount) || amount < 1) {
      await ctx.reply('⚠️ أدخل رقماً صحيحاً أكبر من صفر.');
      return true;
    }
    if (amount > sender.points) {
      await ctx.reply(`❌ رصيدك غير كافٍ. رصيدك الحالي: ${sender.points} نقطة.`);
      return true;
    }
    const commission = Math.ceil(amount * 0.1);
    const recipientGets = amount - commission;
    state.amount = amount;
    state.step = 'waiting_confirm';
    states.set(from.id, state);
    await ctx.reply(
      `💸 <b>تأكيد التحويل</b>\n\n` +
      `👤 المستلم: <b>${state.recipientName}</b>\n` +
      `💎 المبلغ المُرسَل: <b>${amount}</b> نقطة\n` +
      `🏦 عمولة البوت (10%): <b>${commission}</b> نقطة\n` +
      `📬 المستلم يحصل على: <b>${recipientGets}</b> نقطة\n\n` +
      `رصيدك بعد التحويل: ${sender.points - amount} نقطة`,
      {
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('✅ تأكيد الإرسال', 'send_confirm')],
          [Markup.button.callback('❌ إلغاء', 'send_cancel')],
        ]).reply_markup,
      },
    );
    return true;
  }

  return true; // في انتظار تأكيد الزر
}

export async function handleSendConfirm(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const state = states.get(from.id);
  if (!state || state.step !== 'waiting_confirm' || !state.recipientTelegramId || !state.amount) {
    await ctx.answerCbQuery('⚠️ انتهت الجلسة. أعد المحاولة.', { show_alert: true });
    return;
  }
  const sender = await getUserByTelegramId(from.id);
  if (!sender) { await ctx.answerCbQuery('خطأ.'); return; }
  const recipient = await getUserByTelegramId(state.recipientTelegramId);
  if (!recipient) {
    await ctx.answerCbQuery('❌ المستخدم غير موجود.', { show_alert: true });
    clearSendState(from.id);
    return;
  }
  const commission = Math.ceil(state.amount * 0.1);
  const result = await transferPoints(sender.id, recipient.id, state.amount, commission);
  clearSendState(from.id);
  if (result === 'insufficient') {
    await ctx.answerCbQuery('❌ رصيدك غير كافٍ.', { show_alert: true });
    return;
  }
  const recipientGets = state.amount - commission;
  await ctx.answerCbQuery('✅ تم التحويل!');
  try { await ctx.deleteMessage(); } catch { /* تجاهل */ }
  const updatedSender = await getUserByTelegramId(from.id);
  await ctx.reply(
    `✅ <b>تم التحويل بنجاح!</b>\n\n📬 أرسلت <b>${recipientGets}</b> نقطة إلى ${state.recipientName}\n💰 رصيدك الحالي: <b>${updatedSender?.points ?? 0}</b> نقطة`,
    { parse_mode: 'HTML', reply_markup: mainMenuKeyboard.reply_markup },
  );
  // إشعار المستلم
  try {
    await ctx.telegram.sendMessage(
      state.recipientTelegramId,
      `🎉 استلمت <b>${recipientGets}</b> نقطة من مستخدم!\n💰 رصيدك الجديد: <b>${(await getUserByTelegramId(state.recipientTelegramId))?.points ?? 0}</b> نقطة`,
      { parse_mode: 'HTML' },
    );
  } catch { /* تجاهل */ }
}

export async function handleSendCancel(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  clearSendState(from.id);
  await ctx.answerCbQuery('تم الإلغاء.');
  try { await ctx.deleteMessage(); } catch { /* تجاهل */ }
  await ctx.reply('🚫 تم إلغاء التحويل.', mainMenuKeyboard);
}
