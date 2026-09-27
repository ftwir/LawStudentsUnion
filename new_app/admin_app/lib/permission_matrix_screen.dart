import 'package:flutter/material.dart';
import 'api.dart';
import 'localization.dart';

class PermissionMatrixScreen extends StatefulWidget {
  const PermissionMatrixScreen({super.key});
  @override State<PermissionMatrixScreen> createState() => _PermissionMatrixState();
}

class _PermissionMatrixState extends State<PermissionMatrixScreen> {
  List<dynamic> data = [];
  final nodes = const [
    'can_delete_posts','can_ban_members','can_host_events',
    'can_pin_announcements','can_approve_membership','can_moderate_chat',
  ];
  final labels = const {
    'can_delete_posts':'Delete posts','can_ban_members':'Ban members',
    'can_host_events':'Host events','can_pin_announcements':'Pin announcements',
    'can_approve_membership':'Approve membership','can_moderate_chat':'Moderate chat',
  };

  Future<void> load() async {
    try {
      final x = await adminApi.permissions();
      if (mounted) setState(() => data = x);
    } catch (_) {}
  }

  @override void initState() { super.initState(); load(); }

  @override Widget build(BuildContext context) {
    return ListView(
      children: data.map<Widget>((p) => ExpansionTile(
        title: Text((p['admin_username'] ?? '').toString()),
        subtitle: Text(AdminL10n.t(context, 'admin')),
        children: nodes.map((n) => SwitchListTile(
          title: Text(labels[n]!),
          value: p[n] == true,
          onChanged: (v) async {
            await adminApi.setPermission(p['id'], n, v);
            await load();
          },
        )).toList(),
      )).toList(),
    );
  }
}