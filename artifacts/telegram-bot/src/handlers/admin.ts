import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import {
  getUsersCount,
  getChannelsCount,
  getCampaignsCount,
  getTasksCount,
  getTotalPointsCirculated,
  getActiveChannels,
  createChannel,
  deleteChannel,
  updateChannelPoints,
  getUserCompletedTasksCount,
  searchUserByUsername,
  searchUserByTelegramId,
  getActiveCampaigns,
  getCompletedCampaigns,
  getCampaignById,
  stopCampaign,
  deleteCampaignById,
} from '../db/queries.js';
import {
  adminStatsMessage,
  adminUserInfoMessage,
  adminCampaignInfoMessage,
} from '../utils/messages.js';
import {
  adminMenuKeyboard,
  adminChannelsKeyboard,
  adminUsersKeyboard,
  adminCampaignsKeyboard,
  adminBackKeyboard,
  adminCampaignActionsKeyboard,
} from '../utils/keyboards.js';

const ADMIN_ID = parseInt(process.env.ADMIN_ID ?? '0', 10);

export function isAdmin(telegramId: number): boolean {
  return telegramId === ADMIN_ID;
}

// ===== حالات محادثة الأدمن =====

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

// ===== أمر /admin =====

export async function handleAdmin(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from || !isAdmin(from.id)) {
    await ctx.reply('⛔ ليس لديك صلاحية لهذا الأمر.');
    return;
  }
  await ctx.reply('🛠️ لوحة الأدمن\n\nاختر ما تريد إدارته:', adminMenuKeyboard);
}

// ===== معالجة أزرار الأدمن =====

export async function handleAdminCallback(ctx: Context, action: string): Promise<void> {
  const from = ctx.from;
  if (!from || !isAdmin(from.id)) {
    await ctx.answerCbQuery('⛔ ليس لديك صلاحية.');
    return;
  }

  await ctx.answerCbQuery();

  // ===== إيقاف حملة =====
  if (action.startsWith('admin_stop_campaign_')) {
    const id = parseInt(action.replace('admin_stop_campaign_', ''), 10);
    stopCampaign(id);
    const campaign = getCampaignById(id);
    if (campaign) {
      await ctx.editMessageText(adminCampaignInfoMessage(campaign), adminCampaignActionsKeyboard(id, campaign.status));
    } else {
      await ctx.editMessageText('✅ تم إيقاف الحملة.', adminBackKeyboard);
    }
    return;
  }

  // ===== حذف حملة =====
  if (action.startsWith('admin_delete_campaign_')) {
    const id = parseInt(action.replace('admin_delete_campaign_', ''), 10);
    deleteCampaignById(id);
    await ctx.editMessageText('🗑️ تم حذف الحملة بنجاح.', adminCampaignsKeyboard);
    return;
  }

  // ===== عرض حملة واحدة =====
  if (action.startsWith('admin_view_campaign_')) {
    const id = parseInt(action.replace('admin_view_campaign_', ''), 10);
    const campaign = getCampaignById(id);
    if (!campaign) {
      await ctx.editMessageText('❌ الحملة غير موجودة.', adminCampaignsKeyboard);
      return;
    }
    await ctx.editMessageText(adminCampaignInfoMessage(campaign), adminCampaignActionsKeyboard(id, campaign.status));
    return;
  }

  switch (action) {
    case 'admin_back':
      await ctx.editMessageText('🛠️ لوحة الأدمن\n\nاختر ما تريد إدارته:', adminMenuKeyboard);
      break;

    // ===== إدارة القنوات =====
    case 'admin_channels':
      await ctx.editMessageText('📢 إدارة قنوات الأدمن\n\nاختر عملية:', adminChannelsKeyboard);
      break;

    case 'admin_add_channel':
      adminStates.set(from.id, { step: 'add_channel_username' });
      await ctx.editMessageText('➕ إضافة قناة\n\nأرسل معرّف القناة (مثال: @channelname)\n\n/cancel للإلغاء.');
      break;

    case 'admin_list_channels': {
      const channels = getActiveChannels();
      if (channels.length === 0) {
        await ctx.editMessageText('📢 لا توجد قنوات مضافة.', adminChannelsKeyboard);
        break;
      }
      const list = channels.map((c, i) =>
        `${i + 1}. ${c.channel_name} (@${c.channel_username}) — ${c.points_reward} نقطة — ID: ${c.id}`
      ).join('\n');
      await ctx.editMessageText(`📢 القنوات النشطة:\n\n${list}`, Markup.inlineKeyboard([
        [Markup.button.callback('🗑️ حذف قناة', 'admin_delete_channel')],
        [Markup.button.callback('✏️ تعديل نقاط', 'admin_edit_channel')],
        [Markup.button.callback('🔙 رجوع', 'admin_channels')],
      ]));
      break;
    }

    case 'admin_delete_channel':
      adminStates.set(from.id, { step: 'delete_channel_id' });
      await ctx.editMessageText('🗑️ أرسل رقم ID القناة للحذف:\n\n/cancel للإلغاء.');
      break;

    case 'admin_edit_channel':
      adminStates.set(from.id, { step: 'edit_channel_id' });
      await ctx.editMessageText('✏️ أرسل رقم ID القناة لتعديل نقاطها:\n\n/cancel للإلغاء.');
      break;

    // ===== إدارة الحملات =====
    case 'admin_campaigns':
      await ctx.editMessageText('🎯 إدارة الحملات\n\nاختر نوع الحملات:', adminCampaignsKeyboard);
      break;

    case 'admin_active_campaigns': {
      const campaigns = getActiveCampaigns();
      if (campaigns.length === 0) {
        await ctx.editMessageText('🎯 لا توجد حملات نشطة حالياً.', adminCampaignsKeyboard);
        break;
      }
      const buttons = campaigns.map(c => [
        Markup.button.callback(
          `📢 @${c.channel_username} — ${c.completed_subscribers}/${c.target_subscribers}`,
          `admin_view_campaign_${c.id}`
        )
      ]);
      buttons.push([Markup.button.callback('🔙 رجوع', 'admin_campaigns')]);
      await ctx.editMessageText(`🟢 الحملات النشطة (${campaigns.length}):\n\nاختر حملة لإدارتها:`, Markup.inlineKeyboard(buttons));
      break;
    }

    case 'admin_completed_campaigns': {
      const campaigns = getCompletedCampaigns();
      if (campaigns.length === 0) {
        await ctx.editMessageText('✅ لا توجد حملات مكتملة بعد.', adminCampaignsKeyboard);
        break;
      }
      const list = campaigns.map((c, i) =>
        `${i + 1}. @${c.channel_username} — ${c.target_subscribers} مشترك — ${c.points_paid} نقطة`
      ).join('\n');
      await ctx.editMessageText(`✅ الحملات المكتملة (${campaigns.length}):\n\n${list}`, adminCampaignsKeyboard);
      break;
    }

    // ===== إدارة المستخدمين =====
    case 'admin_users':
      await ctx.editMessageText('👥 إدارة المستخدمين\n\nاختر عملية:', adminUsersKeyboard);
      break;

    case 'admin_search_user':
      adminStates.set(from.id, { step: 'search_user' });
      await ctx.editMessageText('🔍 أرسل اسم المستخدم أو الـ Telegram ID:\n\n/cancel للإلغاء.');
      break;

    case 'admin_users_count':
      await ctx.editMessageText(`👥 عدد المستخدمين: ${getUsersCount()}`, adminBackKeyboard);
      break;

    // ===== الإحصائيات =====
    case 'admin_stats': {
      const text = adminStatsMessage(
        getUsersCount(),
        getTasksCount(),
        getChannelsCount(),
        getCampaignsCount(),
        getTotalPointsCirculated(),
      );
      await ctx.editMessageText(text, adminBackKeyboard);
      break;
    }
  }
}

// ===== معالجة النصوص من الأدمن =====

export async function handleAdminTextInput(ctx: Context, text: string): Promise<boolean> {
  const from = ctx.from;
  if (!from || !isAdmin(from.id)) return false;

  const state = adminStates.get(from.id);
  if (!state) return false;

  if (text === '/cancel') {
    clearAdminState(from.id);
    await ctx.reply('🚫 تم الإلغاء.', adminMenuKeyboard);
    return true;
  }

  switch (state.step) {
    case 'add_channel_username': {
      const username = text.replace(/^@/, '').trim();
      if (!username) { await ctx.reply('⚠️ معرّف غير صحيح.'); return true; }
      adminStates.set(from.id, { step: 'add_channel_name', username });
      await ctx.reply(`✅ المعرّف: @${username}\n\nأرسل اسم القناة الظاهر للمستخدمين:`);
      return true;
    }

    case 'add_channel_name': {
      adminStates.set(from.id, { step: 'add_channel_points', username: state.username, name: text });
      await ctx.reply(`✅ الاسم: ${text}\n\nأرسل عدد النقاط التي تُمنح عند الاشتراك:`);
      return true;
    }

    case 'add_channel_points': {
      const points = parseInt(text, 10);
      if (isNaN(points) || points < 1) { await ctx.reply('⚠️ أدخل رقماً أكبر من صفر:'); return true; }
      createChannel(state.username, state.name, points);
      clearAdminState(from.id);
      await ctx.reply(`✅ تمت إضافة القناة!\n\n📢 @${state.username}\n💰 ${points} نقطة`, adminMenuKeyboard);
      return true;
    }

    case 'delete_channel_id': {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply('⚠️ أدخل رقم ID صحيح:'); return true; }
      deleteChannel(id);
      clearAdminState(from.id);
      await ctx.reply(`✅ تم حذف القناة #${id}.`, adminMenuKeyboard);
      return true;
    }

    case 'edit_channel_id': {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply('⚠️ أدخل رقم ID صحيح:'); return true; }
      adminStates.set(from.id, { step: 'edit_channel_points', channelId: id });
      await ctx.reply(`✏️ أرسل عدد النقاط الجديد للقناة #${id}:`);
      return true;
    }

    case 'edit_channel_points': {
      const points = parseInt(text, 10);
      if (isNaN(points) || points < 1) { await ctx.reply('⚠️ أدخل رقماً أكبر من صفر:'); return true; }
      updateChannelPoints(state.channelId, points);
      clearAdminState(from.id);
      await ctx.reply(`✅ تم تحديث نقاط القناة #${state.channelId} إلى ${points}.`, adminMenuKeyboard);
      return true;
    }

    case 'search_user': {
      let user = null;
      const numId = parseInt(text, 10);
      if (!isNaN(numId)) user = searchUserByTelegramId(numId);
      if (!user) user = searchUserByUsername(text.replace('@', ''));
      clearAdminState(from.id);
      if (!user) { await ctx.reply('❌ لم يُعثر على المستخدم.', adminMenuKeyboard); return true; }
      await ctx.reply(adminUserInfoMessage(user, getUserCompletedTasksCount(user.id)), adminMenuKeyboard);
      return true;
    }
  }

  return false;
}
