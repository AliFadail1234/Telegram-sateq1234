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
  getSetting,
  checkPendingReferralOnTask,
} from '../db/queries.js';
import { channelTaskKeyboard } from '../utils/keyboards.js';
import {
  channelTaskMessage,
  campaignTaskMessage,
  noTasksMessage,
  notSubscribedMessage,
} from '../utils/messages.js';
import { showEarnMenu } from '../utils/earn_menu.js';
import { getCampaignSubscriptionPoints } from '../config/pricing.js';

async function buildTaskCompletedText(channelName: string, points: number, total: number): Promise<string> {
  const tmpl = await getSetting('task_complete_msg');
  const def = `✅ تم التحقق من اشتراكك!\n\n📢 {name}\n💰 تمت إضافة: {points} نقطة\n🏦 رصيدك: {total} نقطة`;
  return (tmpl || def)
    .replace(/{name}/g, channelName)
    .replace(/{points}/g, String(points))
    .replace(/{total}/g, String(total));
}

// ========== تتبع المهام المتخطاة لكل مستخدم ==========
const skippedChannels = new Map<number, Set<number>>();
const skippedCampaigns = new Map<number, Set<number>>();

function getSkippedChannels(telegramId: number): Set<number> {
  if (!skippedChannels.has(telegramId)) skippedChannels.set(telegramId, new Set());
  return skippedChannels.get(telegramId)!;
}

function getSkippedCampaigns(telegramId: number): Set<number> {
  if (!skippedCampaigns.has(telegramId)) skippedCampaigns.set(telegramId, new Set());
  return skippedCampaigns.get(telegramId)!;
}

export function clearSkipState(telegramId: number): void {
  skippedChannels.delete(telegramId);
  skippedCampaigns.delete(telegramId);
}

export async function handleTasks(ctx: Context): Promise<void> {
  await showEarnMenu(ctx, false);
}

export async function handleEarnTasks(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.answerCbQuery('⚠️ أرسل /start أولاً.'); return; }

  await ctx.answerCbQuery();

  // إعادة ضبط المتخطيات عند بدء جلسة جديدة للمهام
  clearSkipState(from.id);

  const channel = await getNextPendingChannel(user.id);
  if (channel) {
    await ctx.editMessageText(
      channelTaskMessage(channel),
      { reply_markup: channelTaskKeyboard(channel.channel_username, channel.id, 'channel').reply_markup },
    );
    return;
  }

  const [campaign, campaignPts] = await Promise.all([
    getNextPendingCampaign(user.id),
    getCampaignSubscriptionPoints(),
  ]);
  if (campaign) {
    await ctx.editMessageText(
      campaignTaskMessage(campaign, campaignPts),
      { reply_markup: channelTaskKeyboard(campaign.channel_username, campaign.id, 'campaign').reply_markup },
    );
    return;
  }

  await ctx.editMessageText(noTasksMessage(), {
    reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'earn_menu' }]] },
  });
}

export async function handleSkipChannel(ctx: Context, channelId: number): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.answerCbQuery('⚠️ أرسل /start أولاً.'); return; }

  await ctx.answerCbQuery('⏭️ تم تخطي المهمة');

  // إضافة القناة الحالية لقائمة المتخطيات
  getSkippedChannels(from.id).add(channelId);

  const excludedChannels = [...getSkippedChannels(from.id)];
  const excludedCampaigns = [...getSkippedCampaigns(from.id)];

  // البحث عن قناة أخرى
  const nextChannel = await getNextPendingChannel(user.id, excludedChannels);
  if (nextChannel) {
    await ctx.editMessageText(
      channelTaskMessage(nextChannel),
      { reply_markup: channelTaskKeyboard(nextChannel.channel_username, nextChannel.id, 'channel').reply_markup },
    );
    return;
  }

  // البحث عن حملة
  const [nextCampaign, campaignPts] = await Promise.all([
    getNextPendingCampaign(user.id, excludedCampaigns),
    getCampaignSubscriptionPoints(),
  ]);
  if (nextCampaign) {
    await ctx.editMessageText(
      campaignTaskMessage(nextCampaign, campaignPts),
      { reply_markup: channelTaskKeyboard(nextCampaign.channel_username, nextCampaign.id, 'campaign').reply_markup },
    );
    return;
  }

  await ctx.editMessageText('✅ اكتملت مهامك!\n\nلقد تخطيت جميع المهام المتاحة حالياً.\nعُد لاحقاً لمهام جديدة أو استلم مكافأتك اليومية.', {
    reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع للقائمة', callback_data: 'earn_menu' }]] },
  });
}

export async function handleSkipCampaign(ctx: Context, campaignId: number): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) { await ctx.answerCbQuery('⚠️ أرسل /start أولاً.'); return; }

  await ctx.answerCbQuery('⏭️ تم تخطي المهمة');

  // إضافة الحملة الحالية لقائمة المتخطيات
  getSkippedCampaigns(from.id).add(campaignId);

  const excludedCampaigns = [...getSkippedCampaigns(from.id)];

  // البحث عن حملة أخرى
  const [nextCampaign, campaignPts] = await Promise.all([
    getNextPendingCampaign(user.id, excludedCampaigns),
    getCampaignSubscriptionPoints(),
  ]);
  if (nextCampaign) {
    await ctx.editMessageText(
      campaignTaskMessage(nextCampaign, campaignPts),
      { reply_markup: channelTaskKeyboard(nextCampaign.channel_username, nextCampaign.id, 'campaign').reply_markup },
    );
    return;
  }

  await ctx.editMessageText('✅ اكتملت مهامك!\n\nلقد تخطيت جميع المهام المتاحة حالياً.\nعُد لاحقاً لمهام جديدة أو استلم مكافأتك اليومية.', {
    reply_markup: { inline_keyboard: [[{ text: '🔙 رجوع للقائمة', callback_data: 'earn_menu' }]] },
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
    if (member.status === 'left' || member.status === 'kicked') {
      await ctx.answerCbQuery('❌ لم يتم التحقق من اشتراكك!');
      await ctx.reply(notSubscribedMessage());
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ getChatMember فشل للقناة ${tag}: ${msg}`);
    await ctx.answerCbQuery('⚠️ تعذّر التحقق من اشتراكك حالياً. حاول مجدداً بعد قليل.');
    return;
  }

  if (!await completeTask(user.id, channelId)) {
    await ctx.answerCbQuery('✅ أكملت هذه المهمة مسبقاً!'); return;
  }

  await addPoints(user.id, channel.points_reward);
  const updated = (await getUserById(user.id))!;

  // فحص الدعوة المعلقة — قد تكتمل الآن
  notifyReferrerIfUnlocked(ctx, user.id).catch(() => {});

  await ctx.answerCbQuery('✅ تم تسجيل اشتراكك!');
  await ctx.editMessageText(await buildTaskCompletedText(channel.channel_name, channel.points_reward, updated.points), {
    parse_mode: 'HTML',
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
    if (member.status === 'left' || member.status === 'kicked') {
      await ctx.answerCbQuery('❌ لم يتم التحقق من اشتراكك!');
      await ctx.reply(notSubscribedMessage());
      return;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ getChatMember فشل للحملة ${tag}: ${msg}`);
    await ctx.answerCbQuery('⚠️ تعذّر التحقق من اشتراكك حالياً. حاول مجدداً بعد قليل.');
    return;
  }

  const pointsEarned = await getCampaignSubscriptionPoints();
  const { success, campaignCompleted } = await recordCampaignSubscription(user.id, campaignId, pointsEarned);
  if (!success) {
    await ctx.answerCbQuery('✅ اشتركت في هذه الحملة مسبقاً!'); return;
  }

  const updated = (await getUserById(user.id))!;

  // فحص الدعوة المعلقة
  notifyReferrerIfUnlocked(ctx, user.id).catch(() => {});

  await ctx.answerCbQuery('✅ تم تسجيل اشتراكك!');

  const completedNote = campaignCompleted ? '\n\n🎉 اكتملت هذه الحملة!' : '';
  await ctx.editMessageText(
    (await buildTaskCompletedText(campaign.channel_name, pointsEarned, updated.points)) + completedNote,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '⭐ المهمة التالية', callback_data: 'earn_tasks' }], [{ text: '🔙 القائمة', callback_data: 'earn_menu' }]] } },
  );
}

/** يفحص إذا أتمّ المستخدم المدعو العدد المطلوب من المهام ويُشعر المُحيل */
async function notifyReferrerIfUnlocked(ctx: Context, referredId: number): Promise<void> {
  const reward = await checkPendingReferralOnTask(referredId);
  if (!reward) return;
  try {
    const msgTemplate = await getSetting('referral_notify_msg');
    const defMsg = `🎉 مبروك! اكتملت دعوتك!\n\nأتمّ صديقك المهام المطلوبة.\n💰 تم إضافة {points} نقطة لك.`;
    const text = (msgTemplate || defMsg).replace(/{points}/g, String(reward.points));
    await ctx.telegram.sendMessage(reward.telegramId, text, { parse_mode: 'HTML' });
  } catch { /* تجاهل فشل الإشعار */ }
}
