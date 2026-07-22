import 'package:flutter/material.dart';

import '../../services/storage_service.dart';
import 'age_group.dart';
import 'kids_art.dart';

/// A short animated "motion storybook" — pictures and characters that fade
/// and bob while a caption tells the story. The wording adapts to the age
/// band. Real spoken narration is planned for a later phase (voice + video
/// on Cloudflare R2); for now the words are shown big with a "voice coming
/// soon" note.
class StoryTimeScreen extends StatefulWidget {
  final AgeGroup age;
  const StoryTimeScreen({super.key, required this.age});

  @override
  State<StoryTimeScreen> createState() => _StoryTimeScreenState();
}

class _Scene {
  final Color bg;
  final String art;
  final Map<AgeGroup, String> text;
  const _Scene({required this.bg, required this.art, required this.text});
}

const _story = <_Scene>[
  _Scene(
    bg: Color(0xFFFFE3EC),
    art: '🧒✨',
    text: {
      AgeGroup.little: 'This is Sam. Sam got 3 shiny coins!',
      AgeGroup.explorer: 'Meet Sam! Today Sam earned 3 shiny gold coins.',
      AgeGroup.builder:
          'Meet Sam. After helping out all week, Sam earned 3 gold coins.',
    },
  ),
  _Scene(
    bg: Color(0xFFFFE0E6),
    art: '💗',
    text: {
      AgeGroup.little: 'Sam gave 1 coin to help a friend. Giving is kind!',
      AgeGroup.explorer:
          'Sam GAVE one coin to help a friend in need. Giving feels good!',
      AgeGroup.builder:
          'First, Sam chose to GIVE one coin to help someone. A generous heart is a happy heart.',
    },
  ),
  _Scene(
    bg: Color(0xFFDFF6E6),
    art: '🐷',
    text: {
      AgeGroup.little: 'Sam saved 1 coin in a piggy bank for later.',
      AgeGroup.explorer:
          'Sam SAVED one coin in a piggy bank to keep for later.',
      AgeGroup.builder:
          'Next, Sam decided to SAVE one coin. Saving a little now means more later.',
    },
  ),
  _Scene(
    bg: Color(0xFFDDEEFF),
    art: '🛒',
    text: {
      AgeGroup.little: 'Sam spent 1 coin on a yummy treat!',
      AgeGroup.explorer: 'Sam SPENT one coin on a little treat. Yum!',
      AgeGroup.builder:
          'Last, Sam chose to SPEND one coin wisely on a small treat. Enjoying a little is okay too.',
    },
  ),
  _Scene(
    bg: Color(0xFFFFF3D6),
    art: '💗🐷🛒',
    text: {
      AgeGroup.little: 'Give, Save, Spend. Three jars — one happy Sam!',
      AgeGroup.explorer:
          'Give, Save, and Spend — three jars, and a happy, wise Sam!',
      AgeGroup.builder:
          'Give, Save, Spend. When Sam shares each coin on purpose, every coin has a good job to do.',
    },
  ),
];

class _StoryTimeScreenState extends State<StoryTimeScreen> {
  int _i = 0;
  bool _done = false;

  String _captionFor(_Scene s) =>
      s.text[widget.age] ?? s.text[AgeGroup.explorer]!;

  Future<void> _next() async {
    if (_i < _story.length - 1) {
      setState(() => _i++);
      return;
    }
    // Finished the story.
    await StorageService.addSticker('story_sam');
    if (!mounted) return;
    setState(() => _done = true);
  }

  void _back() {
    if (_i > 0) setState(() => _i--);
  }

  void _replay() {
    setState(() {
      _i = 0;
      _done = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scene = _story[_i];

    return Scaffold(
      body: Stack(
        children: [
          // Scene background (changes gently with each page).
          AnimatedContainer(
            duration: const Duration(milliseconds: 500),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [scene.bg, Colors.white],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                // Top bar.
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
                  child: Row(
                    children: [
                      _RoundIconButton(
                        icon: Icons.arrow_back,
                        onTap: () => Navigator.of(context).maybePop(),
                      ),
                      const SizedBox(width: 10),
                      const Text(
                        'Story Time',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: KidsColors.ink,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        tooltip: 'Read aloud (coming soon)',
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('🎙️ Read-aloud voice is coming soon!'),
                              duration: Duration(seconds: 2),
                            ),
                          );
                        },
                        icon: const Icon(Icons.volume_up, color: KidsColors.ink),
                      ),
                    ],
                  ),
                ),

                // Illustration.
                Expanded(
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 450),
                      transitionBuilder: (child, anim) => FadeTransition(
                        opacity: anim,
                        child: ScaleTransition(
                          scale: Tween(begin: 0.9, end: 1.0).animate(anim),
                          child: child,
                        ),
                      ),
                      child: Bob(
                        key: ValueKey(_i),
                        child: Text(
                          scene.art,
                          style: const TextStyle(fontSize: 96),
                        ),
                      ),
                    ),
                  ),
                ),

                // Progress dots.
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var d = 0; d < _story.length; d++)
                      Container(
                        width: 10,
                        height: 10,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: d <= _i
                              ? KidsColors.spend
                              : KidsColors.spend.withOpacity(0.25),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                // Caption card.
                Container(
                  margin: const EdgeInsets.fromLTRB(18, 0, 18, 12),
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(color: KidsColors.sun, width: 3),
                  ),
                  child: Text(
                    _captionFor(scene),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: KidsColors.ink,
                      height: 1.3,
                    ),
                  ),
                ),

                // Buttons.
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
                  child: Row(
                    children: [
                      if (_i > 0)
                        _StoryButton(
                          label: '◀ Back',
                          color: Colors.grey,
                          onTap: _back,
                        ),
                      if (_i > 0) const SizedBox(width: 12),
                      Expanded(
                        child: _StoryButton(
                          label: _i < _story.length - 1
                              ? 'Next ▶'
                              : 'The End 🎉',
                          color: KidsColors.spend,
                          onTap: _next,
                          fill: true,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          if (_done)
            _StoryFinished(
              onReplay: _replay,
              onDone: () => Navigator.of(context).maybePop(),
            ),
        ],
      ),
    );
  }
}

class _StoryButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;
  final bool fill;
  const _StoryButton({
    required this.label,
    required this.color,
    required this.onTap,
    this.fill = false,
  });

  @override
  Widget build(BuildContext context) {
    final btn = Material(
      color: color,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          child: Center(
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ),
      ),
    );
    return fill ? btn : btn;
  }
}

class _RoundIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _RoundIconButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 2,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(icon, color: KidsColors.ink, size: 24),
        ),
      ),
    );
  }
}

class _StoryFinished extends StatelessWidget {
  final VoidCallback onReplay;
  final VoidCallback onDone;
  const _StoryFinished({required this.onReplay, required this.onDone});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(child: Container(color: Colors.black.withOpacity(0.15))),
        const Positioned.fill(child: KidConfetti()),
        Center(
          child: PopIn(
            child: Container(
              margin: const EdgeInsets.all(28),
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: KidsColors.sun, width: 5),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Bob(child: Text('⭐', style: TextStyle(fontSize: 60))),
                  const SizedBox(height: 6),
                  const Text(
                    'THE END!',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      color: KidsColors.ink,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'You earned a story sticker! ⭐',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: KidsColors.save,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _StoryButton(
                        label: 'Done',
                        color: Colors.grey,
                        onTap: onDone,
                      ),
                      const SizedBox(width: 12),
                      _StoryButton(
                        label: 'Read again',
                        color: KidsColors.spend,
                        onTap: onReplay,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
