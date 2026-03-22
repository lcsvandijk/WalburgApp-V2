import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { theme } from '../constants/theme';
import { findFloorPlanMatch, floorPlanConfig } from '../lib/floorPlan';
import { formatDisplayLocation } from '../lib/location';
import { FloorPlanBuilding, FloorPlanLevel, FloorPlanMatch, FloorPlanRoomMarker } from '../types/floorPlan';
import { FloorPlanViewer } from './FloorPlanViewer';

type FloorPlanBrowserProps = {
  title?: string;
  description?: string;
  initialLocation?: string;
  initialFocusNonce?: string;
  onMapInteractionChange?: (isInteracting: boolean) => void;
};

type SearchResult = {
  building: FloorPlanBuilding;
  level: FloorPlanLevel;
  marker: FloorPlanRoomMarker;
};

function getSearchableText(level: FloorPlanLevel, marker: FloorPlanRoomMarker) {
  return [
    marker.label,
    ...marker.aliases,
    level.label,
    level.shortLabel,
    marker.notes,
    marker.address,
    marker.externalLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function FloorPlanBrowser({
  title = 'Plattegrond',
  description = 'Bekijk alle verdiepingen en zoek direct naar lokalen of andere ruimtes.',
  initialLocation,
  initialFocusNonce,
  onMapInteractionChange,
}: FloorPlanBrowserProps) {
  const building = floorPlanConfig.buildings[0];
  const levels = useMemo(() => [...building.levels].sort((left, right) => left.order - right.order), [building.levels]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState(levels[0]?.id ?? '');
  const [activeMatch, setActiveMatch] = useState<FloorPlanMatch | null>(null);
  const [focusNonce, setFocusNonce] = useState<string | undefined>(initialFocusNonce);

  useEffect(() => {
    if (!initialLocation) {
      setActiveMatch(null);
      return;
    }

    const initialMatch: FloorPlanMatch | null = findFloorPlanMatch(initialLocation);

    if (initialMatch) {
      setSelectedLevelId(initialMatch.level.id);
      setActiveMatch(initialMatch);
      setFocusNonce(initialFocusNonce ?? `${Date.now()}`);
      return;
    }

    setActiveMatch(null);
  }, [initialFocusNonce, initialLocation]);

  const selectedLevel = useMemo(
    () => levels.find((level) => level.id === selectedLevelId) ?? levels[0],
    [levels, selectedLevelId],
  );

  const searchResults = useMemo<SearchResult[]>(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    return levels
      .flatMap((level) =>
        level.markers.map((marker) => ({
          building,
          level,
          marker,
        })),
      )
      .filter((result) => getSearchableText(result.level, result.marker).includes(normalizedQuery))
      .slice(0, 12);
  }, [building, levels, searchQuery]);

  if (!selectedLevel) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      <View style={styles.searchWrap}>
        <Ionicons color={theme.colors.brandBlue} name="search" size={18} />
        <TextInput
          onChangeText={setSearchQuery}
          placeholder="Zoek een lokaal of ruimte"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={searchQuery}
        />
        {searchQuery ? (
          <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Ionicons color={theme.colors.brandBlue} name="close-circle" size={18} />
          </Pressable>
        ) : null}
      </View>

      {searchResults.length > 0 ? (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.resultsScroller}
          contentContainerStyle={styles.resultsContent}
        >
          {searchResults.map((result) => (
            <Pressable
              key={`${result.level.id}-${result.marker.id}-${result.marker.label}`}
              onPress={() => {
                setSelectedLevelId(result.level.id);
                setActiveMatch({
                  building: result.building,
                  level: result.level,
                  marker: result.marker,
                  matchedAlias: result.marker.label,
                  score: 999,
                });
                setFocusNonce(`${Date.now()}`);
                setSearchQuery('');
              }}
              style={styles.resultCard}
            >
              <View style={styles.resultCopy}>
                <Text style={styles.resultTitle}>{formatDisplayLocation(result.marker.label)}</Text>
                <Text style={styles.resultMeta}>
                  {result.level.label} • {result.marker.kind === 'external' ? 'Extern' : 'Intern'}
                </Text>
              </View>
              <Ionicons color={theme.colors.brandBlue} name="arrow-forward-outline" size={18} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.levelRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {levels.map((level) => {
          const isActive = level.id === selectedLevel.id;
          return (
            <Pressable
              key={level.id}
              onPress={() => {
                setSelectedLevelId(level.id);
                setActiveMatch(null);
              }}
              style={[styles.levelChip, isActive ? styles.levelChipActive : null]}
            >
              <Text style={[styles.levelChipText, isActive ? styles.levelChipTextActive : null]}>
                {level.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FloorPlanViewer
        animationKey={focusNonce}
        autoFocusEnabled={Boolean(activeMatch && activeMatch.level.id === selectedLevel.id)}
        highlightTarget={Boolean(activeMatch && activeMatch.level.id === selectedLevel.id)}
        level={selectedLevel}
        match={activeMatch && activeMatch.level.id === selectedLevel.id ? activeMatch : null}
        onInteractionChange={onMapInteractionChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  title: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 24,
    lineHeight: 30,
  },
  description: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  searchWrap: {
    alignItems: 'center',
    backgroundColor: '#F8FBFF',
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 16,
    minHeight: 48,
    paddingLeft: 14,
    paddingRight: 8,
  },
  searchInput: {
    color: theme.colors.text,
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  clearButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  resultsScroller: {
    marginTop: 12,
    maxHeight: 216,
  },
  resultsContent: {
    gap: 10,
  },
  resultCard: {
    alignItems: 'center',
    backgroundColor: '#F8FBFF',
    borderColor: theme.colors.divider,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resultCopy: {
    flex: 1,
  },
  resultTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
  },
  resultMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    marginTop: 4,
  },
  levelRow: {
    gap: 10,
    marginTop: 14,
    paddingBottom: 2,
  },
  levelChip: {
    backgroundColor: '#E8F0FB',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  levelChipActive: {
    backgroundColor: theme.colors.brandBlue,
  },
  levelChipText: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
  },
  levelChipTextActive: {
    color: theme.colors.inkOnDark,
  },
});
