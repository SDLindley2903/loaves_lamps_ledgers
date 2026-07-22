// Smoke + functional tests for the kids' animated world and Three Jars game.
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
import 'package:loaves_lamps_ledgers/screens/kids/kids_world_screen.dart';
import 'package:loaves_lamps_ledgers/screens/kids/three_jars_game.dart';

void main() {
  setUp(() async {
    // Use an in-memory store so tests never touch a real device.
    SharedPreferences.setMockInitialValues(<String, Object>{});
    await StorageService.init();
  });

  testWidgets('Kids world loads and shows the Treasure Room game', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: KidsWorldScreen()));
    await tester.pump(); // let the first frame build

    expect(find.text('Treasure Room'), findsOneWidget);
    expect(find.text('The Bakery'), findsOneWidget);
    expect(find.text('Lamp Market'), findsOneWidget);
  });

  testWidgets('Three Jars shows three jars and six coins', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: ThreeJarsGame()));
    await tester.pump();

    // The three jars (label text includes the emoji, so match loosely).
    expect(find.textContaining('Give'), findsOneWidget);
    expect(find.textContaining('Save'), findsOneWidget);
    expect(find.textContaining('Spend'), findsOneWidget);

    // Six coins waiting to be sorted (each coin face shows a "$").
    expect(find.text('\$'), findsNWidgets(6));
    expect(find.textContaining('Coins to sort: 6'), findsOneWidget);
  });
}
