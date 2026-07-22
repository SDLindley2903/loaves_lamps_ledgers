import 'package:flutter/material.dart';

import '../../services/storage_service.dart';
import 'kids_art.dart';

/// The Three Jars — a cartoon coin-sorting game for ages 5–10.
///
/// The kid explorer helps sort gold coins into three jars: Give, Save, and
/// Spend. There is no "wrong" answer — every choice is celebrated. When all
/// the coins are sorted, confetti falls and the child earns a sticker.
class ThreeJarsGame extends StatefulWidget {
  const ThreeJarsGame({super.key});

  @override
  State<ThreeJarsGame> createState() => _ThreeJarsGameState();
}

class _JarSpec {
  final String label;
  final String emoji;
  final Color color;
  final String cheer;
  const _JarSpec(this.label, this.emoji, this.color, this.cheer);
}

const _jarSpecs = <_JarSpec>[
  _JarSpec('Give', '💗', KidsColors.give, 'Giving makes hearts happy! 💗'),
  _JarSpec('Save', '🐷', KidsColors.save, 'Saving grows and grows! 🌱'),
  _JarSpec('Spend', '🛒', KidsColors.spend, 'Smart spending, hooray! 🛒'),
];

class _ThreeJarsGameState extends State<ThreeJarsGame> {
  static const int _total = 6;

  late List<int> _remaining;
  final Map<String, int> _counts = {'Give': 0, 'Save': 0, 'Spend': 0};

  String _line = 'Drag each coin into a jar. Any choice is a good choice!';
  bool _celebrating = false;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  void _reset() {
    setState(() {
      _remaining = List<int>.generate(_total, (i) => i);
      _counts['Give'] = 0;
      _counts['Save'] = 0;
      _counts['Spend'] = 0;
      _line = 'Drag each coin into a jar. Any choice is a good choice!';
      _celebrating = false;
    });
  }

  void _drop(int coinId, _JarSpec jar) {
    if (!_remaining.contains(coinId)) return;
    setState(() {
      _remaining.remove(coinId);
      _counts[jar.label] = (_counts[jar.label] ?? 0) + 1;
      _line = jar.cheer;
    });
    if (_remaining.isEmpty) _finish();
  }

  Future<void> _finish() async {
    await StorageService.addSticker('three_jars');
    if (!mounted) return;
    setState(() {
      _celebrating = true;
      _line = 'You did it! You earned a sticker! ⭐';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AnimatedSky(
        child: SafeArea(
          child: Stack(
            children: [
              Column(
                children: [
                  // Back button + title row.
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
                    child: Row(
                      children: [
                        _RoundIconButton(
                          icon: Icons.arrow_back,
                          onTap: () => Navigator.of(context).maybePop(),
                        ),
                        const Spacer(),
                        _RoundIconButton(
                          icon: Icons.refresh,
                          onTap: _reset,
                        ),
                      ],
                    ),
                  ),

                  // Explorer + speech bubble.
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        const Bob(child: Text('🧒', style: TextStyle(fontSize: 56))),
                        const SizedBox(width: 10),
                        Expanded(child: SpeechBubble(text: _line)),
                      ],
                    ),
                  ),

                  const SizedBox(height: 10),

                  // Coins waiting to be sorted.
                  Text(
                    _remaining.isEmpty
                        ? 'All sorted! 🎉'
                        : 'Coins to sort: ${_remaining.length}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: KidsColors.ink,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 76,
                    child: Center(
                      child: Wrap(
                        spacing: 12,
                        runSpacing: 8,
                        alignment: WrapAlignment.center,
                        children: [
                          for (final id in _remaining)
                            PopIn(
                              key: ValueKey(id),
                              child: Bob(
                                distance: 5,
                                child: _DraggableCoin(id: id),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),

                  const Spacer(),

                  // The three jars.
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        for (final spec in _jarSpecs) _jarTarget(spec),
                      ],
                    ),
                  ),
                ],
              ),

              if (_celebrating)
                _Celebration(
                  counts: _counts,
                  onPlayAgain: _reset,
                  onDone: () => Navigator.of(context).maybePop(),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _jarTarget(_JarSpec spec) {
    return DragTarget<int>(
      onAcceptWithDetails: (d) => _drop(d.data, spec),
      builder: (context, candidate, rejected) {
        return CartoonJar(
          label: spec.label,
          emoji: spec.emoji,
          color: spec.color,
          count: _counts[spec.label] ?? 0,
          capacity: _total,
          hovering: candidate.isNotEmpty,
        );
      },
    );
  }
}

class _DraggableCoin extends StatelessWidget {
  final int id;
  const _DraggableCoin({required this.id});

  @override
  Widget build(BuildContext context) {
    return Draggable<int>(
      data: id,
      feedback: const CoinFace(size: 64),
      childWhenDragging: const CoinFace(size: 54, faded: true),
      child: const CoinFace(size: 54),
    );
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

class _Celebration extends StatelessWidget {
  final Map<String, int> counts;
  final VoidCallback onPlayAgain;
  final VoidCallback onDone;

  const _Celebration({
    required this.counts,
    required this.onPlayAgain,
    required this.onDone,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: Container(color: Colors.black.withOpacity(0.15)),
        ),
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
                  const Bob(child: Text('⭐', style: TextStyle(fontSize: 64))),
                  const SizedBox(height: 4),
                  const Text(
                    'GREAT JOB!',
                    style: TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w900,
                      color: KidsColors.ink,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'You gave ${counts['Give']}, '
                    'saved ${counts['Save']}, '
                    'and spent ${counts['Spend']}.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: KidsColors.ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'You earned a sticker! ⭐',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      color: KidsColors.save,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _BigButton(
                        label: 'Done',
                        color: Colors.grey,
                        onTap: onDone,
                      ),
                      const SizedBox(width: 12),
                      _BigButton(
                        label: 'Play again ▶',
                        color: KidsColors.spend,
                        onTap: onPlayAgain,
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

class _BigButton extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _BigButton({
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ),
    );
  }
}
