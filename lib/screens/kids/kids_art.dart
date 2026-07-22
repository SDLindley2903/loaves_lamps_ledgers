import 'dart:math';
import 'package:flutter/material.dart';

/// Shared cartoon art + animation pieces for the kids' world.
/// Everything here is pure Flutter (no image or animation packages), so it
/// builds and publishes with no extra downloads.

class KidsColors {
  static const skyTop = Color(0xFF7EC8F2);
  static const skyBottom = Color(0xFFD6F0FF);
  static const grass = Color(0xFF86D46A);
  static const sun = Color(0xFFFFD23F);
  static const sunRay = Color(0xFFFFE07A);

  // Bright, distinct jar colors kids can tell apart at a glance.
  static const give = Color(0xFFFF6B8A); // pink  (love / giving)
  static const save = Color(0xFF3FC46B); // green (grow / saving)
  static const spend = Color(0xFF4AA3F0); // blue  (shopping / spending)

  static const coin = Color(0xFFFFD23F);
  static const coinDark = Color(0xFFE0A81E);
  static const coinShine = Color(0xFFFFF3C4);

  static const ink = Color(0xFF2B2A33);
}

/// A living background: gradient sky, spinning sun, drifting clouds, hills.
/// Put your screen content in [child]; it sits on top of the scenery.
class AnimatedSky extends StatefulWidget {
  final Widget child;
  const AnimatedSky({super.key, required this.child});

  @override
  State<AnimatedSky> createState() => _AnimatedSkyState();
}

class _AnimatedSkyState extends State<AnimatedSky>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 28))
        ..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduce && _c.isAnimating) _c.stop();

    return Stack(
      children: [
        const Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [KidsColors.skyTop, KidsColors.skyBottom],
              ),
            ),
          ),
        ),
        Positioned.fill(
          child: RepaintBoundary(
            child: AnimatedBuilder(
              animation: _c,
              builder: (_, __) => CustomPaint(painter: _SkyPainter(_c.value)),
            ),
          ),
        ),
        Positioned.fill(child: widget.child),
      ],
    );
  }
}

class _SkyPainter extends CustomPainter {
  final double t;
  _SkyPainter(this.t);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    // Sun with slowly spinning rays (top-right).
    final sunCenter = Offset(w * 0.82, h * 0.15);
    const sunR = 32.0;
    final rayPaint = Paint()
      ..color = KidsColors.sunRay
      ..strokeWidth = 6
      ..strokeCap = StrokeCap.round;
    final rot = t * 2 * pi;
    for (var i = 0; i < 12; i++) {
      final a = rot + i * (pi / 6);
      final dir = Offset(cos(a), sin(a));
      canvas.drawLine(
        sunCenter + dir * (sunR + 8),
        sunCenter + dir * (sunR + 24),
        rayPaint,
      );
    }
    canvas.drawCircle(sunCenter, sunR, Paint()..color = KidsColors.sun);

    // Drifting clouds (wrap around the screen).
    final span = w + 160;
    _cloud(canvas, Offset(((t * w) + w * 0.10) % span - 80, h * 0.20), 1.0);
    _cloud(canvas, Offset(((t * 0.6 * w) + w * 0.55) % span - 80, h * 0.34), 0.7);
    _cloud(canvas, Offset(((t * 0.8 * w) + w * 0.80) % span - 80, h * 0.10), 0.85);

    // Rolling hills along the bottom.
    final hill = Path()
      ..moveTo(0, h)
      ..lineTo(0, h * 0.86)
      ..quadraticBezierTo(w * 0.25, h * 0.78, w * 0.5, h * 0.84)
      ..quadraticBezierTo(w * 0.78, h * 0.90, w, h * 0.82)
      ..lineTo(w, h)
      ..close();
    canvas.drawPath(hill, Paint()..color = KidsColors.grass);
  }

  void _cloud(Canvas c, Offset o, double s) {
    final p = Paint()..color = Colors.white.withOpacity(0.95);
    c.drawCircle(o, 18 * s, p);
    c.drawCircle(o + Offset(20 * s, 4 * s), 22 * s, p);
    c.drawCircle(o + Offset(42 * s, 0), 16 * s, p);
    c.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(o.dx - 2, o.dy + 2, 46 * s, 16 * s),
        const Radius.circular(10),
      ),
      p,
    );
  }

  @override
  bool shouldRepaint(_SkyPainter old) => old.t != t;
}

/// Gently bobs its child up and down forever (idle "alive" motion).
class Bob extends StatefulWidget {
  final Widget child;
  final double distance;
  final Duration period;
  const Bob({
    super.key,
    required this.child,
    this.distance = 8,
    this.period = const Duration(milliseconds: 1700),
  });

  @override
  State<Bob> createState() => _BobState();
}

class _BobState extends State<Bob> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: widget.period)
        ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (reduce) return widget.child;
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (_, child) {
        final dy = -sin(_c.value * pi) * widget.distance;
        return Transform.translate(offset: Offset(0, dy), child: child);
      },
    );
  }
}

/// Bouncy "pop in" for things that appear (coins, stars).
class PopIn extends StatelessWidget {
  final Widget child;
  final Duration duration;
  const PopIn({
    super.key,
    required this.child,
    this.duration = const Duration(milliseconds: 550),
  });

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: duration,
      curve: Curves.elasticOut,
      child: child,
      builder: (_, v, child) => Transform.scale(scale: v, child: child),
    );
  }
}

/// A shiny cartoon gold coin.
class CoinFace extends StatelessWidget {
  final double size;
  final bool faded;
  const CoinFace({super.key, this.size = 54, this.faded = false});

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: faded ? 0.25 : 1,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: const RadialGradient(
            center: Alignment(-0.3, -0.3),
            radius: 0.9,
            colors: [KidsColors.coinShine, KidsColors.coin, KidsColors.coinDark],
            stops: [0.0, 0.55, 1.0],
          ),
          border: Border.all(color: KidsColors.coinDark, width: 2),
          boxShadow: faded
              ? null
              : const [
                  BoxShadow(
                    color: Color(0x33000000),
                    blurRadius: 5,
                    offset: Offset(0, 3),
                  ),
                ],
        ),
        alignment: Alignment.center,
        child: Text(
          '\$',
          style: TextStyle(
            fontSize: size * 0.5,
            fontWeight: FontWeight.w900,
            color: const Color(0xFF7A5A12),
          ),
        ),
      ),
    );
  }
}

/// A cute jar/bucket with a face that fills up and bumps when a coin lands.
class CartoonJar extends StatelessWidget {
  final String label;
  final String emoji;
  final Color color;
  final int count;
  final int capacity;
  final bool hovering;

  const CartoonJar({
    super.key,
    required this.label,
    required this.emoji,
    required this.color,
    required this.count,
    required this.capacity,
    this.hovering = false,
  });

  @override
  Widget build(BuildContext context) {
    const jarW = 92.0;
    const jarH = 120.0;
    final frac = capacity == 0 ? 0.0 : (count / capacity).clamp(0.0, 1.0);

    final jar = SizedBox(
      width: jarW,
      height: jarH + 14,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Jar body.
          Positioned(
            top: 12,
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              decoration: BoxDecoration(
                color: color.withOpacity(0.14),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(14),
                  bottom: Radius.circular(30),
                ),
                border: Border.all(color: color, width: 4),
              ),
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(11),
                  bottom: Radius.circular(26),
                ),
                child: Stack(
                  alignment: Alignment.bottomCenter,
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 400),
                      curve: Curves.easeOut,
                      height: jarH * frac,
                      width: double.infinity,
                      color: color.withOpacity(0.65),
                    ),
                    // Face.
                    Positioned(
                      top: 20,
                      left: 0,
                      right: 0,
                      child: CustomPaint(
                        size: const Size(jarW, 30),
                        painter: _FacePainter(),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '$count',
                        style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          shadows: [
                            Shadow(color: Color(0x66000000), blurRadius: 3),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // Rim / mouth of the jar.
          Positioned(
            top: 0,
            left: -3,
            right: -3,
            child: Container(
              height: 18,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(9),
              ),
            ),
          ),
        ],
      ),
    );

    // Bump the jar each time the count changes.
    final bumped = TweenAnimationBuilder<double>(
      key: ValueKey(count),
      tween: Tween(begin: count == 0 ? 1.0 : 1.18, end: 1.0),
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOut,
      child: jar,
      builder: (_, v, child) => Transform.scale(scale: v, child: child),
    );

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedScale(
          scale: hovering ? 1.08 : 1.0,
          duration: const Duration(milliseconds: 150),
          child: bumped,
        ),
        const SizedBox(height: 6),
        Text(
          '$emoji $label',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 15,
            color: color,
          ),
        ),
      ],
    );
  }
}

/// Two googly eyes and a smile.
class _FacePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final eyeY = size.height * 0.45;
    final lx = size.width * 0.36;
    final rx = size.width * 0.64;
    final white = Paint()..color = Colors.white;
    final black = Paint()..color = KidsColors.ink;

    canvas.drawCircle(Offset(lx, eyeY), 7, white);
    canvas.drawCircle(Offset(rx, eyeY), 7, white);
    canvas.drawCircle(Offset(lx + 1, eyeY + 1), 3.4, black);
    canvas.drawCircle(Offset(rx + 1, eyeY + 1), 3.4, black);

    final smile = Paint()
      ..color = KidsColors.ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(
        center: Offset(size.width / 2, eyeY + 5),
        radius: 9,
      ),
      0.15 * pi,
      0.7 * pi,
      false,
      smile,
    );
  }

  @override
  bool shouldRepaint(_FacePainter oldDelegate) => false;
}

/// A friendly speech bubble.
class SpeechBubble extends StatelessWidget {
  final String text;
  const SpeechBubble({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: KidsColors.sun, width: 3),
        boxShadow: const [
          BoxShadow(color: Color(0x22000000), blurRadius: 8, offset: Offset(0, 3)),
        ],
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w800,
          color: KidsColors.ink,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

const _confettiColors = <Color>[
  KidsColors.give,
  KidsColors.save,
  KidsColors.spend,
  KidsColors.coin,
  Color(0xFFB06BFF),
];

class _Particle {
  final double x;
  final Color color;
  final double size;
  final double drift;
  final double startDelay;
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

class KidConfetti extends StatefulWidget {
  const KidConfetti({super.key});

  @override
  State<KidConfetti> createState() => _KidConfettiState();
}

class _KidConfettiState extends State<KidConfetti>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  final Random _rnd = Random();
  late final List<_Particle> _parts;

  @override
  void initState() {
    super.initState();
    _parts = List<_Particle>.generate(70, (_) {
      return _Particle(
        x: _rnd.nextDouble(),
        color: _confettiColors[_rnd.nextInt(_confettiColors.length)],
        size: 8 + _rnd.nextDouble() * 9,
        drift: (_rnd.nextDouble() - 0.5) * 0.3,
        startDelay: _rnd.nextDouble() * 0.35,
        spin: (_rnd.nextDouble() - 0.5) * 8,
        rot0: _rnd.nextDouble() * pi * 2,
      );
    });
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
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
        builder: (context, _) => CustomPaint(
          painter: _ConfettiPainter(_parts, _controller.value),
          size: Size.infinite,
        ),
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
        ..color = p.color.withOpacity((1.0 - t * 0.5).clamp(0.0, 1.0));

      canvas.save();
      canvas.translate(dx, dy);
      canvas.rotate(p.rot0 + p.spin * t);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset.zero, width: p.size, height: p.size * 0.6),
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
