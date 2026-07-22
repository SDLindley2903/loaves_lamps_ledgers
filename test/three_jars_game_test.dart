// Smoke + functional tests for the kids' "Three Jars" game.
//
// Level 1 (smoke): the screens build and key elements are visible.
// Level 2 (functional): the game shows three jars and the right number
// of coins to sort.
//
// Run with:  flutter test

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:loaves_lamps_ledgers/services/storage_service.dart';
import 'package:loaves_lamps_ledgers/screens/kids/kids_home_screen.dart';
import 'package:loaves_lamps_ledgers/screens/kids/three_jars_game.dart';

void main() {
  setUp(() async {
    // Use an in-memory store so tests never touch a real device.
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await StorageService.init();
  });

  testWidgets('Kids Corner loads and shows the Three Jars game', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: KidsHomeScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Kids Corner'), findsOneWidget);
    expect(find.text('The Three Jars'), findsOneWidget);
    expect(find.text('My Stickers'), findsOneWidget);
  });

  testWidgets('Three Jars shows three jars and six coins', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ThreeJarsGame()));
    await tester.pumpAndSettle();

    // The three jars.
    expect(find.text('Give'), findsOneWidget);
    expect(find.text('Save'), findsOneWidget);
    expect(find.text('Spend'), findsOneWidget);

    // Six coins waiting to be sorted (each coin face shows a "$").
    expect(find.text('\$'), findsNWidgets(6));
    expect(find.textContaining('Coins left: 6'), findsOneWidget);
  });
}
