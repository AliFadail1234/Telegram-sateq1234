import type { Context } from 'telegraf';
import { getOrCreateUser } from '../db/queries.js';
import { mainMenuKeyboard } from '../utils/keyboards.js';
import { welcomeMessage } from '../utils/messages.js';

export async function handleStart(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const { user, isNew } = getOrCreateUser(
    from.id,
    from.first_name,
    from.last_name ?? null,
    from.username ?? null,
  );

  await ctx.reply(welcomeMessage(user, isNew), mainMenuKeyboard);
}
