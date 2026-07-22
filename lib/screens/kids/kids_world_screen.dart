import 'package:flutter/material.dart';

import '../../services/storage_service.dart';
import 'kids_art.dart';
import 'three_jars_game.dart';

/// The animated kids' world: a bright cartoon map where a kid explorer
/// visits three places (Treasure Room, Bakery, Lamp Market).
class KidsWorldScreen extends StatefulWidget {
  const KidsWorldScreen({super.key});

  @override
  State<KidsWorldScreen> createState() => _KidsWorldScreenState();
}

class _KidsWorldScreenState extends State<KidsWorldScreen> {
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
    return Scaffold(
      body: AnimatedSky(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
            children: [
              // Sticker badge.
              Align(
                alignment: Alignment.centerRight,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: KidsColors.sun, width: 3),
                  ),
                  child: Text(
                    '⭐ $_stickers',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: KidsColors.ink,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 6),

              // Kid explorer + greeting.
              const Center(child: Bob(child: Text('🧒', style: TextStyle(fontSize: 84)))),
              const SizedBox(height: 8),
              const Center(
                child: SpeechBubble(text: "Hi! Let's explore Coin Town! 🎒"),
              ),
              const SizedBox(height: 22),

              // Places to visit.
              _PlaceCard(
                emoji: '💰',
                title: 'Treasure Room',
                subtitle: 'Play: The Three Jars',
                color: KidsColors.spend,
                ready: true,
                onTap: _playThreeJars,
              ),
              const SizedBox(height: 14),
              _PlaceCard(
                emoji: '🍞',
                title: 'The Bakery',
                subtitle: 'Coming soon!',
                color: KidsColors.give,
                ready: false,
              ),
              const SizedBox(height: 14),
              _PlaceCard(
                emoji: '🪔',
                title: 'Lamp Market',
                subtitle: 'Coming soon!',
                color: KidsColors.save,
                ready: false,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PlaceCard extends StatelessWidget {
  final String emoji;
  final String title;
  final String subtitle;
  final Color color;
  final bool ready;
  final VoidCallback? onTap;

  const _PlaceCard({
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.ready,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(ready ? 0.96 : 0.72),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color, width: 4),
        boxShadow: const [
          BoxShadow(color: Color(0x22000000), blurRadius: 10, offset: Offset(0, 5)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: color.withOpacity(0.18),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(emoji, style: const TextStyle(fontSize: 36)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    color: KidsColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
          if (ready)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(18),
              ),
              child: const Text(
                'PLAY ▶',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 15,
                ),
              ),
            )
          else
            const Padding(
              padding: EdgeInsets.only(right: 6),
              child: Text('🔒', style: TextStyle(fontSize: 26)),
            ),
        ],
      ),
    );

    if (!ready) return Opacity(opacity: 0.9, child: card);

    // Playable cards gently bob and respond to a tap.
    return Bob(
      distance: 4,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: onTap,
          child: card,
        ),
      ),
    );
  }
}
