import 'package:flutter/material.dart';
import '../models/book.dart';
import '../services/content_service.dart';
import '../services/storage_service.dart';
import 'reader_screen.dart';

class HomeScreen extends StatefulWidget {
  final bool darkMode;
  final Future<void> Function(bool) onDarkModeChanged;

  const HomeScreen({
    super.key,
    required this.darkMode,
    required this.onDarkModeChanged,
  });

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<Book> _future;
  int? _lastChapterId;
  List<int> _bookmarks = [];

  @override
  void initState() {
    super.initState();
    _future = ContentService.loadBook();
    _loadPrefs();
  }

  Future<void> _loadPrefs() async {
    final last = await StorageService.getLastChapterId();
    final bms = await StorageService.getBookmarks();
    setState(() {
      _lastChapterId = last;
      _bookmarks = bms;
    });
  }

  void _openChapter(Book book, int chapterId) {
    final idx = book.chapters.indexWhere((c) => c.id == chapterId);
    if (idx < 0) return;

    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReaderScreen(
          book: book,
          startIndex: idx,
          onPrefsChanged: _loadPrefs,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Book>(
      future: _future,
      builder: (context, snap) {
        if (!snap.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final book = snap.data!;

        return Scaffold(
          appBar: AppBar(
            title: Text(book.title),
            actions: [
              Row(
                children: [
                  const Text('Dark'),
                  Switch(
                    value: widget.darkMode,
                    onChanged: (v) => widget.onDarkModeChanged(v),
                  ),
                ],
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(book.subtitle, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 6),
              Text('by ${book.author}'),
              const SizedBox(height: 18),

              if (_lastChapterId != null)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.play_circle),
                    title: const Text('Continue'),
                    subtitle: Text(
  book.chapters.firstWhere((c) => c.id == _lastChapterId!).title,
),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _openChapter(book, _lastChapterId!),
                  ),
                ),

              const SizedBox(height: 12),

              ElevatedButton.icon(
                onPressed: () => _openChapter(book, book.chapters.first.id),
                icon: const Icon(Icons.menu_book),
                label: const Text('Start Reading'),
              ),

              const SizedBox(height: 18),

              if (_bookmarks.isNotEmpty) ...[
                Text('Bookmarks', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                ..._bookmarks.map((id) {
                  final ch = book.chapters.firstWhere(
                    (c) => c.id == id,
                    orElse: () => Chapter(id: id, title: 'Chapter $id', content: ''),
                  );
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.bookmark),
                      title: Text(ch.title),
                      subtitle: Text('ID ${ch.id}'),
                      onTap: () => _openChapter(book, ch.id),
                    ),
                  );
                }),
                const SizedBox(height: 18),
              ],

              Text('Table of Contents', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              ...book.chapters.map((ch) {
                final label = ch.id == 0
                    ? 'Foreword'
                    : (ch.id == 1 ? 'Introduction' : 'Chapter ${ch.id - 1}');
                return Card(
                  child: ListTile(
                    title: Text(ch.title),
                    subtitle: Text(label),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _openChapter(book, ch.id),
                  ),
                );
              }),
            ],
          ),
        );
      },
    );
  }
}