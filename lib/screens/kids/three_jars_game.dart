import 'dart:math';
import 'package:flutter/material.dart';

import '../../services/storage_service.dart';

/// The Three Jars — the first kids mini-game.
///
/// A child drags coins into three jars: Give, Save, and Spend.
/// There is no "wrong" answer — every choice is celebrated. When all the
/// coins are sorted, confetti falls and the child earns a sticker that is
/// saved on the device.
class ThreeJarsGame extends StatefulWidget {
  const ThreeJarsGame({super.key});

  @override
  State<ThreeJarsGame> createState() => _ThreeJarsGameState();
}

/// A jar the child can drop coins into.
class _Jar {
  final String label;
  final String emoji;
  final Color color;
  final String cheer; // spoken by the mascot when a coin lands here
  const _Jar(this.label, this.emoji, this.color, this.cheer);
}

const _jars = <_Jar>[
  _Jar('Give', '💛', Color(0xFF1E5B50), 'Giving makes hearts happy!'),
  _Jar('Save', '🐷', Color(0xFFA9791C), 'Saving grows a little at a time.'),
  _Jar('Spend', '🛒', Color(0xFFC9791E), 'Spending wisely is smart, too.'),
];

class _ThreeJarsGameState extends State<ThreeJarsGame> {
  static const int _total = 6;

  late List<int> _remaining; // coin ids not yet sorted
  final Map<String, int> _counts = {'Give': 0, 'Save': 0, 'Spend': 0};

  String _mascotLine = 'Drag each coin into a jar. Any choice is a good choice!';
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
      _mascotLine =
          'Drag each coin into a jar. Any choice is a good choice!';
      _celebrating = false;
    });
  }

  void _drop(int coinId, _Jar jar) {
    if (!_remaining.contains(coinId)) return;
    setState(() {
      _remaining.remove(coinId);
      _counts[jar.label] = (_counts[jar.label] ?? 0) + 1;
      _mascotLine = jar.cheer;
    });
    if (_remaining.isEmpty) {
      _finish();
    }
  }

  Future<void> _finish() async {
    await StorageService.addSticker('three_jars');
    if (!mounted) return;
    setState(() {
      _celebrating = true;
      _mascotLine = 'You did it! You earned a sticker! ⭐';
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: const Text('The Three Jars'),
        actions: [
          IconButton(
            tooltip: 'Start over',
            onPressed: _reset,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Stack(
        children: [
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: isDark
                    ? const [Color(0xFF1B2430), Color(0xFF11161D)]
                    : const [Color(0xFFFFF6E4), Color(0xFFFDEFD3)],
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _MascotBubble(text: _mascotLine),
                  const SizedBox(height: 12),
                  _CoinTray(
                    remaining: _remaining,
                    total: _total,
                  ),
                  const Spacer(),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final jar in _jars)
                        Expanded(
                          child: Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 6),
                            child: _JarWidget(
                              jar: jar,
                              count: _counts[jar.label] ?? 0,
                              capacity: _total,
                              onCoin: (id) => _drop(id, jar),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (_celebrating)
            _CelebrationOverlay(
              counts: _counts,
              onPlayAgain: _reset,
              onDone: () => Navigator.of(context).pop(),
            ),
        ],
      ),
    );
  }
}

/// The pile of coins still waiting to be sorted.
class _CoinTray extends StatelessWidget {
  final List<int> remaining;
  final int total;
  const _CoinTray({required this.remaining, required this.total});

  @override
  Widget build(BuildContext context) {
    final sorted = total - remaining.length;
    return Column(
      children: [
        Text(
          remaining.isEmpty
              ? 'All coins sorted!'
              : 'Coins left: ${remaining.length}',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 70,
          child: Center(
            child: Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: [
                for (final id in remaining) _DraggableCoin(id: id),
              ],
            ),
          ),
        ),
        if (sorted > 0)
          Text(
            'Sorted so far: $sorted',
            style: Theme.of(context).textTheme.bodySmall,
          ),
      ],
    );
  }
}

/// A single gold coin the child can drag.
class _DraggableCoin extends StatelessWidget {
  final int id;
  const _DraggableCoin({required this.id});

  @override
  Widget build(BuildContext context) {
    return Draggable<int>(
      data: id,
      feedback: const _CoinFace(size: 60),
      childWhenDragging: const _CoinFace(size: 52, faded: true),
      child: const _CoinFace(size: 52),
    );
  }
}

class _CoinFace extends StatelessWidget {
  final double size;
  final bool faded;
  const _CoinFace({required this.size, this.faded = false});

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: faded ? 0.3 : 1,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF7D774), Color(0xFFCB9A2E)],
          ),
          border: Border.all(color: const Color(0xFFB07E1E), width: 2),
          boxShadow: faded
              ? null
              : const [
                  BoxShadow(
                    color: Color(0x33000000),
                    blurRadius: 4,
                    offset: Offset(0, 2),
                  ),
                ],
        ),
        alignment: Alignment.center,
        child: Text(
          '\$',
          style: TextStyle(
            fontSize: size * 0.5,
            fontWeight: FontWeight.w800,
            color: const Color(0xFF6E4E12),
          ),
        ),
      ),
    );
  }
}

/// A jar that accepts coins and fills up as it gets fuller.
class _JarWidget extends StatelessWidget {
  final _Jar jar;
  final int count;
  final int capacity;
  final ValueChanged<int> onCoin;

  const _JarWidget({
    required this.jar,
    required this.count,
    required this.capacity,
    required this.onCoin,
  });

  @override
  Widget build(BuildContext context) {
    const jarHeight = 130.0;
    final fraction = capacity == 0 ? 0.0 : (count / capacity).clamp(0.0, 1.0);

    return DragTarget<int>(
      onAcceptWithDetails: (details) => onCoin(details.data),
      builder: (context, candidate, rejected) {
        final hovering = candidate.isNotEmpty;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(jar.emoji, style: const TextStyle(fontSize: 26)),
            const SizedBox(height: 4),
            Text(
              jar.label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: jar.color,
              ),
            ),
            const SizedBox(height: 6),
            Container(
              height: jarHeight,
              decoration: BoxDecoration(
                color: jar.color.withOpacity(hovering ? 0.14 : 0.06),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: hovering ? jar.color : jar.color.withOpacity(0.4),
                  width: hovering ? 3 : 2,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Stack(
                  alignment: Alignment.bottomCenter,
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 350),
                      curve: Curves.easeOut,
                      height: jarHeight * fraction,
                      width: double.infinity,
                      color: jar.color.withOpacity(0.55),
                    ),
                    Center(
                      child: Text(
                        '$count',
                        style: TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          color: jar.color,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// The friendly mascot speech bubble.
class _MascotBubble extends StatelessWidget {
  final String text;
  const _MascotBubble({required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xFFC9791E).withOpacity(0.18),
            border: Border.all(color: const Color(0xFFC9791E), width: 2),
          ),
          alignment: Alignment.center,
          child: const Text('🪔', style: TextStyle(fontSize: 26)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                text,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Shown when every coin has been sorted.
class _CelebrationOverlay extends StatelessWidget {
  final Map<String, int> counts;
  final VoidCallback onPlayAgain;
  final VoidCallback onDone;

  const _CelebrationOverlay({
    required this.counts,
    required this.onPlayAgain,
    required this.onDone,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        const Positioned.fill(child: _ConfettiOverlay()),
        Center(
          child: Card(
            margin: const EdgeInsets.all(28),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('⭐', style: TextStyle(fontSize: 56)),
                  const SizedBox(height: 8),
                  Text(
                    'Great job!',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'You gave ${counts['Give']}, '
                    'saved ${counts['Save']}, '
                    'and spent ${counts['Spend']}.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'You earned a sticker!',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      OutlinedButton.icon(
                        onPressed: onDone,
                        icon: const Icon(Icons.check),
                        label: const Text('Done'),
                      ),
                      const SizedBox(width: 12),
                      ElevatedButton.icon(
                        onPressed: onPlayAgain,
                        icon: const Icon(Icons.replay),
                        label: const Text('Play again'),
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

// ---------------------------------------------------------------------------
// Hand-rolled confetti (no external packages).
// ---------------------------------------------------------------------------

const _confettiColors = <Color>[
  Color(0xFF1E5B50),
  Color(0xFFA9791C),
  Color(0xFFC9791E),
  Color(0xFFF7D774),
  Color(0xFF56B7A5),
];

class _Particle {
  final double x; // 0..1 start horizontal position
  final Color color;
  final double size;
  final double drift; // horizontal movement over the fall
  final double startDelay; // 0..1 of the timeline
  final double spin;
  final double rot0;
  const _Particle({
    required this.x,
    required this.color,
    required this.size,
    required this.drift,
    required this.startDelay,
    required this.spin,
    required this.rot0,
  });
}

class _ConfettiOverlay extends StatefulWidget {
  const _ConfettiOverlay();

  @override
  State<_ConfettiOverlay> createState() => _ConfettiOverlayState();
}

class _ConfettiOverlayState extends State<_ConfettiOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  final Random _rnd = Random();
  late final List<_Particle> _parts;

  @override
  void initState() {
    super.initState();
    _parts = List<_Particle>.generate(60, (_) {
      return _Particle(
        x: _rnd.nextDouble(),
        color: _confettiColors[_rnd.nextInt(_confettiColors.length)],
        size: 7 + _rnd.nextDouble() * 8,
        drift: (_rnd.nextDouble() - 0.5) * 0.3,
        startDelay: _rnd.nextDouble() * 0.35,
        spin: (_rnd.nextDouble() - 0.5) * 8,
        rot0: _rnd.nextDouble() * pi * 2,
      );
    });
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          return CustomPaint(
            painter: _ConfettiPainter(_parts, _controller.value),
            size: Size.infinite,
          );
        },
      ),
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  final List<_Particle> parts;
  final double progress;
  _ConfettiPainter(this.parts, this.progress);

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in parts) {
      final denom = 1 - p.startDelay;
      final t = denom <= 0
          ? progress
          : ((progress - p.startDelay) / denom).clamp(0.0, 1.0);
      if (t <= 0) continue;

      final dx = (p.x + p.drift * t) * size.width;
      final dy = (-0.05 + t * 1.1) * size.height;
      final paint = Paint()
        ..color = p.color.withOpacity((1.0 - t * 0.6).clamp(0.0, 1.0));

      canvas.save();
      canvas.translate(dx, dy);
      canvas.rotate(p.rot0 + p.spin * t);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset.zero,
            width: p.size,
            height: p.size * 0.6,
          ),
          const Radius.circular(2),
        ),
        paint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(_ConfettiPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
