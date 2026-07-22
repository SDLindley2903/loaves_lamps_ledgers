import 'package:flutter/material.dart';

import '../../services/storage_service.dart';
import 'three_jars_game.dart';

/// The kids landing screen — bright, friendly, and read-aloud in spirit.
/// For the first release it offers one game: The Three Jars.
class KidsHomeScreen extends StatefulWidget {
  const KidsHomeScreen({super.key});

  @override
  State<KidsHomeScreen> createState() => _KidsHomeScreenState();
}

class _KidsHomeScreenState extends State<KidsHomeScreen> {
  int _stickers = 0;

  @override
  void initState() {
    super.initState();
    _loadStickers();
  }

  Future<void> _loadStickers() async {
    final list = await StorageService.getStickers();
    if (!mounted) return;
    setState(() => _stickers = list.length);
  }

  Future<void> _playThreeJars() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const ThreeJarsGame()),
    );
    _loadStickers();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(title: const Text('Kids Corner')),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: isDark
                ? const [Color(0xFF1B2430), Color(0xFF11161D)]
                : const [Color(0xFFFFF6E4), Color(0xFFFDEFD3)],
          ),
        ),
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              // Mascot greeting
              Center(
                child: Container(
                  width: 96,
                  height: 96,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFFC9791E).withOpacity(0.18),
                    border:
                        Border.all(color: const Color(0xFFC9791E), width: 3),
                  ),
                  alignment: Alignment.center,
                  child: const Text('🪔', style: TextStyle(fontSize: 52)),
                ),
              ),
              const SizedBox(height: 16),
              Center(
                child: Text(
                  'Hi, friend!',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
              const SizedBox(height: 6),
              Center(
                child: Text(
                  "Let's learn about money together.",
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              const SizedBox(height: 20),

              // Sticker count
              Card(
                child: ListTile(
                  leading: const Text('⭐', style: TextStyle(fontSize: 26)),
                  title: const Text('My Stickers'),
                  trailing: Text(
                    '$_stickers',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // The game card
              _GameCard(
                emoji: '🫙',
                title: 'The Three Jars',
                subtitle: 'Sort coins into Give, Save, and Spend.',
                onPlay: _playThreeJars,
              ),

              const SizedBox(height: 12),

              // Coming soon (teases the roadmap without promising)
              Opacity(
                opacity: 0.6,
                child: Card(
                  child: ListTile(
                    leading: const Text('🍞', style: TextStyle(fontSize: 26)),
                    title: const Text('Bread Line'),
                    subtitle: const Text('Coming soon!'),
                    trailing: const Icon(Icons.lock_outline),
                  ),
                ),
              ),
              Opacity(
                opacity: 0.6,
                child: Card(
                  child: ListTile(
                    leading: const Text('🔦', style: TextStyle(fontSize: 26)),
                    title: const Text('Light the Path'),
                    subtitle: const Text('Coming soon!'),
                    trailing: const Icon(Icons.lock_outline),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GameCard extends StatelessWidget {
  final String emoji;
  final String title;
  final String subtitle;
  final VoidCallback onPlay;

  const _GameCard({
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.onPlay,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(emoji, style: const TextStyle(fontSize: 34)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 2),
                      Text(subtitle),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onPlay,
                icon: const Icon(Icons.play_arrow),
                label: const Text('Play'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
