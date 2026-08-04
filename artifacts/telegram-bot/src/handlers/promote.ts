import type { Context } from 'telegraf';
import {
  getUserByTelegramId,
  getUserById,
  deductPoints,
  createCampaign,
} from '../db/queries.js';
import {
  promoteAskChannelMessage,
  promoteChannelNotFoundMessage,
  promoteBotNotAdminMessage,
  promoteChooseSubscribersMessage,
  promoteConfirmMessage,
  promoteSuccessMessage,
  insufficientPointsMessage,
} from '../utils/messages.js';
import {
  subscriberChoiceKeyboard,
  campaignConfirmKeyboard,
  mainMenuKeyboard,
  promoteAllOrCustomKeyboard,
} from '../utils/keyboards.js';
import { getActivePricingTiers } from '../config/pricing.js';

type PromoteState =
  | { step: 'waiting_channel' }
  | { step: 'choosing_subscribers'; channelUsername: string; channelName: string }
  | { step: 'waiting_custom_number'; channelUsername: string; channelName: string };

const promoteStates = new Map<number, PromoteState>();

export function getPromoteState(telegramId: number): PromoteState | undefined {
  return promoteStates.get(telegramId);
}

export function clearPromoteState(telegramId: number): void {
  promoteStates.delete(telegramId);
}

export async function handlePromote(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ أرسل /start للتسجيل أولاً.');
    return;
  }

  promoteStates.set(from.id, { step: 'waiting_channel' });
  await ctx.reply(promoteAskChannelMessage(user.points));
}

export async function handlePromoteChannelInput(ctx: Context, rawInput: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = await getUserByTelegramId(from.id);
  if (!user) return;

  let username = rawInput.trim();
  if (username.startsWith('https://t.me/')) username = username.replace('https://t.me/', '');
  if (username.startsWith('t.me/')) username = username.replace('t.me/', '');
  username = username.replace(/^@/, '').split('/')[0].trim();

  if (!username || !/^[a-zA-Z0-9_]{5,}$/.test(username)) {
    await ctx.reply('⚠️ معرّف غير صحيح. يجب أن يكون 5 أحرف على الأقل.\n\nمثال: @mychannel\n\nأو /cancel للإلغاء.');
    return;
  }

  const channelTag = `@${username}`;
  const verifyMsg = await ctx.reply(`🔍 جاري التحقق من القناة ${channelTag}...`);

  let channelName = channelTag;

  try {
    const botInfo = await ctx.telegram.getMe();
    const botMember = await ctx.telegram.getChatMember(channelTag, botInfo.id);
    if (!['administrator', 'creator'].includes(botMember.status)) {
      await ctx.telegram.deleteMessage(from.id, verifyMsg.message_id).catch(() => null);
      await ctx.reply(promoteBotNotAdminMessage());
      return;
    }

    try {
      const chat = await ctx.telegram.getChat(channelTag);
      channelName = ('title' in chat && chat.title) ? chat.title : channelTag;
    } catch {
      channelName = channelTag;
    }
  } catch {
    await ctx.telegram.deleteMessage(from.id, verifyMsg.message_id).catch(() => null);
    await ctx.reply(promoteChannelNotFoundMessage());
    return;
  }

  await ctx.telegram.deleteMessage(from.id, verifyMsg.message_id).catch(() => null);

  // جلب جداول التسعير الديناميكية
  const tiers = await getActivePricingTiers();

  // إذا أردنا عرض خيارات فئات جاهزة للمستخدم كما كانت سابقاً
  const choiceKeyboard = subscriberChoiceKeyboard(user.points, tiers);

  // حساب أقل سعر لكل مشترك (rate) لاستخدامه في زر "الترويج بكل النقاط"
  const rates = tiers.map(t => t.points / t.subscribers);
  const rate = Math.min(...rates);
  const maxSubs = Math.max(1, Math.floor(user.points / rate));
  const maxCost = Math.max(1, Math.ceil(maxSubs * rate));

  // استخدم لوحة جديدة تعرض "الترويج بكل النقاط" و"أدخل عدد الأعضاء"
  const allOrCustom = promoteAllOrCustomKeyboard(channelTag, maxSubs, maxCost);

  // إذا لم يكن لدى المستخدم نقاط كافية لأي فئة
  if (!choiceKeyboard && (!allOrCustom)) {
    const minPoints = tiers.length > 0 ? tiers[0].points : 10;
    await ctx.reply(insufficientPointsMessage(user.points, minPoints));
    clearPromoteState(from.id);
    return;
  }

  promoteStates.set(from.id, { step: 'choosing_subscribers', channelUsername: channelTag, channelName });
  // أرسل رسالة الاختيار (نستخدم النص الموجود سابقًا)
  await ctx.reply(promoteChooseSubscribersMessage(channelName, channelTag, user.points), allOrCustom || choiceKeyboard);
}

export async function handlePromoteChoose(ctx: Context, targetSubs: number, cost: number): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const state = promoteStates.get(from.id);
  if (!state || state.step !== 'choosing_subscribers') {
    await ctx.answerCbQuery('⚠️ انتهت الجلسة. ابدأ من جديد.');
    return;
  }

  const user = await getUserByTelegramId(from.id);
  if (!user) return;

  if (user.points < cost) {
    await ctx.answerCbQuery('❌ نقاطك غير كافية!', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    promoteConfirmMessage(state.channelName, state.channelUsername, targetSubs, cost, user.points),
    { reply_markup: campaignConfirmKeyboard(state.channelUsername, targetSubs, cost).reply_markup },
  );
}

export async function handlePromoteAll(ctx: Context, targetSubs: number, cost: number, channelUsername: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const state = promoteStates.get(from.id);
  if (!state || state.step !== 'choosing_subscribers') {
    await ctx.answerCbQuery('⚠️ انتهت الجلسة. ابدأ من جديد.');
    return;
  }

  const user = await getUserByTelegramId(from.id);
  if (!user) return;

  if (user.points < cost) {
    await ctx.answerCbQuery('❌ نقاطك غير كافية!', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery();

  const deducted = await deductPoints(user.id, cost);
  if (!deducted) {
    await ctx.answerCbQuery('❌ فشل خصم النقاط!', { show_alert: true });
    clearPromoteState(from.id);
    return;
  }

  const clean = channelUsername.startsWith('@') ? channelUsername.slice(1) : channelUsername;
  await createCampaign(user.id, clean, state.channelName, targetSubs, cost);

  clearPromoteState(from.id);

  const updatedUser = (await getUserById(user.id))!;
  await ctx.answerCbQuery('✅ تم إنشاء الحملة!');
  await ctx.editMessageText(promoteSuccessMessage(state.channelName, targetSubs, cost, updatedUser.points));
}

export async function handlePromoteCustomStart(ctx: Context, channelUsername: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const state = promoteStates.get(from.id);
  if (!state || state.step !== 'choosing_subscribers') {
    await ctx.answerCbQuery('⚠️ انتهت الجلسة. ابدأ من جديد.');
    return;
  }
  await ctx.answerCbQuery();
  promoteStates.set(from.id, { step: 'waiting_custom_number', channelUsername, channelName: state.channelName });
  await ctx.reply('✏️ أدخل عدد الأعضاء المرغوب (أو أرسل /cancel للإلغاء):');
}

export async function handlePromoteCustomInput(ctx: Context, input: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const state = promoteStates.get(from.id);
  if (!state || state.step !== 'waiting_custom_number') {
    await ctx.reply('⚠️ انتهت الجلسة. ابدأ من جديد.');
    return;
  }

  const user = await getUserByTelegramId(from.id);
  if (!user) return;

  const n = parseInt(input.trim(), 10);
  if (isNaN(n) || n < 1) {
    await ctx.reply('⚠️ أدخل عدداً صحيحاً أكبر من صفر أو /cancel للإلغاء.');
    return;
  }

  const tiers = await getActivePricingTiers();
  const rate = Math.min(...tiers.map(t => t.points / t.subscribers));
  const cost = Math.max(1, Math.ceil(n * rate));

  if (user.points < cost) {
    await ctx.reply(insufficientPointsMessage(user.points, cost));
    clearPromoteState(from.id);
    return;
  }

  const deducted = await deductPoints(user.id, cost);
  if (!deducted) {
    await ctx.reply('❌ فشل خصم النقاط. حاول لاحقاً.');
    clearPromoteState(from.id);
    return;
  }

  const clean = state.channelUsername.startsWith('@') ? state.channelUsername.slice(1) : state.channelUsername;
  await createCampaign(user.id, clean, state.channelName, n, cost);

  clearPromoteState(from.id);
  const updatedUser = (await getUserById(user.id))!;
  await ctx.reply(promoteSuccessMessage(state.channelName, n, cost, updatedUser.points));
}

export async function handlePromoteConfirm(ctx: Context, targetSubs: number, cost: number, channelUsername: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const state = promoteStates.get(from.id);
  if (!state || (state.step !== 'choosing_subscribers' && state.step !== 'waiting_custom_number')) {
    await ctx.answerCbQuery('⚠️ انتهت الجلسة. ابدأ من جديد.');
    return;
  }

  const user = await getUserByTelegramId(from.id);
  if (!user) return;

  const deducted = await deductPoints(user.id, cost);
  if (!deducted) {
    await ctx.answerCbQuery('❌ نقاطك غير كافية!', { show_alert: true });
    clearPromoteState(from.id);
    return;
  }

  const clean = channelUsername.startsWith('@') ? channelUsername.slice(1) : channelUsername;
  await createCampaign(user.id, clean, state.channelName, targetSubs, cost);

  clearPromoteState(from.id);

  const updatedUser = (await getUserById(user.id))!;
  await ctx.answerCbQuery('✅ تم إنشاء الحملة!');
  await ctx.editMessageText(promoteSuccessMessage(state.channelName, targetSubs, cost, updatedUser.points));
}

export async function handlePromoteCancel(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  clearPromoteState(from.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText('🚫 تم إلغاء إنشاء الحملة.');
}
