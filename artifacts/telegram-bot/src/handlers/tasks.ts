import type { Context } from 'telegraf';
import {
  getUserByTelegramId,
  getUserById,
  getNextPendingChannel,
  hasCompletedTask,
  completeTask,
  addPoints,
  getNextPendingCampaign,
  hasSubscribedToCampaign,
  recordCampaignSubscription,
  getChannelById,
  getCampaignById,
} from '../db/queries.js';
import { channelTaskKeyboard } from '../utils/keyboards.js';
import {
  channelTaskMessage,
  campaignTaskMessage,
  noTasksMessage,
  taskCompletedMessage,
  notSubscribedMessage,
} from '../utils/messages.js';
import { showEarnMenu } from '../utils/earn_menu.js';
import { POINTS_PER_CAMPAIGN_SUBSCRIPTION } from '../config/pricing.js';

export async function handleTasks(ctx: Context): Promise<void> {
  await showEarnMenu(ctx, false);
}

export async function handleEarnTasks(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.answerCbQuery('⚠️ أرسل /start أولاً.'); return; }

  await ctx.answerCbQuery();

  const channel = await getNextPendingChannel(user.id);
  if (channel) {
    await ctx.editMessageText(
      channelTaskMessage(channel),
      { reply_markup: channelTaskKeyboard(channel.channel_username, channel.id, 'channel').reply_markup },
    );
    return;
  }

  const campaign = await getNextPendingCampaign(user.id);
  if (campaign) {
    await ctx.editMessageText(
      campaignTaskMessage(campaign),
      { reply_markup: channelTaskKeyboard(campaign.channel_username, campaign.id, 'campaign').reply_markup },
    );
    return;
  }

  await ctx.editMessageText(noTasksMessage(), {
    reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'earn_menu' }]] },
  });
}

export async function handleCheckChannel(ctx: Context, channelId: number): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.answerCbQuery('⚠️ أرسل /start أولاً.'); return; }

  if (await hasCompletedTask(user.id, channelId)) {
    await ctx.answerCbQuery('✅ أكملت هذه المهمة مسبقاً!'); return;
  }

  const channel = await getChannelById(channelId);
  if (!channel || !channel.is_active) {
    await ctx.answerCbQuery('⚠️ هذه القناة لم تعد متاحة.'); return;
  }

  const tag = channel.channel_username.startsWith('@') ? channel.channel_username : `@${channel.channel_username}`;

  try {
    const member = await ctx.telegram.getChatMember(tag, from.id);
    if (!['member', 'administrator', 'creator'].includes(member.status)) {
      await ctx.answerCbQuery('❌ لم يتم التحقق من اشتراكك!');
      await ctx.reply(notSubscribedMessage());
      return;
    }
  } catch {
    await ctx.answerCbQuery('⚠️ تعذّر التحقق. تأكد أن القناة عامة وأن البوت مشرف.'); return;
  }

  if (!await completeTask(user.id, channelId)) {
    await ctx.answerCbQuery('✅ أكملت هذه المهمة مسبقاً!'); return;
  }

  await addPoints(user.id, channel.points_reward);
  const updated = (await getUserById(user.id))!;

  await ctx.answerCbQuery('✅ تم تسجيل اشتراكك!');
  await ctx.editMessageText(taskCompletedMessage(channel.channel_name, channel.points_reward, updated.points), {
    reply_markup: { inline_keyboard: [[{ text: '⭐ المهمة التالية', callback_data: 'earn_tasks' }], [{ text: '🔙 القائمة', callback_data: 'earn_menu' }]] },
  });
}

export async function handleCheckCampaign(ctx: Context, campaignId: number): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.answerCbQuery('⚠️ أرسل /start أولاً.'); return; }

  if (await hasSubscribedToCampaign(user.id, campaignId)) {
    await ctx.answerCbQuery('✅ اشتركت في هذه الحملة مسبقاً!'); return;
  }

  const campaign = await getCampaignById(campaignId);
  if (!campaign || campaign.status !== 'active') {
    await ctx.answerCbQuery('⚠️ هذه الحملة لم تعد نشطة.'); return;
  }

  if (campaign.user_id === user.id) {
    await ctx.answerCbQuery('⚠️ لا يمكنك الاشتراك في حملتك الخاصة.'); return;
  }

  const tag = campaign.channel_username.startsWith('@') ? campaign.channel_username : `@${campaign.channel_username}`;

  try {
    const member = await ctx.telegram.getChatMember(tag, from.id);
    if (!['member', 'administrator', 'creator'].includes(member.status)) {
      await ctx.answerCbQuery('❌ لم يتم التحقق من اشتراكك!');
      await ctx.reply(notSubscribedMessage());
      return;
    }
  } catch {
    await ctx.answerCbQuery('⚠️ تعذّر التحقق. تأكد أن القناة عامة وأن البوت مشرف.'); return;
  }

  const { success, campaignCompleted } = await recordCampaignSubscription(user.id, campaignId);
  if (!success) {
    await ctx.answerCbQuery('✅ اشتركت في هذه الحملة مسبقاً!'); return;
  }

  await addPoints(user.id, POINTS_PER_CAMPAIGN_SUBSCRIPTION);
  const updated = (await getUserById(user.id))!;

  await ctx.answerCbQuery('✅ تم تسجيل اشتراكك!');

  const completedNote = campaignCompleted ? '\n\n🎉 اكتملت هذه الحملة!' : '';
  await ctx.editMessageText(
    taskCompletedMessage(campaign.channel_name, POINTS_PER_CAMPAIGN_SUBSCRIPTION, updated.points) + completedNote,
    { reply_markup: { inline_keyboard: [[{ text: '⭐ المهمة التالية', callback_data: 'earn_tasks' }], [{ text: '🔙 القائمة', callback_data: 'earn_menu' }]] } },
  );
}
