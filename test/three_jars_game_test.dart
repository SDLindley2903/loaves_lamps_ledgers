// Smoke + functional tests for the kids' age gate, world, and Three Jars game.
//
// Level 1 (smoke): the screens build and key elements are visible.
// Level 2 (functional): the age picker gates the world; the game shows the
// right number of coins for the age band.
//
// Run with:  flutter test

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:loaves_lamps_ledgers/services/storage_service.dart';
import 'package:loaves_lamps_ledgers/screens/kids/age_group.dart';
import 'package:loaves_lamps_ledgers/screens/kids/kids_world_screen.dart';
import 'package:loaves_lamps_ledgers/screens/kids/three_jars_game.dart';

Future<void> _initAge(String? id) async {
  SharedPreferences.setMockInitialValues(
    id == null ? <String, Object>{} : <String, Object>{'kids_age_group': id},
  );
  await StorageService.init();
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(); // first frame
  await tester.pump(const Duration(milliseconds: 60)); // let async load finish
}

void main() {
  testWidgets('Age picker appears when no age is chosen', (tester) async {
    await _initAge(null);
    await tester.pumpWidget(const MaterialApp(home: KidsWorldScreen()));
    await _settle(tester);

    expect(find.text('How old are you? 🎂'), findsOneWidget);
    expect(find.text('5–6'), findsOneWidget);
    expect(find.text('7–8'), findsOneWidget);
    expect(find.text('9–10'), findsOneWidget);
  });

  testWidgets('World shows places once an age is chosen', (tester) async {
    await _initAge('explorer');
    await tester.pumpWidget(const MaterialApp(home: KidsWorldScreen()));
    await _settle(tester);

    expect(find.text('Treasure Room'), findsOneWidget);
    expect(find.text('Story Time'), findsOneWidget);
  });

  testWidgets('Three Jars shows three jars and the right coin count',
      (tester) async {
    await _initAge('explorer');
    await tester.pumpWidget(
      const MaterialApp(home: ThreeJarsGame(age: AgeGroup.explorer)),
    );
    await tester.pump();

    expect(find.textContaining('Give'), findsOneWidget);
    expect(find.textContaining('Save'), findsOneWidget);
    expect(find.textContaining('Spend'), findsOneWidget);

    // Explorer band = 6 coins.
    expect(find.text('\$'), findsNWidgets(6));
    expect(find.textContaining('Coins to sort: 6'), findsOneWidget);
  });
}
