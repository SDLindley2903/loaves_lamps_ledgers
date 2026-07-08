class Chapter {
  final int id;
  final String title;
  final String content;

  Chapter({required this.id, required this.title, required this.content});

  factory Chapter.fromJson(Map<String, dynamic> json) {
    return Chapter(
      id: json['id'] as int,
      title: json['title'] as String,
      content: json['content'] as String,
    );
  }
}

class Book {
  final String title;
  final String subtitle;
  final String author;
  final List<Chapter> chapters;

  Book({
    required this.title,
    required this.subtitle,
    required this.author,
    required this.chapters,
  });

  factory Book.fromJson(Map<String, dynamic> json) {
    final chaptersJson = (json['chapters'] as List).cast<Map<String, dynamic>>();
    return Book(
      title: json['title'] as String,
      subtitle: json['subtitle'] as String,
      author: json['author'] as String,
      chapters: chaptersJson.map((c) => Chapter.fromJson(c)).toList(),
    );
  }
}