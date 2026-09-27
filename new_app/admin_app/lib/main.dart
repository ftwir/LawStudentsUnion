import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'api.dart';
import 'localization.dart';
import 'user_management_screen.dart';
import 'permission_matrix_screen.dart';
import 'hub_configurator_screen.dart';
import 'audit_log_screen.dart';
import 'mfa_setup_screen.dart';

void main() => runApp(AdminLanguageScope(
  controller: AdminLanguageController(),
  child: const AdminApp(),
));

class AdminApp extends StatelessWidget {
  const AdminApp({super.key});
  @override
  Widget build(BuildContext context) {
    final language = AdminLanguageScope.of(context);
    return ValueListenableBuilder<Locale>(
      valueListenable: language,
      builder: (context, locale, _) => MaterialApp(
        title: locale.languageCode == 'ar' ? 'مركز إدارة اتحاد الطلبة' : 'Union Admin Command Center',
        debugShowCheckedModeBanner: false,
        locale: locale,
        supportedLocales: const [Locale('en'), Locale('ar')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: ThemeData.dark(useMaterial3: true).copyWith(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF8B5CF6),
            brightness: Brightness.dark,
          ),
        ),
        home: const AdminLogin(),
      ),
    );
  }
}

class AdminLogin extends StatefulWidget {
  const AdminLogin({super.key});
  @override State<AdminLogin> createState() => _AdminLoginState();
}

class _AdminLoginState extends State<AdminLogin> {
  final u = TextEditingController();
  final p = TextEditingController();
  final o = TextEditingController();
  bool mfa = false, busy = false;
  String? error;

  String tr(String en, String ar) =>
      AdminLanguageScope.of(context).ar ? ar : en;

  Future<void> login() async {
    setState(() { busy = true; error = null; });
    try {
      await adminApi.login(
        u.text.trim(),
        p.text,
        otp: mfa ? o.text.trim() : null,
      );
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const CommandCenter()),
        );
      }
    } on MfaNeeded {
      setState(() {
        mfa = true;
        error = tr(
          'Enter the 6-digit code from your authenticator app.',
          'أدخل رمز التحقق المكوّن من 6 أرقام من تطبيق المصادقة.',
        );
      });
    } on AuthFailed catch (e) {
      setState(() => error = e.message);
    } catch (_) {
      setState(() => error = tr(
        'Unable to contact the server. Check your connection and try again.',
        'تعذر الاتصال بالخادم. تحقق من اتصالك وحاول مرة أخرى.',
      ));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = AdminLanguageScope.of(context).ar;
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        body: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(26),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Align(
                        alignment: isAr ? Alignment.centerLeft : Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: () => AdminLanguageScope.of(context).toggle(),
                          icon: const Icon(Icons.language),
                          label: Text(AdminL10n.t(context, 'language')),
                        ),
                      ),
                      const Icon(Icons.balance, size: 58, color: Color(0xFF8B5CF6)),
                      const SizedBox(height: 10),
                      Text(
                        tr('Union Admin Command Center', 'مركز إدارة اتحاد الطلبة'),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 23, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        tr('Agent / Administrator sign in', 'تسجيل دخول الوكيل / المدير'),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 22),
                      TextField(
                        controller: u,
                        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
                        decoration: InputDecoration(
                          labelText: AdminL10n.t(context, 'username'),
                          prefixIcon: const Icon(Icons.person_outline),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: p,
                        obscureText: true,
                        decoration: InputDecoration(
                          labelText: AdminL10n.t(context, 'password'),
                          prefixIcon: const Icon(Icons.lock_outline),
                        ),
                      ),
                      if (mfa) ...[
                        const SizedBox(height: 12),
                        TextField(
                          controller: o,
                          keyboardType: TextInputType.number,
                          maxLength: 6,
                          decoration: InputDecoration(
                            labelText: tr('Authenticator code', 'رمز تطبيق المصادقة'),
                            helperText: tr('6 digits', '6 أرقام'),
                            prefixIcon: const Icon(Icons.shield_outlined),
                          ),
                        ),
                      ],
                      if (error != null) ...[
                        const SizedBox(height: 8),
                        Align(
                          alignment: Alignment.center,
                          child: Text(
                            error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.redAccent),
                          ),
                        ),
                      ],
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          onPressed: busy ? null : login,
                          icon: const Icon(Icons.login),
                          label: Text(
                            busy
                                ? AdminL10n.t(context, 'signing')
                                : AdminL10n.t(context, 'signIn'),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextButton.icon(
                        onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const BootstrapMfa()),
                        ),
                        icon: const Icon(Icons.qr_code_2),
                        label: Text(AdminL10n.t(context, 'enroll')),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class BootstrapMfa extends StatefulWidget {
  const BootstrapMfa({super.key});
  @override State<BootstrapMfa> createState() => _BootstrapMfaState();
}

class _BootstrapMfaState extends State<BootstrapMfa> {
  final token = TextEditingController();
  final u = TextEditingController();
  final p = TextEditingController();
  final code = TextEditingController();
  String? uri;
  String? msg;
  bool busy = false;

  String tr(String en, String ar) =>
      AdminLanguageScope.of(context).ar ? ar : en;

  Future<void> setup() async {
    setState(() { busy = true; msg = null; });
    try {
      final value = await adminApi.bootstrapMfa(token.text.trim(), u.text.trim(), p.text);
      setState(() {
        uri = value;
        msg = tr(
          'Scan the QR code with Google Authenticator or Microsoft Authenticator.',
          'امسح رمز QR باستخدام Google Authenticator أو Microsoft Authenticator.',
        );
      });
    } on DioException catch (e) {
      final d = e.response?.data;
      setState(() => msg = d is Map
          ? (d['detail'] ?? 'Enrollment failed.').toString()
          : tr('Enrollment failed.', 'فشل إعداد MFA.'));
    } catch (_) {
      setState(() => msg = tr('Enrollment failed.', 'فشل إعداد MFA.'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> confirm() async {
    setState(() { busy = true; msg = null; });
    try {
      await adminApi.bootstrapConfirm(
        token.text.trim(), u.text.trim(), p.text, code.text.trim(),
      );
      setState(() => msg = tr(
        'MFA is enabled. You can now return and sign in with your 6-digit code.',
        'تم تفعيل MFA. يمكنك الآن العودة وتسجيل الدخول باستخدام الرمز المكوّن من 6 أرقام.',
      ));
    } on DioException catch (e) {
      final d = e.response?.data;
      setState(() => msg = d is Map
          ? (d['detail'] ?? 'Invalid code.').toString()
          : tr('Invalid code.', 'الرمز غير صحيح.'));
    } catch (_) {
      setState(() => msg = tr('Invalid code.', 'الرمز غير صحيح.'));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isAr = AdminLanguageScope.of(context).ar;
    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(title: Text(AdminL10n.t(context, 'enroll'))),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              tr(
                'First-time Agent MFA setup',
                'إعداد MFA الأولي للوكيل',
              ),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(tr(
              'Use the bootstrap token configured by the system administrator. It is not the 6-digit MFA code.',
              'استخدم رمز التهيئة الموجود في إعدادات الخادم. هذا الرمز ليس رمز MFA المكوّن من 6 أرقام.',
            )),
            const SizedBox(height: 18),
            TextField(
              controller: token,
              obscureText: true,
              decoration: InputDecoration(
                labelText: tr('Bootstrap token', 'رمز التهيئة'),
                prefixIcon: const Icon(Icons.key),
              ),
            ),
            TextField(
              controller: u,
              decoration: InputDecoration(
                labelText: AdminL10n.t(context, 'username'),
                prefixIcon: const Icon(Icons.person_outline),
              ),
            ),
            TextField(
              controller: p,
              obscureText: true,
              decoration: InputDecoration(
                labelText: AdminL10n.t(context, 'password'),
                prefixIcon: const Icon(Icons.lock_outline),
              ),
            ),
            const SizedBox(height: 14),
            ElevatedButton(
              onPressed: busy ? null : setup,
              child: Text(tr('Generate QR code', 'إنشاء رمز QR')),
            ),
            if (uri != null) ...[
              const SizedBox(height: 20),
              Center(child: QrImageView(data: uri!, size: 230)),
              const SizedBox(height: 8),
              SelectableText(uri!),
              const SizedBox(height: 12),
              TextField(
                controller: code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: InputDecoration(
                  labelText: tr('Authenticator code', 'رمز تطبيق المصادقة'),
                ),
              ),
              ElevatedButton(
                onPressed: busy ? null : confirm,
                child: Text(tr('Confirm and enable MFA', 'تأكيد وتفعيل MFA')),
              ),
            ],
            if (msg != null) ...[
              const SizedBox(height: 12),
              Text(msg!, textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
    );
  }
}

class CommandCenter extends StatefulWidget {
  const CommandCenter({super.key});
  @override State<CommandCenter> createState() => _CommandCenterState();
}

class _CommandCenterState extends State<CommandCenter> {
  int i = 0;
  final pages = const [
    UserManagementScreen(),
    PermissionMatrixScreen(),
    HubConfiguratorScreen(),
    AuditLogScreen(),
    MfaSetupScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: AdminLanguageScope.of(context).ar
          ? TextDirection.rtl
          : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AdminL10n.t(context, 'title')),
          actions: [
            IconButton(
              onPressed: AdminLanguageScope.of(context).toggle,
              icon: const Icon(Icons.language),
            ),
            IconButton(
              onPressed: () => adminApi.logout().then((_) =>
                  Navigator.pushAndRemoveUntil(
                    context,
                    MaterialPageRoute(builder: (_) => const AdminLogin()),
                    (_) => false,
                  )),
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: pages[i],
        bottomNavigationBar: NavigationBar(
          selectedIndex: i,
          onDestinationSelected: (v) => setState(() => i = v),
          destinations: [
            NavigationDestination(icon: const Icon(Icons.people), label: AdminL10n.t(context, 'users')),
            NavigationDestination(icon: const Icon(Icons.security), label: AdminL10n.t(context, 'permissions')),
            NavigationDestination(icon: const Icon(Icons.hub), label: AdminL10n.t(context, 'hubs')),
            NavigationDestination(icon: const Icon(Icons.receipt_long), label: AdminL10n.t(context, 'audit')),
            NavigationDestination(icon: const Icon(Icons.lock), label: AdminL10n.t(context, 'mfa')),
          ],
        ),
      ),
    );
  }
}
