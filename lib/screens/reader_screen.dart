import 'package:flutter/material.dart';
import '../models/book.dart';
import '../services/storage_service.dart';

class ReaderScreen extends StatefulWidget {
  final Book book;
  final int startIndex;
  final Future<void> Function()? onPrefsChanged;

  const ReaderScreen({
    super.key,
    required this.book,
    required this.startIndex,
    this.onPrefsChanged,
  });

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  late int _index;
  bool _bookmarked = false;

  final _noteController = TextEditingController();
  bool _noteSaved = true;

  Chapter get _chapter => widget.book.chapters[_index];

  @override
  void initState() {
    super.initState();
    _index = widget.startIndex;
    _loadState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await StorageService.setLastChapterId(_chapter.id);
      await widget.onPrefsChanged?.call();
    });
  }

  Future<void> _loadState() async {
    final bm = await StorageService.isBookmarked(_chapter.id);
    final note = await StorageService.getNote(_chapter.id);
    setState(() {
      _bookmarked = bm;
      _noteController.text = note;
      _noteSaved = true;
    });
  }

  Future<void> _toggleBookmark() async {
    await StorageService.toggleBookmark(_chapter.id);
    final bm = await StorageService.isBookmarked(_chapter.id);
    setState(() => _bookmarked = bm);
    await widget.onPrefsChanged?.call();
  }

  Future<void> _saveNote() async {
    await StorageService.setNote(_chapter.id, _noteController.text);
    setState(() => _noteSaved = true);
  }

  Future<void> _goTo(int newIndex) async {
    if (newIndex < 0 || newIndex >= widget.book.chapters.length) return;

    setState(() {
      _index = newIndex;
      _bookmarked = false;
      _noteController.text = '';
      _noteSaved = true;
    });

    await StorageService.setLastChapterId(_chapter.id);
    await widget.onPrefsChanged?.call();
    await _loadState();
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ch = _chapter;
    final progress = (_index + 1) / widget.book.chapters.length;

    return Scaffold(
      appBar: AppBar(
        title: Text(ch.title),
        actions: [
          IconButton(
            tooltip: _bookmarked ? 'Remove Bookmark' : 'Bookmark',
            onPressed: _toggleBookmark,
            icon: Icon(_bookmarked ? Icons.bookmark : Icons.bookmark_border),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [  LinearProgressIndicator(value: progress),
  const SizedBox(height: 10),
  Text(
    '${_index + 1} of ${widget.book.chapters.length}',
    style: Theme.of(context).textTheme.bodySmall,
  ),
  const SizedBox(height: 14),
          Text(
            ch.content,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.45),
          ),
          const SizedBox(height: 18),
          Text('Notes', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            controller: _noteController,
            maxLines: 6,
            decoration: InputDecoration(
              border: const OutlineInputBorder(),
              hintText: 'Write your notes for this chapter...',
              suffixIcon: _noteSaved
                  ? const Icon(Icons.check)
                  : const Icon(Icons.edit),
            ),
            onChanged: (_) => setState(() => _noteSaved = false),
          ),
          const SizedBox(height: 10),
          ElevatedButton.icon(
            onPressed: _saveNote,
            icon: const Icon(Icons.save),
            label: const Text('Save Note'),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _index == 0 ? null : () => _goTo(_index - 1),
                  icon: const Icon(Icons.chevron_left),
                  label: const Text('Previous'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _index == widget.book.chapters.length - 1
                      ? null
                      : () => _goTo(_index + 1),
                  icon: const Icon(Icons.chevron_right),
                  label: const Text('Next'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}