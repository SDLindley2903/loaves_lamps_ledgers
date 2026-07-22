import 'package:flutter/material.dart';

import '../../services/storage_service.dart';
import 'age_group.dart';
import 'kids_art.dart';
import 'story_time_screen.dart';
import 'three_jars_game.dart';

/// The animated kids' world. First it asks the child's age band, then shows
/// a bright cartoon map where a kid explorer visits places (Treasure Room,
/// Story Time, and more coming soon). Content adapts to the chosen age.
class KidsWorldScreen extends StatefulWidget {
  const KidsWorldScreen({super.key});

  @override
  State<KidsWorldScreen> createState() => _KidsWorldScreenState();
}

class _KidsWorldScreenState extends State<KidsWorldScreen> {
  bool _loading = true;
  AgeGroup? _age;
  int _stickers = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final id = await StorageService.getAgeGroupId();
    final stickers = await StorageService.getStickers();
    if (!mounted) return;
    setState(() {
      _age = ageGroupFromId(id);
      _stickers = stickers.length;
      _loading = false;
    });
  }

  Future<void> _pickAge(AgeGroup g) async {
    await StorageService.setAgeGroupId(g.id);
    if (!mounted) return;
    setState(() => _age = g);
  }

  void _changeAge() => setState(() => _age = null);

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => screen),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    Widget body;
    if (_loading) {
      body = const SizedBox.shrink();
    } else if (_age == null) {
      body = _AgePicker(onPicked: _pickAge);
    } else {
      body = _World(
        age: _age!,
        stickers: _stickers,
        onChangeAge: _changeAge,
        onPlayJars: () => _open(ThreeJarsGame(age: _age!)),
        onStoryTime: () => _open(StoryTimeScreen(age: _age!)),
      );
    }

    return Scaffold(
      body: AnimatedSky(child: SafeArea(child: body)),
    );
  }
}

/// "How old are you?" — three big friendly buttons.
class _AgePicker extends StatelessWidget {
  final ValueChanged<AgeGroup> onPicked;
  const _AgePicker({required this.onPicked});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
      children: [
        const Center(child: Bob(child: Text('🧒', style: TextStyle(fontSize: 84)))),
        const SizedBox(height: 10),
        const Center(
          child: SpeechBubble(text: 'How old are you? 🎂'),
        ),
        const SizedBox(height: 24),
        for (final g in AgeGroup.values) ...[
          _AgeButton(group: g, onTap: () => onPicked(g)),
          const SizedBox(height: 14),
        ],
      ],
    );
  }
}

class _AgeButton extends StatelessWidget {
  final AgeGroup group;
  final VoidCallback onTap;
  const _AgeButton({required this.group, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Bob(
      distance: 4,
      child: Material(
        color: group.color,
        borderRadius: BorderRadius.circular(26),
        elevation: 4,
        child: InkWell(
          borderRadius: BorderRadius.circular(26),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
            child: Row(
              children: [
                Text(group.emoji, style: const TextStyle(fontSize: 40)),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      group.range,
                      style: const TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      'years old',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Colors.white.withOpacity(0.9),
                      ),
                    ),
                  ],
                ),
                const Spacer(),
                const Text('▶', style: TextStyle(fontSize: 28, color: Colors.white)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The map of places once an age has been chosen.
class _World extends StatelessWidget {
  final AgeGroup age;
  final int stickers;
  final VoidCallback onChangeAge;
  final VoidCallback onPlayJars;
  final VoidCallback onStoryTime;

  const _World({
    required this.age,
    required this.stickers,
    required this.onChangeAge,
    required this.onPlayJars,
    required this.onStoryTime,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
      children: [
        // Age chip (tap to change) + sticker badge.
        Row(
          children: [
            _Chip(
              text: '${age.emoji} ${age.range}',
              onTap: onChangeAge,
              trailingIcon: Icons.edit,
            ),
            const Spacer(),
            _Chip(text: '⭐ $stickers'),
          ],
        ),
        const SizedBox(height: 6),

        Center(child: Bob(child: const Text('🧒', style: TextStyle(fontSize: 84)))),
        const SizedBox(height: 8),
        Center(
          child: SpeechBubble(text: "Hi, ${age.title}! Let's explore Coin Town! 🎒"),
        ),
        const SizedBox(height: 22),

        _PlaceCard(
          emoji: '💰',
          title: 'Treasure Room',
          subtitle: 'Play: The Three Jars',
          color: KidsColors.spend,
          ready: true,
          onTap: onPlayJars,
        ),
        const SizedBox(height: 14),
        _PlaceCard(
          emoji: '🎬',
          title: 'Story Time',
          subtitle: 'Watch: Coins for Sam',
          color: KidsColors.give,
          ready: true,
          onTap: onStoryTime,
        ),
        const SizedBox(height: 14),
        _PlaceCard(
          emoji: '🍞',
          title: 'The Bakery',
          subtitle: 'Coming soon!',
          color: KidsColors.save,
          ready: false,
        ),
        const SizedBox(height: 14),
        _PlaceCard(
          emoji: '🪔',
          title: 'Lamp Market',
          subtitle: 'Coming soon!',
          color: const Color(0xFFB06BFF),
          ready: false,
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  final String text;
  final VoidCallback? onTap;
  final IconData? trailingIcon;
  const _Chip({required this.text, this.onTap, this.trailingIcon});

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: KidsColors.sun, width: 3),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            text,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w900,
              color: KidsColors.ink,
            ),
          ),
          if (trailingIcon != null) ...[
            const SizedBox(width: 4),
            Icon(trailingIcon!, size: 15, color: KidsColors.ink),
          ],
        ],
      ),
    );
    if (onTap == null) return content;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: content,
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
                  style: const TextStyle(
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
                'GO ▶',
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
