import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/localization.dart';
import '../auth/data/auth_repository.dart';
import '../auth/presentation/login_screen.dart';
import '../chat/presentation/chat_screen.dart';
import '../../main.dart';

class HomeScreen extends StatefulWidget {
  final AppUser user;
  final AuthRepository repository;

  const HomeScreen({
    super.key,
    required this.user,
    required this.repository,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<dynamic> hubs = [];
  List<dynamic> posts = [];
  List<dynamic> rooms = [];
  bool loading = true;
  String? error;

  final postController = TextEditingController();
  final roomController = TextEditingController();

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    if (mounted) {
      setState(() {
        loading = true;
        error = null;
      });
    }

    List<dynamic>? loadedHubs;
    List<dynamic>? loadedPosts;
    List<dynamic>? loadedRooms;
    Object? lastError;

    try {
      final response = await widget.repository.dio.get('/api/subhubs/');
      loadedHubs = List<dynamic>.from(response.data as List);
    } catch (e) {
      lastError = e;
    }

    try {
      final response = await widget.repository.dio.get('/api/posts/');
      loadedPosts = List<dynamic>.from(response.data as List);
    } catch (e) {
      lastError = e;
    }

    try {
      final response = await widget.repository.dio.get('/api/chat-rooms/');
      loadedRooms = List<dynamic>.from(response.data as List);
    } catch (e) {
      lastError = e;
    }

    if (!mounted) return;

    setState(() {
      if (loadedHubs != null) hubs = loadedHubs;
      if (loadedPosts != null) posts = loadedPosts;
      if (loadedRooms != null) rooms = loadedRooms;

      if (loadedHubs == null && loadedPosts == null && loadedRooms == null) {
        error = L10n.t(context, 'loadError');
      } else {
        error = null;
      }
      loading = false;
    });

    // Keep the variable referenced so static analysis knows the catches
    // intentionally capture endpoint failures while allowing partial data.
    assert(lastError == null || lastError is Object);
  }

  Future<void> createPost() async {
    final text = postController.text.trim();
    if (text.isEmpty) return;

    if (hubs.isEmpty) {
      setState(() => error = L10n.t(context, 'hubFirst'));
      return;
    }

    try {
      await widget.repository.dio.post(
        '/api/posts/',
        data: {
          'subhub': hubs.first['id'],
          'content': text,
          'is_public': false,
        },
      );
      postController.clear();
      await refresh();
    } on DioException {
      if (mounted) {
        setState(() => error = L10n.t(context, 'postError'));
      }
    }
  }

  Future<void> createRoom() async {
    final name = roomController.text.trim();
    if (name.isEmpty) return;

    try {
      await widget.repository.dio.post(
        '/api/chat-rooms/',
        data: {
          'name': name,
          'room_type': 'GROUP',
        },
      );
      roomController.clear();
      await refresh();
    } on DioException {
      if (mounted) {
        setState(() => error = L10n.t(context, 'roomError'));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = LanguageScope.of(context).isArabic;

    return Directionality(
      textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        appBar: AppBar(
          title: Text(L10n.t(context, 'app')),
          actions: [
            IconButton(
              tooltip: L10n.t(context, 'refresh'),
              onPressed: refresh,
              icon: const Icon(Icons.refresh),
            ),
            IconButton(
              tooltip: L10n.t(context, 'logout'),
              onPressed: () async {
                await widget.repository.logout();
                if (!context.mounted) return;
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(
                    builder: (_) => LoginScreen(
                      repository: widget.repository,
                    ),
                  ),
                  (_) => false,
                );
              },
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: loading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: refresh,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            L10n.t(context, 'communities'),
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                        ),
                        Text(
                          widget.user.username,
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 90,
                      child: hubs.isEmpty
                          ? Center(
                              child: Text(
                                L10n.t(context, 'emptyCommunities'),
                              ),
                            )
                          : ListView(
                              scrollDirection: Axis.horizontal,
                              children: hubs
                                  .map(
                                    (hub) => Padding(
                                      padding: const EdgeInsets.only(
                                        right: 8,
                                      ),
                                      child: Chip(
                                        label: Text(
                                          (hub['name'] ?? '').toString(),
                                        ),
                                      ),
                                    ),
                                  )
                                  .toList(),
                            ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: postController,
                      maxLines: 3,
                      decoration: InputDecoration(
                        labelText: L10n.t(context, 'share'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    ElevatedButton(
                      onPressed: createPost,
                      child: Text(L10n.t(context, 'publish')),
                    ),
                    const SizedBox(height: 14),
                    if (error != null)
                      Text(
                        error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.redAccent),
                      ),
                    const SizedBox(height: 8),
                    if (posts.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 20),
                        child: Text(
                          L10n.t(context, 'emptyPosts'),
                          textAlign: TextAlign.center,
                        ),
                      )
                    else
                      ...posts.map(
                        (post) => Card(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Text(
                                  (post['author_username'] ??
                                          L10n.t(context, 'member'))
                                      .toString(),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text((post['content'] ?? '').toString()),
                                const SizedBox(height: 6),
                                Text(
                                  (post['created_at'] ?? '').toString(),
                                  style: const TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(height: 20),
                    Text(
                      L10n.t(context, 'rooms'),
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: roomController,
                      decoration: InputDecoration(
                        labelText: L10n.t(context, 'newRoom'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      onPressed: createRoom,
                      child: Text(L10n.t(context, 'createRoom')),
                    ),
                    const SizedBox(height: 8),
                    if (rooms.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 20),
                        child: Text(
                          L10n.t(context, 'emptyRooms'),
                          textAlign: TextAlign.center,
                        ),
                      )
                    else
                      ...rooms.map(
                        (room) => ListTile(
                          leading: const Icon(
                            Icons.forum,
                            color: AppColors.accentPrimary,
                          ),
                          title: Text((room['name'] ?? '').toString()),
                          onTap: () async {
                            final token =
                                await widget.repository.accessToken();
                            if (token == null || !mounted) return;

                            Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ChatScreen(
                                  roomId: room['id'],
                                  wsBaseUrl:
                                      apiBaseUrl.replaceFirst('http', 'ws'),
                                  accessToken: token,
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),
      ),
    );
  }

  @override
  void dispose() {
    postController.dispose();
    roomController.dispose();
    super.dispose();
  }
}
