import type { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import { handleStart } from './start.js';
import { handleBuyPoints } from './buy_points.js';
import { checkMandatoryChannel, verifyMandatoryChannels } from './mandatory.js';
import { handleBalance } from './balance.js';
import { handleAccount } from './account.js';
import { handleTasks, handleEarnTasks, handleCheckChannel, handleCheckCampaign, handleSkipChannel, handleSkipCampaign } from './tasks.js';
import { handleDailyBonus, handleDailyBonusMenu } from './daily.js';
import {
  handleSendPoints,
  handleSendPointsText,
  getSendState,
  clearSendState,
  handleSendConfirm,
  handleSendCancel,
} from './send_points.js';
import { handleReferral } from './referral.js';
import {
  handlePromote,
  handlePromoteChannelInput,
  handlePromoteChoose,
  handlePromoteConfirm,
  handlePromoteCancel,
  getPromoteState,
  clearPromoteState,
  handlePromoteAll,
  handlePromoteCustomStart,
  handlePromoteCustomInput,
} from './promote.js';
import {
  handleAdmin,
  handleAdminCallback,
  handleAdminTextInput,
} from './admin.js';
import { getUserByTelegramId, isUserBanned } from '../db/queries.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';
import { showEarnMenu } from '../utils/earn_menu.js';

export function setupHandlers(bot: Telegraf): void {

  // ========== middleware: منع المحظورين ==========

  bot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id;
    if (telegramId && await isUserBanned(telegramId)) {
      await ctx.reply('🚫 حسابك محظور.');
      return;
    }
    return next();
  });

  // ========== أوامر ==========

  bot.command('start', handleStart);
  bot.command('admin', handleAdmin);
  bot.command('cancel', async (ctx) => {
    const id = ctx.from?.id ?? 0;
    clearPromoteState(id);
    clearSendState(id);
    const { clearAdminState } = await import('./admin.js');
    clearAdminState(id);
    await ctx.reply('🚫 تم الإلغاء.', mainMenuKeyboard);
  });

  // ========== أزرار القائمة الرئيسية ==========

  bot.hears('📊 رصيدي', handleBalance);
  bot.hears('⭐ كسب نقاط', handleTasks);
  bot.hears('☀️ مكافأة يومية', handleDailyBonusMenu);
  bot.hears('💸 إرسال نقاط', handleSendPoints);
  bot.hears('📢 ترويج قناتي', handlePromote);
  bot.hears('👤 حسابي', handleAccount);
  bot.hears('🎁 دعوة الأصدقاء', handleReferral);
  bot.hears('💰 شراء نقاط', handleBuyPoints);

  // ========== Callback queries ==========

  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as { data?: string }).data;
    if (!data) return;

    // التحقق من اشتراك قناة الأدمن
    if (data.startsWith('check_channel_')) {
      const id = parseInt(data.replace('check_channel_', ''), 10);
      await handleCheckChannel(ctx, id);
      return;
    }

    // التحقق من اشتراك حملة
    if (data.startsWith('check_campaign_')) {
      const id = parseInt(data.replace('check_campaign_', ''), 10);
      await handleCheckCampaign(ctx, id);
      return;
    }

    // تخطي مهمة قناة
    if (data.startsWith('skip_channel_')) {
      const id = parseInt(data.replace('skip_channel_', ''), 10);
      await handleSkipChannel(ctx, id);
      return;
    }

    // تخطي مهمة حملة
    if (data.startsWith('skip_campaign_')) {
      const id = parseInt(data.replace('skip_campaign_', ''), 10);
      await handleSkipCampaign(ctx, id);
      return;
    }

    // اختيار عدد مشتركي الحملة: promote_choose_{subs}_{cost}
    if (data.startsWith('promote_choose_')) {
      const parts = data.replace('promote_choose_', '').split('_');
      const subs = parseInt(parts[0] ?? '0', 10);
      const cost = parseInt(parts[1] ?? '0', 10);
      await handlePromoteChoose(ctx, subs, cost);
      return;
    }

    // زر الترويج بكل النقاط: promote_all_{subs}_{cost}_{channel}
    if (data.startsWith('promote_all_')) {
      const rest = data.replace('promote_all_', '');
      const firstUnderscore = rest.indexOf('_');
      const secondUnderscore = rest.indexOf('_', firstUnderscore + 1);
      const subs = parseInt(rest.slice(0, firstUnderscore), 10);
      const cost = parseInt(rest.slice(firstUnderscore + 1, secondUnderscore), 10);
      const channel = decodeURIComponent(rest.slice(secondUnderscore + 1));
      await handlePromoteAll(ctx, subs, cost, channel);
      return;
    }

    // زر إدخال عدد الأعضاء: promote_custom_{channel}
    if (data.startsWith('promote_custom_')) {
      const channel = decodeURIComponent(data.replace('promote_custom_', ''));
      await handlePromoteCustomStart(ctx, channel);
      return;
    }

    // تأكيد الحملة: promote_confirm_{subs}_{cost}_{channel}
    if (data.startsWith('promote_confirm_')) {
      const rest = data.replace('promote_confirm_', '');
      const firstUnderscore = rest.indexOf('_');
      const secondUnderscore = rest.indexOf('_', firstUnderscore + 1);
      const subs = parseInt(rest.slice(0, firstUnderscore), 10);
      const cost = parseInt(rest.slice(firstUnderscore + 1, secondUnderscore), 10);
      const channel = decodeURIComponent(rest.slice(secondUnderscore + 1));
      await handlePromoteConfirm(ctx, subs, cost, channel);
      return;
    }

    // إلغاء الحملة
    if (data === 'promote_cancel') {
      await handlePromoteCancel(ctx);
      return;
    }

    // المكافأة اليومية
    if (data === 'daily_bonus') {
      await handleDailyBonus(ctx);
      return;
    }

    // قائمة كسب النقاط
    if (data === 'earn_menu') {
      await ctx.answerCbQuery();
      await showEarnMenu(ctx, true);
      return;
    }

    // مهام الاشتراك
    if (data === 'earn_tasks') {
      await handleEarnTasks(ctx);
      return;
    }

    // تأكيد/إلغاء إرسال النقاط
    if (data === 'send_confirm') { await handleSendConfirm(ctx); return; }
    if (data === 'send_cancel') { await handleSendCancel(ctx); return; }

    // زر التحقق من الاشتراك الإجباري
    if (data === 'mandatory_verify') {
      const from = ctx.from;
      if (!from) return;
      const result = await verifyMandatoryChannels(ctx, from.id);
      if (result === 'ok') {
        await ctx.answerCbQuery('✅ تم التحقق! يمكنك استخدام البوت الآن.', { show_alert: true });
        try { await ctx.deleteMessage(); } catch { /* تجاهل */ }
        await ctx.reply('اختر من القائمة:', mainMenuKeyboard);
      } else {
        await ctx.answerCbQuery('❌ لم يتم التحقق من اشتراكك في جميع القنوات.', { show_alert: true });
      }
      return;
    }

    // لوحة الأدمن
    if (data.startsWith('admin_')) {
      await handleAdminCallback(ctx, data);
      return;
    }

    await ctx.answerCbQuery();
  });

  // ========== الرسائل النصية ==========

  bot.on('text', async (ctx: Context) => {
    const from = ctx.from;
    if (!from) return;

    const text = (ctx.message as { text?: string }).text ?? '';

    // إدخالات الأدمن أولاً
    if (await handleAdminTextInput(ctx, text)) return;

    // حالة إرسال النقاط
    if (getSendState(from.id)) {
      await handleSendPointsText(ctx, text);
      return;
    }

    // حالات ترويج القناة
    const promoteState = getPromoteState(from.id);
    if (promoteState) {
      if (text === '/cancel') {
        clearPromoteState(from.id);
        await ctx.reply('🚫 تم الإلغاء.', mainMenuKeyboard);
        return;
      }
      // إذا ننتظر إدخال عدد مخصص
      if (promoteState.step === 'waiting_custom_number') {
        await handlePromoteCustomInput(ctx, text);
        return;
      }
      // حالة إدخال رابط القناة الأولي
      if (promoteState.step === 'waiting_channel') {
        await handlePromoteChannelInput(ctx, text);
        return;
      }
    }

    // رسالة غير معروفة
    const user = getUserByTelegramId(from.id);
    if (!user) { await ctx.reply('👋 أرسل /start للبدء.'); return; }
    await ctx.reply('اختر من القائمة:', mainMenuKeyboard);
  });
}
