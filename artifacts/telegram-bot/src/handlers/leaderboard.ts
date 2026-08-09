import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { getUserByTelegramId, getTopUsers, getUserRank } from '../db/queries.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function rankEmoji(n: number): string {
  return MEDALS[n - 1] ?? `${n}.`;
}

function shortName(user: { first_name: string; last_name?: string | null; username?: string | null }): string {
  const full = (user.first_name + (user.last_name ? ` ${user.last_name}` : '')).trim();
  // اقتصر على 18 حرفاً لتجنب الفوضى
  return full.length > 18 ? full.slice(0, 17) + '…' : full;
}

function formatPts(n: number): string {
  return n.toLocaleString('ar-EG');
}

export async function handleLeaderboard(ctx: Context): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const [me, top] = await Promise.all([
    getUserByTelegramId(from.id),
    getTopUsers(10),
  ]);

  if (!top.length) {
    await ctx.reply('🏆 لا يوجد مستخدمون بعد!', {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'leaderboard_close')]]).reply_markup,
    });
    return;
  }

  const lines = top.map((u, i) => {
    const pos = i + 1;
    const medal = rankEmoji(pos);
    const name = shortName(u as any);
    const pts = formatPts(u.points);
    return `${medal} <b>${name}</b> — <b>${pts}</b> نقطة`;
  });

  let myRankLine = '';
  if (me) {
    const myRank = await getUserRank(me.id);
    const isInTop = myRank <= top.length;
    if (!isInTop) {
      myRankLine = `\n─────────────────\n🔥 ترتيبك الحالي: <b>#${myRank}</b> — ${formatPts(me.points)} نقطة`;
    } else {
      myRankLine = `\n─────────────────\n✨ أنت في المتصدرين! ترتيبك: <b>#${myRank}</b>`;
    }
  }

  const text =
    `🏆 <b>المتصدرون — أفضل 10 مستخدمين</b>\n\n` +
    lines.join('\n') +
    myRankLine;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 تحديث', 'leaderboard_refresh')],
  ]);

  if (ctx.callbackQuery) {
    await (ctx as any).editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
    await ctx.answerCbQuery();
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
  }
}
