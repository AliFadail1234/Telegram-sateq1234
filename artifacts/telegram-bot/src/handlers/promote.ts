import type { Context } from 'telegraf';
import {
  getUserByTelegramId,
  createChannel,
  deductPoints,
  getUserById,
} from '../db/queries.js';
import {
  promoteAskChannelMessage,
  promoteAskPointsMessage,
  promoteSuccessMessage,
  insufficientPointsMessage,
} from '../utils/messages.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';

// حالات المحادثة في الذاكرة
type PromoteState =
  | { step: 'waiting_channel' }
  | { step: 'waiting_points'; channelUsername: string };

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

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ لم يتم العثور على حسابك. أرسل /start للتسجيل.');
    return;
  }

  promoteStates.set(from.id, { step: 'waiting_channel' });
  await ctx.reply(promoteAskChannelMessage(user.points));
}

export async function handlePromoteChannelInput(ctx: Context, channelUsername: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) return;

  // تنظيف المعرّف
  const cleanUsername = channelUsername.startsWith('@') ? channelUsername : `@${channelUsername}`;

  promoteStates.set(from.id, { step: 'waiting_points', channelUsername: cleanUsername });
  await ctx.reply(promoteAskPointsMessage(cleanUsername));
}

export async function handlePromotePointsInput(ctx: Context, channelUsername: string, pointsText: string): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) return;

  const points = parseInt(pointsText, 10);

  // التحقق من صحة الرقم
  if (isNaN(points) || points < 10) {
    await ctx.reply('⚠️ الحد الأدنى هو 10 نقاط. أدخل رقماً صحيحاً (10 أو أكثر):');
    return;
  }

  // التحقق من كفاية النقاط
  if (user.points < points) {
    clearPromoteState(from.id);
    await ctx.reply(insufficientPointsMessage(user.points, points), mainMenuKeyboard);
    return;
  }

  // خصم النقاط وإنشاء القناة
  const deducted = deductPoints(user.id, points);
  if (!deducted) {
    clearPromoteState(from.id);
    await ctx.reply(insufficientPointsMessage(user.points, points), mainMenuKeyboard);
    return;
  }

  const cleanUsername = channelUsername.startsWith('@') ? channelUsername.slice(1) : channelUsername;
  createChannel(cleanUsername, channelUsername, points, 'user', user.id);

  clearPromoteState(from.id);

  const updatedUser = getUserById(user.id)!;
  await ctx.reply(
    promoteSuccessMessage(channelUsername, points, updatedUser.points),
    mainMenuKeyboard,
  );
}
