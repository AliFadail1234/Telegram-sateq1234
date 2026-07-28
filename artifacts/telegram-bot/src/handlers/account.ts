import type { Context } from 'telegraf';
import { getUserByTelegramId } from '../db/queries.js';
import { accountMessage } from '../utils/messages.js';

export async function handleAccount(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = getUserByTelegramId(from.id);
  if (!user) {
    await ctx.reply('⚠️ لم يتم العثور على حسابك. أرسل /start للتسجيل.');
    return;
  }

  await ctx.reply(accountMessage(user));
}
