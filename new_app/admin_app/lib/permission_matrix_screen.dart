import 'package:flutter/material.dart';
import 'api.dart';
import 'localization.dart';

class PermissionMatrixScreen extends StatefulWidget {
  const PermissionMatrixScreen({super.key});
  @override
  State<PermissionMatrixScreen> createState() => _PermissionMatrixState();
}

class _PermissionMatrixState extends State<PermissionMatrixScreen> {
  List<dynamic> data = [];
  final nodes = const [
    'can_delete_posts',
    'can_ban_members',
    'can_host_events',
    'can_pin_announcements',
    'can_approve_membership',
    'can_moderate_chat',
  ];

  Future<void> load() async {
    try {
      final result = await adminApi.permissions();
      if (mounted) setState(() => data = result);
    } catch (_) {}
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: data.map<Widget>((item) {
        return ExpansionTile(
          title: Text((item['admin_username'] ?? '').toString()),
          subtitle: Text(AdminL10n.t(context, 'admin')),
          children: nodes.map<Widget>((node) {
            return SwitchListTile(
              title: Text(node.replaceAll('can_', '').replaceAll('_', ' ')),
              value: item[node] == true,
              onChanged: (value) async {
                await adminApi.setPermission(item['id'], node, value);
                await load();
              },
            );
          }).toList(),
        );
      }).toList(),
    );
  }
}
