import type { Context } from 'telegraf';
import {
  getUserByTelegramId,
  getNextPendingChannel,
  hasCompletedTask,
  completeTask,
  addPoints,
  getUserById,
} from '../db/queries.js';
import { subscribeCheckKeyboard } from '../utils/keyboards.js';
import {
  taskMessage,
  noTasksMessage,
  taskCompletedMessage,
  notSubscribedMessage,
} from '../utils/messages.js';
import { showEarnMenu } from '../utils/earn_menu.js';

// عرض قائمة كسب النقاط الرئيسية
export async function handleTasks(ctx: Context): Promise<void> {
  await showEarnMenu(ctx, false);
}

// عرض مهام الاشتراك في القنوات
export async function handleEarnTasks(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.answerCbQuery('⚠️ لم يتم العثور على حسابك.');
    return;
  }

  await ctx.answerCbQuery();

  const channel = getNextPendingChannel(user.id);
  if (!channel) {
    await ctx.editMessageText(noTasksMessage(), {
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 رجوع', callback_data: 'earn_menu' }]],
      },
    });
    return;
  }

  await ctx.editMessageText(taskMessage(channel), subscribeCheckKeyboard(channel.channel_username, channel.id));
}

export async function handleCheckSubscription(ctx: Context, channelId: number): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.answerCbQuery('⚠️ لم يتم العثور على حسابك.');
    return;
  }

  if (hasCompletedTask(user.id, channelId)) {
    await ctx.answerCbQuery('✅ لقد أكملت هذه المهمة مسبقاً!');
    return;
  }

  const { getChannelById } = await import('../db/queries.js');
  const channel = getChannelById(channelId);
  if (!channel || !channel.is_active) {
    await ctx.answerCbQuery('⚠️ هذه القناة لم تعد متاحة.');
    return;
  }

  const username = channel.channel_username.startsWith('@')
    ? channel.channel_username
    : `@${channel.channel_username}`;

  try {
    const member = await ctx.telegram.getChatMember(username, from.id);
    const isSubscribed = ['member', 'administrator', 'creator'].includes(member.status);

    if (!isSubscribed) {
      await ctx.answerCbQuery('❌ لم يتم التحقق من اشتراكك!');
      await ctx.reply(notSubscribedMessage());
      return;
    }
  } catch {
    await ctx.answerCbQuery('⚠️ تعذّر التحقق من الاشتراك. تأكد أن القناة عامة.');
    return;
  }

  const taskRecorded = completeTask(user.id, channelId);
  if (!taskRecorded) {
    await ctx.answerCbQuery('✅ لقد أكملت هذه المهمة مسبقاً!');
    return;
  }

  addPoints(user.id, channel.points_reward);
  const updatedUser = getUserById(user.id)!;

  await ctx.answerCbQuery('✅ تم تسجيل اشتراكك!');
  await ctx.editMessageText(
    taskCompletedMessage(channel.channel_name, channel.points_reward, updatedUser.points),
    {
      reply_markup: {
        inline_keyboard: [[{ text: '🔙 رجوع لكسب النقاط', callback_data: 'earn_menu' }]],
      },
    },
  );

  // عرض المهمة التالية تلقائياً
  const nextChannel = getNextPendingChannel(user.id);
  if (nextChannel) {
    await ctx.reply(
      `⭐ مهمة أخرى متاحة!\n\n${taskMessage(nextChannel)}`,
      subscribeCheckKeyboard(nextChannel.channel_username, nextChannel.id),
    );
  }
}
