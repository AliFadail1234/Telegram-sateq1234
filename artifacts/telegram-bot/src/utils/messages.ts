import type { User, Channel } from '../db/queries.js';

// رسالة الترحيب
export function welcomeMessage(user: User, isNew: boolean): string {
  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  if (isNew) {
    return `👋 أهلاً وسهلاً بك ${name}!\n\nتم تسجيلك بنجاح في البوت.\nيمكنك الآن البدء بكسب النقاط وترويج قنواتك.\n\n✨ رصيدك الحالي: 0 نقطة`;
  }
  return `👋 أهلاً بعودتك ${name}!\n\nاختر ما تريد فعله:`;
}

// رسالة الرصيد
export function balanceMessage(user: User, completedTasks: number, promotedChannels: number): string {
  return `📊 رصيدك\n\n💰 النقاط الحالية: ${user.points} نقطة\n✅ المهام المكتملة: ${completedTasks}\n📢 القنوات المروّجة: ${promotedChannels}`;
}

// رسالة المهمة
export function taskMessage(channel: Channel): string {
  const username = channel.channel_username.startsWith('@') ? channel.channel_username : `@${channel.channel_username}`;
  return `⭐ مهمة جديدة\n\n📢 القناة: ${channel.channel_name}\n🔗 المعرّف: ${username}\n💰 المكافأة: ${channel.points_reward} نقطة\n\nاشترك في القناة ثم اضغط على زر التحقق.`;
}

// رسالة لا توجد مهام
export function noTasksMessage(): string {
  return `⭐ كسب النقاط\n\n😊 أحسنت! لقد أتممت جميع المهام المتاحة حالياً.\nعد لاحقاً لتجد مهام جديدة.`;
}

// رسالة نجاح الاشتراك
export function taskCompletedMessage(channelName: string, points: number, totalPoints: number): string {
  return `✅ تم التحقق من اشتراكك!\n\n📢 القناة: ${channelName}\n💰 تم إضافة: ${points} نقطة\n🏦 رصيدك الكلي: ${totalPoints} نقطة`;
}

// رسالة فشل التحقق
export function notSubscribedMessage(): string {
  return `❌ لم يتم التحقق من اشتراكك.\n\nيرجى الاشتراك في القناة أولاً ثم الضغط على زر التحقق مجدداً.`;
}

// رسالة حساب المستخدم
export function accountMessage(user: User): string {
  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  const username = user.username ? `@${user.username}` : 'غير محدد';
  const date = new Date(user.created_at).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return `👤 حسابي\n\n🆔 المعرّف: ${user.telegram_id}\n👤 الاسم: ${name}\n📛 اسم المستخدم: ${username}\n📅 تاريخ التسجيل: ${date}\n💰 النقاط: ${user.points} نقطة`;
}

// رسالة ترويج القناة - طلب المعرّف
export function promoteAskChannelMessage(points: number): string {
  return `📢 ترويج قناتك\n\n💰 رصيدك الحالي: ${points} نقطة\n\nأرسل معرّف القناة التي تريد ترويجها (مثال: @channelname)\n\nأو اكتب /cancel للإلغاء.`;
}

// رسالة ترويج القناة - طلب النقاط
export function promoteAskPointsMessage(channelUsername: string): string {
  return `📢 ترويج قناة: ${channelUsername}\n\nكم نقطة تريد إنفاقها على الترويج؟\n(الحد الأدنى: 10 نقاط)\n\nأو اكتب /cancel للإلغاء.`;
}

// رسالة نجاح الترويج
export function promoteSuccessMessage(channelUsername: string, points: number, remainingPoints: number): string {
  return `✅ تم ترويج قناتك بنجاح!\n\n📢 القناة: ${channelUsername}\n💰 تم خصم: ${points} نقطة\n🏦 رصيدك المتبقي: ${remainingPoints} نقطة\n\nسيبدأ المستخدمون في رؤية قناتك كمهمة قريباً.`;
}

// رسالة نقاط غير كافية
export function insufficientPointsMessage(current: number, required: number): string {
  return `❌ نقاطك غير كافية!\n\n💰 رصيدك الحالي: ${current} نقطة\n🔴 النقاط المطلوبة: ${required} نقطة\n\nأكمل المزيد من المهام لزيادة رصيدك.`;
}

// رسالة إحصائيات الأدمن
export function adminStatsMessage(usersCount: number, tasksCount: number, channelsCount: number, totalPoints: number): string {
  return `📊 إحصائيات البوت\n\n👥 عدد المستخدمين: ${usersCount}\n✅ إجمالي المهام المكتملة: ${tasksCount}\n📢 عدد القنوات النشطة: ${channelsCount}\n💰 إجمالي النقاط المتداولة: ${totalPoints} نقطة`;
}

// رسالة معلومات المستخدم للأدمن
export function adminUserInfoMessage(user: User, completedTasks: number): string {
  const name = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  const username = user.username ? `@${user.username}` : 'غير محدد';
  return `👤 معلومات المستخدم\n\n🆔 المعرّف: ${user.telegram_id}\n👤 الاسم: ${name}\n📛 اسم المستخدم: ${username}\n💰 النقاط: ${user.points}\n✅ المهام المكتملة: ${completedTasks}\n📅 التسجيل: ${user.created_at}`;
}
