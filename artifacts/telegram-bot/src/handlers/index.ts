import type { Telegraf, Context } from 'telegraf';
import { handleStart } from './start.js';
import { handleBalance } from './balance.js';
import { handleAccount } from './account.js';
import { handleTasks, handleEarnTasks, handleCheckSubscription } from './tasks.js';
import { handleDailyBonus } from './daily.js';
import {
  handlePromote,
  handlePromoteChannelInput,
  handlePromotePointsInput,
  getPromoteState,
  clearPromoteState,
} from './promote.js';
import {
  handleAdmin,
  handleAdminCallback,
  handleAdminTextInput,
  isAdmin,
} from './admin.js';
import { getUserByTelegramId } from '../db/queries.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';
import { showEarnMenu } from '../utils/earn_menu.js';

export function setupHandlers(bot: Telegraf): void {

  // ========== أوامر ==========

  bot.command('start', handleStart);
  bot.command('admin', handleAdmin);
  bot.command('cancel', async (ctx) => {
    clearPromoteState(ctx.from?.id ?? 0);
    const { clearAdminState } = await import('./admin.js');
    clearAdminState(ctx.from?.id ?? 0);
    await ctx.reply('🚫 تم الإلغاء.', mainMenuKeyboard);
  });

  // ========== أزرار القائمة الرئيسية ==========

  bot.hears('📊 رصيدي', handleBalance);
  bot.hears('⭐ كسب نقاط', handleTasks);
  bot.hears('📢 ترويج قناتي', handlePromote);
  bot.hears('👤 حسابي', handleAccount);

  // ========== Callback queries ==========

  bot.on('callback_query', async (ctx) => {
    const data = (ctx.callbackQuery as { data?: string }).data;
    if (!data) return;

    // التحقق من الاشتراك في قناة المهام
    if (data.startsWith('check_sub_')) {
      const channelId = parseInt(data.replace('check_sub_', ''), 10);
      await handleCheckSubscription(ctx, channelId);
      return;
    }

    // لوحة الأدمن
    if (data.startsWith('admin_')) {
      await handleAdminCallback(ctx, data);
      return;
    }

    // المكافأة اليومية
    if (data === 'daily_bonus') {
      await handleDailyBonus(ctx);
      return;
    }

    // قائمة كسب النقاط (رجوع)
    if (data === 'earn_menu') {
      await ctx.answerCbQuery();
      await showEarnMenu(ctx, true);
      return;
    }

    // مهام الاشتراك في القنوات
    if (data === 'earn_tasks') {
      await handleEarnTasks(ctx);
      return;
    }

    await ctx.answerCbQuery();
  });

  // ========== الرسائل النصية (لمعالجة المحادثات متعددة الخطوات) ==========

  bot.on('text', async (ctx) => {
    const from = ctx.from;
    if (!from) return;

    const text = (ctx.message as { text?: string }).text ?? '';

    // معالجة إدخالات الأدمن أولاً
    const adminHandled = await handleAdminTextInput(ctx, text);
    if (adminHandled) return;

    // معالجة حالات ترويج القناة
    const promoteState = getPromoteState(from.id);
    if (promoteState) {
      if (text === '/cancel') {
        clearPromoteState(from.id);
        await ctx.reply('🚫 تم الإلغاء.', mainMenuKeyboard);
        return;
      }

      if (promoteState.step === 'waiting_channel') {
        // التحقق من صحة المعرّف
        if (!text.match(/^@?[a-zA-Z0-9_]{5,}$/)) {
          await ctx.reply('⚠️ معرّف القناة غير صحيح. يجب أن يبدأ بـ @ ويحتوي على أحرف وأرقام فقط.\n\nمثال: @channelname');
          return;
        }
        await handlePromoteChannelInput(ctx, text);
        return;
      }

      if (promoteState.step === 'waiting_points') {
        await handlePromotePointsInput(ctx, promoteState.channelUsername, text);
        return;
      }
    }

    // رسالة غير معروفة - عرض القائمة
    const user = getUserByTelegramId(from.id);
    if (!user) {
      await ctx.reply('👋 أرسل /start للبدء.');
      return;
    }
    await ctx.reply('اختر من القائمة:', mainMenuKeyboard);
  });
}
