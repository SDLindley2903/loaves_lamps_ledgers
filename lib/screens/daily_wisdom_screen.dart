import 'dart:math';
import 'package:flutter/material.dart';
import '../services/content_service.dart';

class DailyWisdomScreen extends StatefulWidget {
  const DailyWisdomScreen({super.key});

  @override
  State<DailyWisdomScreen> createState() => _DailyWisdomScreenState();
}

class _DailyWisdomScreenState extends State<DailyWisdomScreen> {
  Map<String, dynamic>? _item;

  @override
  void initState() {
    super.initState();
    _roll();
  }

  Future<void> _roll() async {
    final list = await ContentService.loadDailyWisdom();
    final pick = list[Random().nextInt(list.length)];
    setState(() => _item = pick);
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Daily Wisdom'),
        actions: [
          IconButton(
            tooltip: 'New',
            onPressed: _roll,
            icon: const Icon(Icons.refresh),
          )
        ],
      ),
      body: item == null
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item['verseRef'] ?? '',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    item['verseText'] ?? '',
                    style: Theme.of(context)
                        .textTheme
                        .bodyLarge
                        ?.copyWith(height: 1.45),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Reflection',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    item['reflection'] ?? '',
                    style: Theme.of(context)
                        .textTheme
                        .bodyLarge
                        ?.copyWith(height: 1.45),
                  ),
                ],
              ),
            ),
    );
  }
}
