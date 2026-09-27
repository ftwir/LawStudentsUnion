import 'package:flutter/material.dart';
class AdminLanguageController extends ValueNotifier<Locale> {
  AdminLanguageController() : super(const Locale('en'));
  void toggle() => value = Locale(value.languageCode == 'en' ? 'ar' : 'en');
  bool get ar => value.languageCode == 'ar';
}
class AdminLanguageScope extends InheritedNotifier<AdminLanguageController> {
  const AdminLanguageScope({super.key, required AdminLanguageController controller, required super.child}) : super(notifier: controller);
  static AdminLanguageController of(BuildContext c) => c.dependOnInheritedWidgetOfExactType<AdminLanguageScope>()!.notifier!;
}
class AdminL10n {
  static const en = {'title':'Union Admin Command Center','subtitle':'Agent / Administrator sign in','users':'Users','permissions':'Permissions','hubs':'Hubs','audit':'Audit','mfa':'MFA','username':'Username','password':'Password','signIn':'Sign in','signing':'Signing in…','language':'العربية','serverError':'Unable to contact the server. Check your connection and try again.'};
  static const ar = {'title':'مركز إدارة اتحاد الطلبة','subtitle':'تسجيل دخول الوكيل / المدير','users':'الأعضاء','permissions':'الصلاحيات','hubs':'المجتمعات','audit':'السجل','mfa':'MFA','username':'اسم المستخدم','password':'كلمة المرور','signIn':'تسجيل الدخول','signing':'جارٍ الدخول…','language':'English','serverError':'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.'};
  static String t(BuildContext c, String k) => (AdminLanguageScope.of(c).ar ? ar : en)[k] ?? k;
}
