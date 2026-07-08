import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

import '../models/book.dart';

class ContentService {
  static Future<Book> loadBook() async {
    try {
      final raw = await rootBundle.loadString('assets/content/book.json');
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final book = Book.fromJson(decoded);

      // Debug: confirm chapter count and ids
      // This prints in the flutter run terminal.
      // ignore: avoid_print
      print('BOOK LOADED: ${book.title} | chapters=${book.chapters.length}');
      // ignore: avoid_print
      print('CHAPTER IDS: ${book.chapters.map((c) => c.id).toList()}');

      return book;
    } catch (e, st) {
      // ignore: avoid_print
      print('ERROR loading book.json: $e');
      // ignore: avoid_print
      print(st);
      rethrow;
    }
  }

  static Future<List<Map<String, dynamic>>> loadDailyWisdom() async {
    try {
      final raw =
          await rootBundle.loadString('assets/content/daily_wisdom.json');
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded.cast<Map<String, dynamic>>();
      }
      return const [];
    } catch (e, st) {
      // ignore: avoid_print
      print('ERROR loading daily_wisdom.json: $e');
      // ignore: avoid_print
      print(st);
      return const [];
    }
  }
}