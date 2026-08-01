import type { User, Channel, Campaign } from '../db/queries.js';
import type { PricingTier } from '../config/pricing.js';

// ===== الترحيب =====

export function welcomeMessage(user: User, isNew: boolean): string {
  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  if (isNew) {
    return `👋 أهلاً وسهلاً ${name}!\n\nتم تسجيلك بنجاح.\nيمكنك الآن كسب النقاط وترويج قنواتك.\n\n✨ رصيدك الحالي: 0 نقطة`;
  }
  return `👋 أهلاً بعودتك ${name}!\n\nاختر ما تريد فعله:`;
}

// ===== الرصيد =====

export function balanceMessage(user: User, completedTasks: number, campaigns: number): string {
  return `📊 رصيدك\n\n💰 النقاط الحالية: ${user.points} نقطة\n✅ المهام المكتملة: ${completedTasks}\n📢 حملاتك: ${campaigns}`;
}

// ===== مهام قنوات الأدمن =====

export function channelTaskMessage(channel: Channel): string {
  const u = channel.channel_username.startsWith('@') ? channel.channel_username : `@${channel.channel_username}`;
  return `⭐ مهمة — اشتراك في قناة\n\n📢 القناة: ${channel.channel_name}\n🔗 المعرّف: ${u}\n💰 المكافأة: ${channel.points_reward} نقطة\n\nاشترك ثم اضغط تحقق.`;
}

// ===== مهام الحملات =====

export function campaignTaskMessage(campaign: Campaign, pointsReward = 1): string {
  const u = campaign.channel_username.startsWith('@') ? campaign.channel_username : `@${campaign.channel_username}`;
  const remaining = campaign.target_subscribers - campaign.completed_subscribers;
  return `⭐ مهمة — اشتراك في قناة\n\n📢 القناة: ${campaign.channel_name}\n🔗 المعرّف: ${u}\n💰 المكافأة: ${pointsReward} نقطة\n📊 متبقي: ${remaining} مشترك\n\nاشترك ثم اضغط تحقق.`;
}

export function noTasksMessage(): string {
  return `⭐ كسب النقاط\n\n😊 أحسنت! لا توجد مهام متاحة حالياً.\nعد لاحقاً أو استلم مكافأتك اليومية.`;
}

export function taskCompletedMessage(name: string, points: number, total: number): string {
  return `✅ تم التحقق من اشتراكك!\n\n📢 ${name}\n💰 تمت إضافة: ${points} نقطة\n🏦 رصيدك: ${total} نقطة`;
}

export function notSubscribedMessage(): string {
  return `❌ لم يتم التحقق من اشتراكك.\n\nيرجى الاشتراك أولاً ثم اضغط تحقق مجدداً.`;
}

// ===== الحساب =====

export function accountMessage(user: User): string {
  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  const username = user.username ? `@${user.username}` : 'غير محدد';
  const date = new Date(user.created_at).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  return `👤 حسابي\n\n🆔 المعرّف: ${user.telegram_id}\n👤 الاسم: ${name}\n📛 اسم المستخدم: ${username}\n📅 تاريخ التسجيل: ${date}\n💰 النقاط: ${user.points} نقطة`;
}

// ===== الترويج =====

export function promoteAskChannelMessage(points: number): string {
  return `📢 إنشاء حملة ترويج\n\n💰 رصيدك الحالي: ${points} نقطة\n\nأرسل معرّف القناة أو رابطها:\n• مثال: @mychannel\n• أو: https://t.me/mychannel\n\n/cancel للإلغاء.`;
}

export function promoteVerifyingMessage(channelUsername: string): string {
  return `🔍 جاري التحقق من القناة ${channelUsername}...`;
}

export function promoteChannelNotFoundMessage(): string {
  return `❌ تعذّر الوصول إلى القناة.\n\nتأكد من:\n• أن المعرّف صحيح\n• أن القناة عامة (public)\n• أن البوت مضاف كمشرف في القناة\n\nأرسل المعرّف مجدداً أو /cancel للإلغاء.`;
}

export function promoteBotNotAdminMessage(): string {
  return `❌ البوت ليس مشرفاً في هذه القناة.\n\nيجب إضافة البوت كمشرف أولاً حتى يتمكن من التحقق من الاشتراكات.\n\nأضف البوت كمشرف ثم أرسل المعرّف مجدداً، أو /cancel للإلغاء.`;
}

export function promoteChooseSubscribersMessage(channelName: string, channelUsername: string, points: number): string {
  return `📢 إنشاء حملة لـ ${channelName} (${channelUsername})\n\n💰 رصيدك: ${points} نقطة\n\nاختر عدد المشتركين المستهدف:`;
}

export function promoteConfirmMessage(channelName: string, channelUsername: string, targetSubs: number, cost: number, userPoints: number): string {
  const remaining = userPoints - cost;
  return `📋 تأكيد الحملة\n\n📢 القناة: ${channelName}\n🔗 المعرّف: ${channelUsername}\n👥 المشتركون المستهدفون: ${targetSubs}\n💰 التكلفة: ${cost} نقطة\n🏦 رصيدك بعد الخصم: ${remaining} نقطة\n\nهل تريد المتابعة؟`;
}

export function promoteSuccessMessage(channelName: string, targetSubs: number, cost: number, remaining: number): string {
  return `✅ تم إنشاء حملتك بنجاح!\n\n📢 ${channelName}\n👥 المستهدف: ${targetSubs} مشترك\n💰 تم خصم: ${cost} نقطة\n🏦 رصيدك المتبقي: ${remaining} نقطة\n\n⏳ سيتم تنفيذ حملتك تدريجياً حسب نشاط مستخدمي البوت.`;
}

export function insufficientPointsMessage(current: number, required: number): string {
  return `❌ نقاطك غير كافية!\n\n💰 رصيدك: ${current} نقطة\n🔴 المطلوب: ${required} نقطة\n\nأكمل المزيد من المهام لزيادة رصيدك.`;
}

// ===== الأدمن =====

export function adminStatsMessage(users: number, tasks: number, channels: number, campaigns: number, totalPoints: number): string {
  return `📊 إحصائيات البوت\n\n👥 المستخدمون: ${users}\n✅ المهام المكتملة: ${tasks}\n📢 قنوات الأدمن: ${channels}\n🎯 الحملات النشطة: ${campaigns}\n💰 إجمالي النقاط المتداولة: ${totalPoints}`;
}

export function adminUserInfoMessage(user: User, completedTasks: number): string {
  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  const username = user.username ? `@${user.username}` : 'غير محدد';
  return `👤 معلومات المستخدم\n\n🆔 ${user.telegram_id}\n👤 ${name}\n📛 ${username}\n💰 ${user.points} نقطة\n✅ المهام: ${completedTasks}\n📅 ${user.created_at}`;
}

export function adminCampaignInfoMessage(campaign: Campaign): string {
  const progress = Math.round((campaign.completed_subscribers / campaign.target_subscribers) * 100);
  const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
  return `🎯 حملة #${campaign.id}\n\n📢 القناة: @${campaign.channel_username}\n📛 الاسم: ${campaign.channel_name}\n👥 المستهدف: ${campaign.target_subscribers}\n✅ المنفّذ: ${campaign.completed_subscribers}\n📊 التقدم: ${bar} ${progress}%\n💰 النقاط المدفوعة: ${campaign.points_paid}\n🔄 الحالة: ${statusLabel(campaign.status)}\n📅 ${campaign.created_at}`;
}

export function adminPricingMessage(subPoints: number, tiers: PricingTier[]): string {
  const tierLines = tiers.map(t => `  • ${t.subscribers} مشتركين ← ${t.points} نقطة`).join('\n');
  return `⚙️ إعدادات التسعير\n\n💰 نقاط الاشتراك في الحملة: ${subPoints} نقطة\n(المبلغ الذي يحصل عليه المستخدم مقابل كل اشتراك)\n\n📊 جداول التمويل:\n${tierLines}\n(تكلفة الترويج بالنقاط لصاحب القناة)\n\nاختر ما تريد تعديله:`;
}

function statusLabel(status: string): string {
  return status === 'active' ? '🟢 نشطة' : status === 'completed' ? '✅ مكتملة' : '🔴 موقوفة';
}
