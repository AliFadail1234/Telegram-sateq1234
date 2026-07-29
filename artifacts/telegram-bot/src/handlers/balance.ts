import type { Context } from 'telegraf';
import { getUserByTelegramId, getUserCompletedTasksCount, getUserCampaignsCount } from '../db/queries.js';
import { balanceMessage } from '../utils/messages.js';

export async function handleBalance(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ لم يتم العثور على حسابك. أرسل /start للتسجيل.');
    return;
  }

  const completedTasks = getUserCompletedTasksCount(user.id);
  const campaigns = getUserCampaignsCount(user.id);

  await ctx.reply(balanceMessage(user, completedTasks, campaigns));
}
