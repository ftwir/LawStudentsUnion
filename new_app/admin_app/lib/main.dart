import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'api.dart';
import 'localization.dart';
import 'user_management_screen.dart';
import 'permission_matrix_screen.dart';
import 'hub_configurator_screen.dart';
import 'audit_log_screen.dart';
import 'mfa_setup_screen.dart';

void main() {
  runApp(AdminLanguageScope(
    controller: AdminLanguageController(),
    child: const AdminApp(),
  ));
}

class AdminApp extends StatelessWidget {
  const AdminApp({super.key});
  @override Widget build(BuildContext context) {
    final language = AdminLanguageScope.of(context);
    return ValueListenableBuilder<Locale>(
      valueListenable: language,
      builder: (context, locale, _) => MaterialApp(
        title: AdminL10n.t(context, 'title'),
        debugShowCheckedModeBanner: false,
        locale: locale,
        supportedLocales: const [Locale('en'), Locale('ar')],
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
  final u = TextEditingController(), p = TextEditingController(), o = TextEditingController();
  bool mfa = false, busy = false;
  String? error;

  Future<void> login() async {
    setState(() => busy = true);
    try {
      await adminApi.login(u.text.trim(), p.text, otp: mfa ? o.text.trim() : null);
      if (mounted) Navigator.pushReplacement(context,
        MaterialPageRoute(builder: (_) => const CommandCenter()));
    } on MfaNeeded {
      setState(() => mfa = true);
    } catch (_) {
      setState(() => error = 'Authentication failed.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: AdminLanguageScope.of(context).toggle,
                    child: Text(AdminL10n.t(context, 'language')),
                  ),
                ),
                const Icon(Icons.balance, size: 52, color: Color(0xFF8B5CF6)),
                Text(AdminL10n.t(context, 'title'),
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                TextField(controller: u, decoration: InputDecoration(labelText: AdminL10n.t(context, 'username'))),
                TextField(controller: p, obscureText: true, decoration: InputDecoration(labelText: AdminL10n.t(context, 'password'))),
                if (mfa) TextField(controller: o, keyboardType: TextInputType.number,
                  maxLength: 6, decoration: const InputDecoration(labelText: 'TOTP')),
                if (error != null) Text(error!, style: const TextStyle(color: Colors.redAccent)),
                const SizedBox(height: 16),
                SizedBox(width: double.infinity,
                  child: ElevatedButton(
                    onPressed: busy ? null : login,
                    child: Text(busy ? AdminL10n.t(context, 'signing') : AdminL10n.t(context, 'signIn')),
                  ),
                ),
                TextButton(
                  onPressed: () => Navigator.push(context,
                    MaterialPageRoute(builder: (_) => const BootstrapMfa())),
                  child: Text(AdminL10n.t(context, 'enroll')),
                ),
              ]),
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
  final token = TextEditingController(), u = TextEditingController(), p = TextEditingController(), code = TextEditingController();
  String? uri, msg;

  Future<void> setup() async {
    try {
      uri = await adminApi.bootstrapMfa(token.text, u.text, p.text);
      setState(() {});
    } catch (_) { setState(() => msg = 'Enrollment request failed.'); }
  }

  Future<void> confirm() async {
    try {
      await adminApi.bootstrapConfirm(token.text, u.text, p.text, code.text);
      setState(() => msg = 'MFA enabled.');
    } catch (_) { setState(() => msg = 'Invalid TOTP code.'); }
  }

  @override Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(AdminL10n.t(context, 'enroll'))),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        TextField(controller: token, obscureText: true, decoration: const InputDecoration(labelText: 'Bootstrap token')),
        TextField(controller: u, decoration: InputDecoration(labelText: AdminL10n.t(context, 'username'))),
        TextField(controller: p, obscureText: true, decoration: InputDecoration(labelText: AdminL10n.t(context, 'password'))),
        ElevatedButton(onPressed: setup, child: const Text('Generate MFA enrollment')),
        if (uri != null) ...[
          QrImageView(data: uri!, size: 220),
          SelectableText(uri!),
          TextField(controller: code, keyboardType: TextInputType.number, maxLength: 6,
            decoration: const InputDecoration(labelText: 'Authenticator code')),
          ElevatedButton(onPressed: confirm, child: const Text('Confirm and enable MFA')),
        ],
        if (msg != null) Text(msg!),
      ]),
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
    UserManagementScreen(), PermissionMatrixScreen(), HubConfiguratorScreen(),
    AuditLogScreen(), MfaSetupScreen(),
  ];
  @override Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AdminL10n.t(context, 'title')),
        actions: [
          IconButton(onPressed: AdminLanguageScope.of(context).toggle, icon: const Icon(Icons.language)),
          IconButton(
            onPressed: () => adminApi.logout().then((_) => Navigator.pushAndRemoveUntil(
              context, MaterialPageRoute(builder: (_) => const AdminLogin()), (_) => false)),
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
    );
  }
}