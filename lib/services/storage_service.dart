import 'package:shared_preferences/shared_preferences.dart';

class StorageService {
  static SharedPreferences? _prefs;

  // Keys
  static const _kDarkMode = 'dark_mode';
  static const _kLastChapterId = 'last_chapter_id';
  static const _kBookmarks = 'bookmarks';
  static const _kNotePrefix = 'note_';
  static const _kStickers = 'kids_stickers';
  static const _kAgeGroup = 'kids_age_group';

  // Must be called before anything else
  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  static SharedPreferences get _p {
    final p = _prefs;
    if (p == null) {
      throw StateError('StorageService.init() was not called.');
    }
    return p;
  }

  // Theme
  static Future<bool> getDarkMode() async {
    return _p.getBool(_kDarkMode) ?? false;
  }

  static Future<void> setDarkMode(bool v) async {
    await _p.setBool(_kDarkMode, v);
  }

  // Progress
  static Future<int?> getLastChapterId() async {
    return _p.getInt(_kLastChapterId);
  }

  static Future<void> setLastChapterId(int id) async {
    await _p.setInt(_kLastChapterId, id);
  }

  // Bookmarks
  static Future<List<int>> getBookmarks() async {
    final raw = _p.getStringList(_kBookmarks) ?? <String>[];
    return raw.map((s) => int.tryParse(s)).whereType<int>().toList();
  }

  static Future<bool> isBookmarked(int chapterId) async {
    final list = await getBookmarks();
    return list.contains(chapterId);
  }

  static Future<void> toggleBookmark(int chapterId) async {
    final list = await getBookmarks();
    if (list.contains(chapterId)) {
      list.remove(chapterId);
    } else {
      list.add(chapterId);
    }
    await _p.setStringList(_kBookmarks, list.map((i) => '$i').toList());
  }

  // Notes
  static Future<String> getNote(int chapterId) async {
    return _p.getString('$_kNotePrefix$chapterId') ?? '';
  }

  static Future<void> setNote(int chapterId, String note) async {
    await _p.setString('$_kNotePrefix$chapterId', note);
  }

  // Kids stickers (rewards earned in the kids games)
  static Future<List<String>> getStickers() async {
    return _p.getStringList(_kStickers) ?? <String>[];
  }

  static Future<void> addSticker(String id) async {
    final list = _p.getStringList(_kStickers) ?? <String>[];
    if (!list.contains(id)) {
      list.add(id);
      await _p.setStringList(_kStickers, list);
    }
  }

  // Kids age band (5-6 / 7-8 / 9-10)
  static Future<String?> getAgeGroupId() async {
    return _p.getString(_kAgeGroup);
  }

  static Future<void> setAgeGroupId(String id) async {
    await _p.setString(_kAgeGroup, id);
  }
}
