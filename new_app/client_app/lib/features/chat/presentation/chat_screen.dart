import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../../../core/theme/app_theme.dart';

class ChatScreen extends StatefulWidget {
  final dynamic roomId;
  final String wsBaseUrl;
  final String accessToken;
  const ChatScreen({super.key, required this.roomId, required this.wsBaseUrl, required this.accessToken});
  @override State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final controller = TextEditingController();
  final scrollController = ScrollController();
  final List<Map<String, dynamic>> messages = [];
  WebSocketChannel? channel;
  bool connected = false;
  String? error;

  @override
  void initState() { super.initState(); _connect(); }

  void _connect() {
    final base = widget.wsBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.parse('$base/ws/chat/${widget.roomId}/?token=${Uri.encodeQueryComponent(widget.accessToken)}');
    try {
      channel = WebSocketChannel.connect(uri);
      channel!.stream.listen((event) {
        try {
          final data = jsonDecode(event as String);
          if (!mounted) return;
          setState(() {
            if (data['type'] == 'interactive.update') {
              final i = messages.indexWhere((m) => '${m['id']}' == '${data['id']}');
              if (i >= 0) messages[i] = {...messages[i], 'interactive_payload': data['interactive_payload']};
            } else { messages.add(Map<String, dynamic>.from(data)); }
            connected = true; error = null;
          });
          _scrollToBottom();
        } catch (_) {}
      }, onError: (_) { if (mounted) setState(() { connected = false; error = 'Chat connection failed.'; }); },
      onDone: () { if (mounted) setState(() => connected = false); });
      setState(() => connected = true);
    } catch (_) { setState(() { connected = false; error = 'Unable to connect to chat.'; }); }
  }

  void _sendText() {
    final text = controller.text.trim();
    if (text.isEmpty || channel == null) return;
    channel!.sink.add(jsonEncode({'type': 'chat.message', 'text': text}));
    controller.clear();
  }

  void _createInteractive(String kind) {
    if (channel == null) return;
    final prompts = {
      'poll': {'question': 'Your question', 'options': ['Option A', 'Option B']},
      'quiz': {'question': 'Quiz question', 'options': ['A', 'B', 'C'], 'answer': 'A'},
      'trivia': {'question': 'Trivia question', 'answer': 'Your answer'},
      'flashcard': {'front': 'Question', 'back': 'Answer'},
    };
    channel!.sink.add(jsonEncode({'type': 'interactive.create', 'kind': kind, 'data': prompts[kind]}));
  }

  void _respond(String messageId, dynamic response) {
    channel?.sink.add(jsonEncode({'type': 'interactive.response', 'message_id': messageId, 'response': response}));
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scrollController.hasClients) {
        scrollController.animateTo(scrollController.position.maxScrollExtent, duration: const Duration(milliseconds: 180), curve: Curves.easeOut);
      }
    });
  }

  Widget _interactive(Map<String, dynamic> message) {
    final p = Map<String, dynamic>.from(message['interactive_payload'] ?? {});
    final kind = '${p['kind'] ?? ''}';
    final data = Map<String, dynamic>.from(p['data'] ?? {});
    final options = (data['options'] as List?)?.map((e) => '$e').toList() ?? [];
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(kind.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.accentPrimary)),
      const SizedBox(height: 6), Text('${data['question'] ?? data['front'] ?? 'Interactive card'}'),
      ...options.map((o) => TextButton(onPressed: () => _respond('${message['id']}', o), child: Align(alignment: Alignment.centerLeft, child: Text(o)))),
      if (kind == 'trivia') TextButton(onPressed: () => _respond('${message['id']}', data['answer'] ?? ''), child: const Text('Reveal / answer')),
      if (kind == 'flashcard') TextButton(onPressed: () => _respond('${message['id']}', data['back'] ?? ''), child: const Text('Show answer')),
    ])));
  }

  Widget _message(Map<String, dynamic> m) {
    final interactive = m['interactive_payload'] != null;
    return Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.symmetric(vertical: 5), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (interactive) _interactive(m),
      if (!interactive) Container(padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10), decoration: BoxDecoration(color: AppColors.bgElevated, borderRadius: BorderRadius.circular(14)), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${m['sender'] ?? 'Member'}', style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        const SizedBox(height: 3), Text('${m['text'] ?? ''}'),
      ])),
    ])));
  }

  @override void dispose() { controller.dispose(); scrollController.dispose(); channel?.sink.close(); super.dispose(); }

  @override Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Chat'), actions: [Padding(padding: const EdgeInsets.all(14), child: Icon(Icons.circle, size: 10, color: connected ? Colors.green : Colors.red))]),
    body: Column(children: [
      if (error != null) Padding(padding: const EdgeInsets.all(8), child: Text(error!, style: const TextStyle(color: Colors.redAccent))),
      Expanded(child: messages.isEmpty ? const Center(child: Text('No messages yet. Start the conversation.')) : ListView.builder(controller: scrollController, padding: const EdgeInsets.all(12), itemCount: messages.length, itemBuilder: (_, i) => _message(messages[i]))),
      SingleChildScrollView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 8), child: Row(children: [
        for (final kind in ['poll', 'quiz', 'trivia', 'flashcard']) Padding(padding: const EdgeInsets.only(right: 6), child: OutlinedButton(onPressed: () => _createInteractive(kind), child: Text(kind))),
      ])),
      SafeArea(child: Padding(padding: const EdgeInsets.fromLTRB(8, 6, 8, 8), child: Row(children: [
        Expanded(child: TextField(controller: controller, textInputAction: TextInputAction.send, onSubmitted: (_) => _sendText(), decoration: const InputDecoration(hintText: 'Write a message...'))),
        IconButton(onPressed: _sendText, icon: const Icon(Icons.send, color: AppColors.accentPrimary)),
      ]))),
    ]),
  );
}
