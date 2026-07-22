import 'package:flutter/material.dart';

import 'home_screen.dart';
import 'daily_wisdom_screen.dart';
import 'kids/kids_world_screen.dart';

class ShellScreen extends StatefulWidget {
  final bool darkMode;
  final Future<void> Function(bool) onDarkModeChanged;

  const ShellScreen({
    super.key,
    required this.darkMode,
    required this.onDarkModeChanged,
  });

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends State<ShellScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      HomeScreen(
        darkMode: widget.darkMode,
        onDarkModeChanged: widget.onDarkModeChanged,
      ),
      const DailyWisdomScreen(),
      const KidsWorldScreen(),
    ];

    return Scaffold(
      body: pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.menu_book),
            label: 'Book',
          ),
          NavigationDestination(
            icon: Icon(Icons.auto_awesome),
            label: 'Daily',
          ),
          NavigationDestination(
            icon: Icon(Icons.toys),
            label: 'Kids',
          ),
        ],
      ),
    );
  }
}
