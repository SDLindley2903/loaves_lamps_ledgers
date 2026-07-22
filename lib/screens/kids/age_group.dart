import 'kids_art.dart';
import 'package:flutter/material.dart';

/// The three age bands kids choose between (5-6, 7-8, 9-10).
/// Content (game difficulty, story wording) adapts to the chosen band.
enum AgeGroup { little, explorer, builder }

extension AgeGroupInfo on AgeGroup {
  String get id {
    switch (this) {
      case AgeGroup.little:
        return 'little';
      case AgeGroup.explorer:
        return 'explorer';
      case AgeGroup.builder:
        return 'builder';
    }
  }

  String get range {
    switch (this) {
      case AgeGroup.little:
        return '5–6';
      case AgeGroup.explorer:
        return '7–8';
      case AgeGroup.builder:
        return '9–10';
    }
  }

  String get title {
    switch (this) {
      case AgeGroup.little:
        return 'Little Lamb';
      case AgeGroup.explorer:
        return 'Explorer';
      case AgeGroup.builder:
        return 'Builder';
    }
  }

  String get emoji {
    switch (this) {
      case AgeGroup.little:
        return '🐑';
      case AgeGroup.explorer:
        return '🧭';
      case AgeGroup.builder:
        return '🛠️';
    }
  }

  Color get color {
    switch (this) {
      case AgeGroup.little:
        return KidsColors.give;
      case AgeGroup.explorer:
        return KidsColors.spend;
      case AgeGroup.builder:
        return KidsColors.save;
    }
  }

  /// How many coins the Three Jars game uses for this age band.
  int get coinCount {
    switch (this) {
      case AgeGroup.little:
        return 4;
      case AgeGroup.explorer:
        return 6;
      case AgeGroup.builder:
        return 8;
    }
  }
}

/// Parse a stored id back into an [AgeGroup] (null if unknown/unset).
AgeGroup? ageGroupFromId(String? id) {
  switch (id) {
    case 'little':
      return AgeGroup.little;
    case 'explorer':
      return AgeGroup.explorer;
    case 'builder':
      return AgeGroup.builder;
    default:
      return null;
  }
}
