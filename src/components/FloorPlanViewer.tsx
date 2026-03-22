import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { G, Polygon, TSpan, Text as SvgText } from 'react-native-svg';

import { theme } from '../constants/theme';
import {
  formatFloorPlanLabel,
  getFloorPlanMarkerBounds,
  getFloorPlanMarkerPolygon,
  isExternalFloorPlanMarker,
} from '../lib/floorPlan';
import { FloorPlanLevel, FloorPlanMatch } from '../types/floorPlan';

interface FloorPlanViewerProps {
  match?: FloorPlanMatch | null;
  level?: FloorPlanLevel;
  autoFocusEnabled?: boolean;
  animationKey?: string;
  showHint?: boolean;
  highlightTarget?: boolean;
  onInteractionChange?: (isInteracting: boolean) => void;
}

const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getTouchDistance(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) {
    return 0;
  }

  const [firstTouch, secondTouch] = touches;
  const deltaX = secondTouch.pageX - firstTouch.pageX;
  const deltaY = secondTouch.pageY - firstTouch.pageY;

  return Math.hypot(deltaX, deltaY);
}

function getTouchCenter(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length === 0) {
    return { x: 0, y: 0 };
  }

  const total = touches.reduce(
    (accumulator, touch) => ({
      x: accumulator.x + touch.pageX,
      y: accumulator.y + touch.pageY,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / touches.length,
    y: total.y / touches.length,
  };
}

function clampTranslation(
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  x: number,
  y: number,
) {
  const maxX = Math.max((viewportWidth * zoom - viewportWidth) / 2, 0);
  const maxY = Math.max((viewportHeight * zoom - viewportHeight) / 2, 0);

  return {
    x: clamp(x, -maxX, maxX),
    y: clamp(y, -maxY, maxY),
  };
}

function getFocusTranslation(
  viewportWidth: number,
  viewportHeight: number,
  centerXRatio: number,
  centerYRatio: number,
  zoom: number,
) {
  const pointX = centerXRatio * viewportWidth;
  const pointY = centerYRatio * viewportHeight;

  return clampTranslation(
    viewportWidth,
    viewportHeight,
    zoom,
    (viewportWidth / 2 - pointX) * zoom,
    (viewportHeight / 2 - pointY) * zoom,
  );
}

function splitFloorPlanLabel(label: string, maxLines: number) {
  const normalizedLabel = label.trim().replace(/\s+/g, ' ');

  if (!normalizedLabel) {
    return [''];
  }

  if (maxLines <= 1) {
    return [normalizedLabel];
  }

  const words = normalizedLabel.split(' ');

  if (words.length === 1) {
    const chunkSize = Math.max(Math.ceil(normalizedLabel.length / maxLines), 1);
    return normalizedLabel.match(new RegExp(`.{1,${chunkSize}}`, 'g')) ?? [normalizedLabel];
  }

  const targetLength = Math.max(Math.ceil(normalizedLabel.length / maxLines), words[0].length);
  const lines: string[] = [];
  let currentLine = '';
  let consumedWords = 0;

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    const linesRemaining = maxLines - lines.length - 1;
    const wordsRemaining = words.length - consumedWords - 1;

    if (currentLine && nextLine.length > targetLength && linesRemaining > 0 && wordsRemaining >= linesRemaining) {
      lines.push(currentLine);
      currentLine = word;
      consumedWords += 1;
      return;
    }

    currentLine = nextLine;
    consumedWords += 1;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
}

export function FloorPlanViewer({
  match,
  level,
  autoFocusEnabled = true,
  animationKey,
  showHint = true,
  highlightTarget = true,
  onInteractionChange,
}: FloorPlanViewerProps) {
  const { width } = useWindowDimensions();
  const [measuredImageSize, setMeasuredImageSize] = useState<{ height: number; width: number } | null>(null);
  const pinchState = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialX: number;
    initialY: number;
    initialCenterX: number;
    initialCenterY: number;
    mode: 'pan' | 'pinch' | null;
  }>({
    initialDistance: 0,
    initialZoom: 1,
    initialX: 0,
    initialY: 0,
    initialCenterX: 0,
    initialCenterY: 0,
    mode: null,
  });
  const targetFade = useRef(new Animated.Value(0)).current;
  const zoomAnimation = useRef(new Animated.Value(1)).current;
  const translateXAnimation = useRef(new Animated.Value(0)).current;
  const translateYAnimation = useRef(new Animated.Value(0)).current;
  const autoNavigationActiveRef = useRef(false);
  const hasPlayedAnimationRef = useRef(false);
  const zoomRef = useRef(1);
  const translateXRef = useRef(0);
  const translateYRef = useRef(0);
  const resolvedLevel = level ?? match?.level ?? null;
  const targetMarker = highlightTarget ? match?.marker ?? null : null;
  const polygon = useMemo(() => (targetMarker ? getFloorPlanMarkerPolygon(targetMarker) : null), [targetMarker]);
  const isExternal = Boolean(targetMarker && isExternalFloorPlanMarker(targetMarker));
  const resolvedImageSize =
    resolvedLevel?.imageWidth && resolvedLevel.imageHeight
      ? {
          height: resolvedLevel.imageHeight,
          width: resolvedLevel.imageWidth,
        }
      : measuredImageSize;
  const focusKey =
    animationKey ?? (resolvedLevel && targetMarker ? `${resolvedLevel.id}:${targetMarker.id}` : 'overview');

  useEffect(() => {
    zoomRef.current = 1;
    translateXRef.current = 0;
    translateYRef.current = 0;
    zoomAnimation.stopAnimation();
    translateXAnimation.stopAnimation();
    translateYAnimation.stopAnimation();
    zoomAnimation.setValue(1);
    translateXAnimation.setValue(0);
    translateYAnimation.setValue(0);
    targetFade.setValue(autoFocusEnabled ? 0 : 1);
    setMeasuredImageSize(null);
    hasPlayedAnimationRef.current = false;
  }, [autoFocusEnabled, focusKey, targetFade, translateXAnimation, translateYAnimation, zoomAnimation]);

  useEffect(() => {
    const zoomListener = zoomAnimation.addListener(({ value }) => {
      zoomRef.current = value;
    });
    const translateXListener = translateXAnimation.addListener(({ value }) => {
      translateXRef.current = value;
    });
    const translateYListener = translateYAnimation.addListener(({ value }) => {
      translateYRef.current = value;
    });

    return () => {
      zoomAnimation.removeListener(zoomListener);
      translateXAnimation.removeListener(translateXListener);
      translateYAnimation.removeListener(translateYListener);
    };
  }, [translateXAnimation, translateYAnimation, zoomAnimation]);

  useEffect(() => {
    if (resolvedImageSize) {
      return;
    }

    if (!resolvedLevel?.imageDataUri) {
      setMeasuredImageSize(null);
      return;
    }

    Image.getSize(
      resolvedLevel.imageDataUri,
      (imageWidth, imageHeight) => {
        setMeasuredImageSize({
          height: imageHeight,
          width: imageWidth,
        });
      },
      () => {
        setMeasuredImageSize(null);
      },
    );
  }, [resolvedLevel?.imageDataUri, resolvedImageSize]);

  const aspectRatio = resolvedImageSize ? resolvedImageSize.width / resolvedImageSize.height : 4 / 3;
  let baseViewportWidth = Math.min(Math.max(width - 96, 280), 940);
  let baseViewportHeight = baseViewportWidth / aspectRatio;

  if (baseViewportHeight > 520) {
    baseViewportHeight = 520;
    baseViewportWidth = baseViewportHeight * aspectRatio;
  }

  const markerBounds = useMemo(() => (targetMarker ? getFloorPlanMarkerBounds(targetMarker) : null), [targetMarker]);

  useEffect(() => {
    if (!markerBounds) {
      targetFade.setValue(autoFocusEnabled ? 0 : 1);
      return;
    }

    if (!autoFocusEnabled) {
      autoNavigationActiveRef.current = false;
      targetFade.setValue(1);
      zoomAnimation.stopAnimation();
      translateXAnimation.stopAnimation();
      translateYAnimation.stopAnimation();
      zoomAnimation.setValue(MIN_ZOOM);
      translateXAnimation.setValue(0);
      translateYAnimation.setValue(0);
      return;
    }

    if (hasPlayedAnimationRef.current) {
      return;
    }

    const centerXRatio = (markerBounds.minX + markerBounds.maxX) / 200;
    const centerYRatio = (markerBounds.minY + markerBounds.maxY) / 200;
    const baseTargetZoom = Math.max(1.5, 12 / Math.max(markerBounds.width, markerBounds.height, 1));
    const targetZoom = clamp(baseTargetZoom * 2, MIN_ZOOM, MAX_ZOOM);
    const targetTranslation = getFocusTranslation(
      baseViewportWidth,
      baseViewportHeight,
      centerXRatio,
      centerYRatio,
      targetZoom,
    );

    autoNavigationActiveRef.current = true;
    hasPlayedAnimationRef.current = true;
    targetFade.setValue(0);
    zoomAnimation.stopAnimation();
    translateXAnimation.stopAnimation();
    translateYAnimation.stopAnimation();
    zoomAnimation.setValue(1);
    translateXAnimation.setValue(0);
    translateYAnimation.setValue(0);

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(targetFade, {
          delay: 120,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: false,
        }),
        Animated.timing(zoomAnimation, {
          duration: 780,
          easing: Easing.out(Easing.cubic),
          toValue: targetZoom,
          useNativeDriver: true,
        }),
        Animated.timing(translateXAnimation, {
          duration: 780,
          easing: Easing.out(Easing.cubic),
          toValue: targetTranslation.x,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnimation, {
          duration: 780,
          easing: Easing.out(Easing.cubic),
          toValue: targetTranslation.y,
          useNativeDriver: true,
        }),
      ]).start(() => {
        autoNavigationActiveRef.current = false;
      });
    }, 10);

    return () => {
      autoNavigationActiveRef.current = false;
      clearTimeout(timeout);
    };
  }, [
    autoFocusEnabled,
    baseViewportHeight,
    baseViewportWidth,
    focusKey,
    markerBounds,
    targetFade,
    translateXAnimation,
    translateYAnimation,
    zoomAnimation,
  ]);

  const baseLabelMetrics = useMemo(() => {
    if (!resolvedLevel) {
      return new Map<string, { fontSize: number; inset: number; lines: number }>();
    }

    return new Map(
      resolvedLevel.markers.map((marker) => {
        const bounds = getFloorPlanMarkerBounds(marker);
        const label = formatFloorPlanLabel(marker.label);
        const isHighlightedTarget = Boolean(targetMarker && marker.id === targetMarker.id && highlightTarget);
        const inset = isHighlightedTarget ? 2 : 4;
        const labelWidth = Math.max(((bounds?.width ?? 0) / 100) * baseViewportWidth - inset * 2, 10);
        const labelHeight = Math.max(((bounds?.height ?? 0) / 100) * baseViewportHeight - inset * 2, 10);
        const maxLines = labelHeight >= 30 ? 3 : labelHeight >= 18 ? 2 : 1;
        const singleLineEstimate = label.length * 6.6;
        const lines = clamp(Math.ceil(singleLineEstimate / Math.max(labelWidth, 1)), 1, maxLines);
        const charsPerLine = Math.max(Math.ceil(label.length / lines), 1);
        const widthLimit = labelWidth / Math.max(charsPerLine * 0.7, 1);
        const heightLimit =
          lines === 3 ? labelHeight / 3.15 : lines === 2 ? labelHeight / 2.2 : labelHeight / 1.45;
        const maxFontSize = isHighlightedTarget ? 14 : 12;
        const fontSize = clamp(
          Math.floor(Math.min(widthLimit, heightLimit, maxFontSize)),
          6,
          maxFontSize,
        );

        return [
          marker.id,
          {
            fontSize,
            inset,
            lines,
          },
        ];
      }),
    );
  }, [baseViewportHeight, baseViewportWidth, highlightTarget, resolvedLevel, targetMarker]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (event, gestureState) =>
          event.nativeEvent.touches.length >= 2 ||
          Math.abs(gestureState.dx) > 2 ||
          Math.abs(gestureState.dy) > 2,
        onMoveShouldSetPanResponderCapture: (event, gestureState) =>
          event.nativeEvent.touches.length >= 2 ||
          Math.abs(gestureState.dx) > 2 ||
          Math.abs(gestureState.dy) > 2,
        onStartShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (event) => {
          autoNavigationActiveRef.current = false;
          onInteractionChange?.(true);
          zoomAnimation.stopAnimation();
          translateXAnimation.stopAnimation();
          translateYAnimation.stopAnimation();

          const touches = event.nativeEvent.touches;
          const touchCenter = getTouchCenter(touches);

          if (touches.length >= 2) {
            pinchState.current = {
              initialDistance: getTouchDistance(touches),
              initialZoom: zoomRef.current,
              initialX: translateXRef.current,
              initialY: translateYRef.current,
              initialCenterX: touchCenter.x,
              initialCenterY: touchCenter.y,
              mode: 'pinch',
            };
            return;
          }

          pinchState.current = {
            initialDistance: 0,
            initialZoom: zoomRef.current,
            initialX: translateXRef.current,
            initialY: translateYRef.current,
            initialCenterX: touchCenter.x,
            initialCenterY: touchCenter.y,
            mode: 'pan',
          };
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;

          if (touches.length >= 2) {
            const distance = getTouchDistance(touches);
            const touchCenter = getTouchCenter(touches);

            if (!distance) {
              return;
            }

            if (pinchState.current.mode !== 'pinch') {
              pinchState.current = {
                initialDistance: distance,
                initialZoom: zoomRef.current,
                initialX: translateXRef.current,
                initialY: translateYRef.current,
                initialCenterX: touchCenter.x,
                initialCenterY: touchCenter.y,
                mode: 'pinch',
              };
              return;
            }

            const nextZoom = clamp(
              pinchState.current.initialZoom * (distance / Math.max(pinchState.current.initialDistance, 1)),
              MIN_ZOOM,
              MAX_ZOOM,
            );
            const nextTranslation = clampTranslation(
              baseViewportWidth,
              baseViewportHeight,
              nextZoom,
              pinchState.current.initialX + (touchCenter.x - pinchState.current.initialCenterX),
              pinchState.current.initialY + (touchCenter.y - pinchState.current.initialCenterY),
            );

            zoomAnimation.setValue(nextZoom);
            translateXAnimation.setValue(nextTranslation.x);
            translateYAnimation.setValue(nextTranslation.y);
            return;
          }

          if (pinchState.current.mode === 'pinch' || zoomRef.current <= 1) {
            return;
          }

          const nextTranslation = clampTranslation(
            baseViewportWidth,
            baseViewportHeight,
            zoomRef.current,
            pinchState.current.initialX + gestureState.dx,
            pinchState.current.initialY + gestureState.dy,
          );

          translateXAnimation.setValue(nextTranslation.x);
          translateYAnimation.setValue(nextTranslation.y);
        },
        onPanResponderRelease: () => {
          pinchState.current.mode = null;
          onInteractionChange?.(false);
        },
        onPanResponderTerminate: () => {
          pinchState.current.mode = null;
          onInteractionChange?.(false);
        },
        onPanResponderTerminationRequest: () => true,
        onStartShouldSetPanResponder: () => true,
      }),
    [baseViewportHeight, baseViewportWidth, onInteractionChange, translateXAnimation, translateYAnimation, zoomAnimation],
  );

  if (!resolvedLevel) {
    return null;
  }

  if (isExternal) {
    return (
      <View style={styles.externalCard}>
        <View style={styles.externalHeader}>
          <View style={styles.externalIcon}>
            <Ionicons color={theme.colors.brandBlue} name="walk-outline" size={22} />
          </View>
          <View style={styles.externalCopy}>
            <Text style={styles.externalTitle}>{formatFloorPlanLabel(targetMarker?.label ?? '')}</Text>
            <Text style={styles.externalSubtitle}>Extern lokaal</Text>
          </View>
        </View>
        <Text style={styles.externalText}>
          {targetMarker?.externalLabel ??
            targetMarker?.notes ??
            'Deze les is op een externe locatie. Er is daarom geen interne plattegrond beschikbaar.'}
        </Text>
        {targetMarker?.address ? <Text style={styles.externalAddress}>{targetMarker.address}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.viewer}>
      <View {...panResponder.panHandlers} style={styles.gestureSurface}>
        <View style={[styles.viewportFrame, { height: baseViewportHeight, width: baseViewportWidth }]}>
          <View style={styles.stageContainer}>
            <Animated.View
              style={[
                styles.mapStage,
                {
                  height: baseViewportHeight,
                  transform: [
                    { translateX: translateXAnimation },
                    { translateY: translateYAnimation },
                    { scale: zoomAnimation },
                  ],
                  width: baseViewportWidth,
                },
              ]}
            >
              {resolvedLevel.imageDataUri ? (
                <Image
                  source={{ uri: resolvedLevel.imageDataUri }}
                  style={[styles.mapImage, { height: baseViewportHeight, width: baseViewportWidth }]}
                />
              ) : null}
              {resolvedLevel.markers.map((marker, index) => {
                const nextPolygon = getFloorPlanMarkerPolygon(marker);
                const isTargetMarker = Boolean(targetMarker && marker.id === targetMarker.id && highlightTarget);

                if (!nextPolygon) {
                  return null;
                }

                return (
                  <Svg
                    height={baseViewportHeight}
                    key={`${marker.id}-${marker.label}-${index}`}
                    preserveAspectRatio="none"
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                    viewBox="0 0 100 100"
                    width={baseViewportWidth}
                  >
                    <G>
                      <Polygon
                        fill={isTargetMarker ? marker.color ?? 'rgba(73, 192, 230, 0.34)' : 'rgba(38, 77, 151, 0.08)'}
                        points={nextPolygon.map((point) => `${point.x},${point.y}`).join(' ')}
                        stroke={isTargetMarker ? marker.color ?? theme.colors.brandBlue : 'rgba(38, 77, 151, 0.32)'}
                        strokeWidth={isTargetMarker ? '0.7' : '0.55'}
                      />
                    </G>
                  </Svg>
                );
              })}
              {polygon && highlightTarget ? (
                <Svg
                  height={baseViewportHeight}
                  preserveAspectRatio="none"
                  style={StyleSheet.absoluteFill}
                  viewBox="0 0 100 100"
                  width={baseViewportWidth}
                >
                  <AnimatedPolygon
                    fill={targetMarker?.color ?? 'rgba(73, 192, 230, 0.34)'}
                    fillOpacity={targetFade}
                    points={polygon.map((point) => `${point.x},${point.y}`).join(' ')}
                    stroke={targetMarker?.color ?? theme.colors.brandBlue}
                    strokeOpacity={1}
                    strokeWidth="0.7"
                  />
                </Svg>
              ) : targetMarker && highlightTarget ? (
                <View style={styles.noShapeState}>
                  <Text style={styles.noShapeTitle}>Geen gebied ingesteld</Text>
                  <Text style={styles.noShapeText}>
                    Teken in de editor een polygon of rechthoek voor dit lokaal zodat de highlight hier zichtbaar wordt.
                  </Text>
                </View>
              ) : null}
              {resolvedLevel.markers.length > 0 ? (
                <Svg
                  height={baseViewportHeight}
                  pointerEvents="none"
                  style={styles.labelLayer}
                  viewBox={`0 0 ${baseViewportWidth} ${baseViewportHeight}`}
                  width={baseViewportWidth}
                >
                  {resolvedLevel.markers.map((marker, index) => {
                    const bounds = getFloorPlanMarkerBounds(marker);
                    const metrics = baseLabelMetrics.get(marker.id);

                    if (!bounds || !metrics) {
                      return null;
                    }

                    const isTarget = Boolean(targetMarker && marker.id === targetMarker.id && highlightTarget);
                    const label = formatFloorPlanLabel(marker.label);
                    const labelLines = splitFloorPlanLabel(label, metrics.lines);
                    const inset = metrics.inset;
                    const labelLeft = (bounds.minX / 100) * baseViewportWidth + inset;
                    const labelTop = (bounds.minY / 100) * baseViewportHeight + inset;
                    const labelWidth = Math.max((bounds.width / 100) * baseViewportWidth - inset * 2, 0);
                    const labelHeight = Math.max((bounds.height / 100) * baseViewportHeight - inset * 2, 0);

                    if (labelWidth <= 0 || labelHeight <= 0) {
                      return null;
                    }

                    const centerX = labelLeft + labelWidth / 2;
                    const centerY = labelTop + labelHeight / 2;
                    const lineHeight =
                      metrics.lines === 3 ? metrics.fontSize + 1 : metrics.lines === 2 ? metrics.fontSize + 2 : metrics.fontSize + 1;
                    const firstLineY = centerY - ((labelLines.length - 1) * lineHeight) / 2;

                    return (
                      <SvgText
                        alignmentBaseline="middle"
                        fill={isTarget ? styles.markerLabelActive.color : styles.markerLabelMuted.color}
                        fontFamily={theme.fonts.heavy}
                        fontSize={metrics.fontSize}
                        key={`${marker.id}-${marker.label}-${index}`}
                        stroke="rgba(255,255,255,0.96)"
                        strokeWidth={0.55}
                        textAnchor="middle"
                        x={centerX}
                        y={firstLineY}
                      >
                        {labelLines.map((line, lineIndex) => (
                          <TSpan dy={lineIndex === 0 ? 0 : lineHeight} key={`${marker.id}-line-${lineIndex}`} x={centerX}>
                            {line}
                          </TSpan>
                        ))}
                      </SvgText>
                    );
                  })}
                </Svg>
              ) : null}
            </Animated.View>
            {targetMarker && highlightTarget ? (
              <View pointerEvents="none" style={styles.focusBadge}>
                <Text style={styles.focusBadgeLabel}>{formatFloorPlanLabel(targetMarker.label)}</Text>
                <Text style={styles.focusBadgeMeta}>{resolvedLevel.label}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {showHint ? (
        <Text style={styles.hint}>Knijp met twee vingers om te zoomen en sleep met een vinger om over de kaart te bewegen.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  viewer: {
    marginTop: 18,
  },
  gestureSurface: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  viewportFrame: {
    backgroundColor: theme.colors.paper,
    borderColor: theme.colors.divider,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stageContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapStage: {
    backgroundColor: theme.colors.paper,
    overflow: 'hidden',
    position: 'relative',
  },
  mapImage: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  labelLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  markerLabelMuted: {
    color: 'rgba(23, 50, 94, 0.82)',
  },
  markerLabelActive: {
    color: theme.colors.brandBlueDeep,
  },
  focusBadge: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: theme.colors.divider,
    borderRadius: 16,
    borderWidth: 1,
    left: 16,
    maxWidth: 220,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    top: 16,
  },
  focusBadgeLabel: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 16,
    lineHeight: 20,
  },
  focusBadgeMeta: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  noShapeState: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 18,
    left: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    position: 'absolute',
    top: 24,
  },
  noShapeTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
  noShapeText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 240,
    textAlign: 'center',
  },
  hint: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  externalCard: {
    backgroundColor: '#F7FAFF',
    borderColor: theme.colors.divider,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    padding: 18,
  },
  externalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  externalIcon: {
    alignItems: 'center',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  externalCopy: {
    flex: 1,
    marginLeft: 12,
  },
  externalTitle: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 22,
  },
  externalSubtitle: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  externalText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
  },
  externalAddress: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
  },
});
