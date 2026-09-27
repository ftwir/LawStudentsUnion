import 'package:flutter/material.dart';

class LanguageController extends ValueNotifier<Locale> {
  LanguageController() : super(const Locale('en'));
  void toggle() => value = Locale(value.languageCode == 'en' ? 'ar' : 'en');
  bool get isArabic => value.languageCode == 'ar';
}
class LanguageScope extends InheritedNotifier<LanguageController> {
  const LanguageScope({super.key, required LanguageController controller, required super.child}) : super(notifier: controller);
  static LanguageController of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<LanguageScope>()!.notifier!;
}
class L10n {
  static const en = {
    'app':'Law Union','signIn':'Sign In','username':'Username','password':'Password','signing':'Signing in…','language':'العربية',
    'serverError':'Unable to contact the server. Check your connection and try again.','communities':'Communities','share':'Share with the union',
    'publish':'Publish Post','rooms':'Chat Rooms','newRoom':'New group room','createRoom':'Create Room','member':'Member','logout':'Sign out',
    'loadError':'Unable to load community data.','postError':'Post could not be published.','roomError':'Room could not be created.','hubFirst':'Create or join a community hub first.'
  };
  static const ar = {
    'app':'اتحاد طلبة القانون','signIn':'تسجيل الدخول','username':'اسم المستخدم','password':'كلمة المرور','signing':'جارٍ تسجيل الدخول…','language':'English',
    'serverError':'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.','communities':'المجتمعات','share':'شارك مع الاتحاد','publish':'نشر المنشور',
    'rooms':'غرف الدردشة','newRoom':'غرفة جماعية جديدة','createRoom':'إنشاء غرفة','member':'عضو','logout':'تسجيل الخروج',
    'loadError':'تعذر تحميل بيانات المجتمع.','postError':'تعذر نشر المنشور.','roomError':'تعذر إنشاء الغرفة.','hubFirst':'أنشئ أو انضم إلى مجتمع أولاً.'
  };
  static String t(BuildContext c, String k) => (LanguageScope.of(c).isArabic ? ar : en)[k] ?? k;
}
