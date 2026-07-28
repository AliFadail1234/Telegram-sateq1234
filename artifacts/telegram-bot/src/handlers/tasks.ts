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

export async function handleTasks(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ لم يتم العثور على حسابك. أرسل /start للتسجيل.');
    return;
  }

  const channel = getNextPendingChannel(user.id);
  if (!channel) {
    await ctx.reply(noTasksMessage());
    return;
  }

  await ctx.reply(taskMessage(channel), subscribeCheckKeyboard(channel.channel_username, channel.id));
}

export async function handleCheckSubscription(ctx: Context, channelId: number): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.answerCbQuery('⚠️ لم يتم العثور على حسابك.');
    return;
  }

  // التحقق من أن المهمة لم تُكتمل مسبقاً
  if (hasCompletedTask(user.id, channelId)) {
    await ctx.answerCbQuery('✅ لقد أكملت هذه المهمة مسبقاً!');
    return;
  }

  // جلب بيانات القناة
  const { getChannelById } = await import('../db/queries.js');
  const channel = getChannelById(channelId);
  if (!channel || !channel.is_active) {
    await ctx.answerCbQuery('⚠️ هذه القناة لم تعد متاحة.');
    return;
  }

  // التحقق من الاشتراك عبر Telegram API
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

  // تسجيل المهمة وإضافة النقاط
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
  );

  // عرض المهمة التالية تلقائياً
  const nextChannel = getNextPendingChannel(user.id);
  if (nextChannel) {
    await ctx.reply(
      `⭐ مهمة أخرى متاحة!\n\n${taskMessage(nextChannel)}`,
      subscribeCheckKeyboard(nextChannel.channel_username, nextChannel.id),
    );
  } else {
    await ctx.reply(noTasksMessage());
  }
}
