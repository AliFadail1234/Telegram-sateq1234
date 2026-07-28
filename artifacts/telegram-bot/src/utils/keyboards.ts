import { Markup } from 'telegraf';

// القائمة الرئيسية
export const mainMenuKeyboard = Markup.keyboard([
  ['📊 رصيدي', '⭐ كسب نقاط'],
  ['📢 ترويج قناتي', '👤 حسابي'],
]).resize();

// لوحة مفاتيح الأدمن الرئيسية
export const adminMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📢 إدارة القنوات', 'admin_channels')],
  [Markup.button.callback('👥 إدارة المستخدمين', 'admin_users')],
  [Markup.button.callback('📊 الإحصائيات', 'admin_stats')],
]);

// إدارة القنوات للأدمن
export const adminChannelsKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('➕ إضافة قناة', 'admin_add_channel')],
  [Markup.button.callback('📋 قائمة القنوات', 'admin_list_channels')],
  [Markup.button.callback('🔙 رجوع', 'admin_back')],
]);

// إدارة المستخدمين للأدمن
export const adminUsersKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔍 البحث عن مستخدم', 'admin_search_user')],
  [Markup.button.callback('📊 عدد المستخدمين', 'admin_users_count')],
  [Markup.button.callback('🔙 رجوع', 'admin_back')],
]);

// زر رجوع للأدمن
export const adminBackKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔙 رجوع للقائمة', 'admin_back')],
]);

// زر التحقق من الاشتراك
export function subscribeCheckKeyboard(channelUsername: string, channelId: number) {
  const username = channelUsername.startsWith('@') ? channelUsername : `@${channelUsername}`;
  return Markup.inlineKeyboard([
    [Markup.button.url(`📢 اشترك في القناة`, `https://t.me/${username.replace('@', '')}`)],
    [Markup.button.callback('✅ تحقق من الاشتراك', `check_sub_${channelId}`)],
  ]);
}
