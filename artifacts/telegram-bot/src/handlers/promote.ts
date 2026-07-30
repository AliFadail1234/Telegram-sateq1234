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
} from '../utils/keyboards.js';

type PromoteState =
  | { step: 'waiting_channel' }
  | { step: 'choosing_subscribers'; channelUsername: string; channelName: string };

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

  const keyboard = subscriberChoiceKeyboard(user.points);
  if (!keyboard) {
    await ctx.reply(insufficientPointsMessage(user.points, 10));
    clearPromoteState(from.id);
    return;
  }

  promoteStates.set(from.id, { step: 'choosing_subscribers', channelUsername: channelTag, channelName });
  await ctx.reply(promoteChooseSubscribersMessage(channelName, channelTag, user.points), keyboard);
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

export async function handlePromoteConfirm(ctx: Context, targetSubs: number, cost: number, channelUsername: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const state = promoteStates.get(from.id);
  if (!state || state.step !== 'choosing_subscribers') {
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
