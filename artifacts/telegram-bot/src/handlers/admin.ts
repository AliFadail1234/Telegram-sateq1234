import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import {
  getUsersCount,
  getChannelsCount,
  getTasksCount,
  getTotalPointsCirculated,
  getActiveChannels,
  createChannel,
  deleteChannel,
  updateChannelPoints,
  getUserCompletedTasksCount,
  searchUserByUsername,
  searchUserByTelegramId,
} from '../db/queries.js';
import {
  adminStatsMessage,
  adminUserInfoMessage,
} from '../utils/messages.js';
import {
  adminMenuKeyboard,
  adminChannelsKeyboard,
  adminUsersKeyboard,
  adminBackKeyboard,
} from '../utils/keyboards.js';

const ADMIN_ID = parseInt(process.env.ADMIN_ID ?? '0', 10);

export function isAdmin(telegramId: number): boolean {
  return telegramId === ADMIN_ID;
}

// حالات محادثة الأدمن
type AdminState =
  | { step: 'add_channel_username' }
  | { step: 'add_channel_name'; username: string }
  | { step: 'add_channel_points'; username: string; name: string }
  | { step: 'delete_channel_id' }
  | { step: 'edit_channel_id' }
  | { step: 'edit_channel_points'; channelId: number }
  | { step: 'search_user' };

const adminStates = new Map<number, AdminState>();

export function getAdminState(telegramId: number): AdminState | undefined {
  return adminStates.get(telegramId);
}

export function clearAdminState(telegramId: number): void {
  adminStates.delete(telegramId);
}

export async function handleAdmin(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from || !isAdmin(from.id)) {
    await ctx.reply('⛔ ليس لديك صلاحية لهذا الأمر.');
    return;
  }
  await ctx.reply('🛠️ لوحة الأدمن\n\nاختر ما تريد إدارته:', adminMenuKeyboard);
}

export async function handleAdminCallback(ctx: Context, action: string): Promise<void> {
  const from = ctx.from;
  if (!from || !isAdmin(from.id)) {
    await ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
    return;
  }

  await ctx.answerCbQuery();

  switch (action) {
    case 'admin_back':
      await ctx.editMessageText('🛠️ لوحة الأدمن\n\nاختر ما تريد إدارته:', adminMenuKeyboard);
      break;

    case 'admin_channels':
      await ctx.editMessageText('📢 إدارة القنوات\n\nاختر عملية:', adminChannelsKeyboard);
      break;

    case 'admin_users':
      await ctx.editMessageText('👥 إدارة المستخدمين\n\nاختر عملية:', adminUsersKeyboard);
      break;

    case 'admin_stats': {
      const usersCount = getUsersCount();
      const tasksCount = getTasksCount();
      const channelsCount = getChannelsCount();
      const totalPoints = getTotalPointsCirculated();
      await ctx.editMessageText(adminStatsMessage(usersCount, tasksCount, channelsCount, totalPoints), adminBackKeyboard);
      break;
    }

    case 'admin_add_channel':
      adminStates.set(from.id, { step: 'add_channel_username' });
      await ctx.editMessageText('➕ إضافة قناة جديدة\n\nأرسل معرّف القناة (مثال: @channelname)\n\nأو /cancel للإلغاء.');
      break;

    case 'admin_list_channels': {
      const channels = getActiveChannels();
      if (channels.length === 0) {
        await ctx.editMessageText('📢 لا توجد قنوات مضافة حالياً.', adminChannelsKeyboard);
        break;
      }
      const list = channels.map((c, i) =>
        `${i + 1}. ${c.channel_name} (@${c.channel_username}) — ${c.points_reward} نقطة — ID: ${c.id}`
      ).join('\n');
      const inlineKb = Markup.inlineKeyboard([
        [Markup.button.callback('🗑️ حذف قناة', 'admin_delete_channel')],
        [Markup.button.callback('✏️ تعديل نقاط قناة', 'admin_edit_channel')],
        [Markup.button.callback('🔙 رجوع', 'admin_channels')],
      ]);
      await ctx.editMessageText(`📢 القنوات النشطة:\n\n${list}`, inlineKb);
      break;
    }

    case 'admin_delete_channel':
      adminStates.set(from.id, { step: 'delete_channel_id' });
      await ctx.editMessageText('🗑️ أرسل رقم ID القناة التي تريد حذفها:\n\nأو /cancel للإلغاء.');
      break;

    case 'admin_edit_channel':
      adminStates.set(from.id, { step: 'edit_channel_id' });
      await ctx.editMessageText('✏️ أرسل رقم ID القناة التي تريد تعديل نقاطها:\n\nأو /cancel للإلغاء.');
      break;

    case 'admin_search_user':
      adminStates.set(from.id, { step: 'search_user' });
      await ctx.editMessageText('🔍 أرسل اسم المستخدم أو الـ Telegram ID للبحث:\n\nأو /cancel للإلغاء.');
      break;

    case 'admin_users_count': {
      const count = getUsersCount();
      await ctx.editMessageText(`👥 عدد المستخدمين المسجلين: ${count}`, adminBackKeyboard);
      break;
    }
  }
}

export async function handleAdminTextInput(ctx: Context, text: string): Promise<boolean> {
  const from = ctx.from;
  if (!from || !isAdmin(from.id)) return false;

  const state = adminStates.get(from.id);
  if (!state) return false;

  // إلغاء
  if (text === '/cancel') {
    clearAdminState(from.id);
    await ctx.reply('🚫 تم الإلغاء.', adminMenuKeyboard);
    return true;
  }

  switch (state.step) {
    case 'add_channel_username': {
      const username = text.startsWith('@') ? text.slice(1) : text;
      adminStates.set(from.id, { step: 'add_channel_name', username });
      await ctx.reply(`✅ المعرّف: @${username}\n\nالآن أرسل اسم القناة (الاسم الظاهر للمستخدمين):`);
      return true;
    }

    case 'add_channel_name': {
      adminStates.set(from.id, { step: 'add_channel_points', username: state.username, name: text });
      await ctx.reply(`✅ الاسم: ${text}\n\nالآن أرسل عدد النقاط التي تُمنح عند الاشتراك:`);
      return true;
    }

    case 'add_channel_points': {
      const points = parseInt(text, 10);
      if (isNaN(points) || points < 1) {
        await ctx.reply('⚠️ أدخل رقماً صحيحاً أكبر من صفر:');
        return true;
      }
      createChannel(state.username, state.name, points, 'admin', null);
      clearAdminState(from.id);
      await ctx.reply(`✅ تم إضافة القناة بنجاح!\n\n📢 @${state.username}\n💰 النقاط: ${points}`, adminMenuKeyboard);
      return true;
    }

    case 'delete_channel_id': {
      const id = parseInt(text, 10);
      if (isNaN(id)) {
        await ctx.reply('⚠️ أدخل رقم ID صحيح:');
        return true;
      }
      deleteChannel(id);
      clearAdminState(from.id);
      await ctx.reply(`✅ تم حذف القناة رقم ${id} بنجاح.`, adminMenuKeyboard);
      return true;
    }

    case 'edit_channel_id': {
      const id = parseInt(text, 10);
      if (isNaN(id)) {
        await ctx.reply('⚠️ أدخل رقم ID صحيح:');
        return true;
      }
      adminStates.set(from.id, { step: 'edit_channel_points', channelId: id });
      await ctx.reply(`✏️ أرسل عدد النقاط الجديد للقناة رقم ${id}:`);
      return true;
    }

    case 'edit_channel_points': {
      const points = parseInt(text, 10);
      if (isNaN(points) || points < 1) {
        await ctx.reply('⚠️ أدخل رقماً صحيحاً أكبر من صفر:');
        return true;
      }
      updateChannelPoints(state.channelId, points);
      clearAdminState(from.id);
      await ctx.reply(`✅ تم تحديث نقاط القناة رقم ${state.channelId} إلى ${points} نقطة.`, adminMenuKeyboard);
      return true;
    }

    case 'search_user': {
      // البحث بالـ Telegram ID أو اسم المستخدم
      let user = null;
      const numId = parseInt(text, 10);
      if (!isNaN(numId)) {
        user = searchUserByTelegramId(numId);
      }
      if (!user) {
        user = searchUserByUsername(text.replace('@', ''));
      }

      clearAdminState(from.id);

      if (!user) {
        await ctx.reply('❌ لم يتم العثور على المستخدم.', adminMenuKeyboard);
        return true;
      }

      const completedTasks = getUserCompletedTasksCount(user.id);
      await ctx.reply(adminUserInfoMessage(user, completedTasks), adminMenuKeyboard);
      return true;
    }
  }

  return false;
}
