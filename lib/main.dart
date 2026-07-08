import 'package:flutter/material.dart';
import 'services/storage_service.dart';
import 'screens/shell_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await StorageService.init();
  runApp(const LllApp());
}

class LllApp extends StatefulWidget {
  const LllApp({super.key});

  @override
  State<LllApp> createState() => _LllAppState();
}

class _LllAppState extends State<LllApp> {
  bool _darkMode = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final v = await StorageService.getDarkMode();
    setState(() {
      _darkMode = v;
      _loaded = true;
    });
  }

  Future<void> _setDarkMode(bool v) async {
    await StorageService.setDarkMode(v);
    setState(() => _darkMode = v);
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) {
      return const MaterialApp(
        home: Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
      );
    }

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      themeMode: _darkMode ? ThemeMode.dark : ThemeMode.light,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.indigo,
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.indigo,
        brightness: Brightness.dark,
      ),
      home: ShellScreen(
        darkMode: _darkMode,
        onDarkModeChanged: _setDarkMode,
      ),
    );
  }
}
