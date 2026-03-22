import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { theme } from '../constants/theme';
import { MagisterGradeResult } from '../types/magister';

type GradeTrendChartProps = {
  grades: MagisterGradeResult[];
  average?: number | null;
};

type ChartPoint = {
  id: string;
  title: string;
  grade: string;
  numericGrade: number;
  indexLabel: string;
};

const CHART_HEIGHT = 174;
const CHART_PADDING_TOP = 18;
const CHART_PADDING_BOTTOM = 28;
const CHART_PADDING_HORIZONTAL = 18;

function parseGradeNumber(value: string) {
  const normalized = Number(value.replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : null;
}

function formatChartGrade(value: number) {
  return value.toFixed(1).replace('.', ',');
}

export function GradeTrendChart({ grades, average }: GradeTrendChartProps) {
  const chartPoints = useMemo<ChartPoint[]>(
    () =>
      grades
        .map((grade, index) => {
          const numericGrade = parseGradeNumber(grade.grade);

          if (numericGrade == null) {
            return null;
          }

          return {
            id: grade.id,
            title: grade.title,
            grade: grade.grade,
            numericGrade,
            indexLabel: String(index + 1),
          };
        })
        .filter((value): value is ChartPoint => Boolean(value)),
    [grades],
  );

  if (chartPoints.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>Voor dit vak zijn nog geen cijferpunten beschikbaar.</Text>
      </View>
    );
  }

  const plotWidth = Math.max(220, chartPoints.length * 54);
  const chartWidth = plotWidth + CHART_PADDING_HORIZONTAL * 2;
  const plotHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  const getY = (value: number) => {
    const clamped = Math.min(10, Math.max(1, value));
    const ratio = (10 - clamped) / 9;
    return CHART_PADDING_TOP + ratio * plotHeight;
  };

  const getX = (index: number) => {
    if (chartPoints.length === 1) {
      return chartWidth / 2;
    }

    const availableWidth = plotWidth;
    const step = availableWidth / (chartPoints.length - 1);
    return CHART_PADDING_HORIZONTAL + index * step;
  };

  const path = chartPoints
    .map((point, index) => {
      const x = getX(index);
      const y = getY(point.numericGrade);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const averageLine = average != null ? getY(average) : null;
  const guideValues = [10, 5.5, 1];

  return (
    <View style={styles.container}>
      <Svg height={CHART_HEIGHT} viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} width="100%">
        {guideValues.map((guide) => {
          const y = getY(guide);

          return (
            <Line
              key={guide}
              stroke={guide === 5.5 ? '#B8CBE5' : '#DCE7F5'}
              strokeDasharray={guide === 5.5 ? '4 4' : undefined}
              strokeWidth={1}
              x1={CHART_PADDING_HORIZONTAL}
              x2={chartWidth - CHART_PADDING_HORIZONTAL}
              y1={y}
              y2={y}
            />
          );
        })}

        {averageLine != null ? (
          <Line
            stroke={theme.colors.brandGreenDark}
            strokeDasharray="6 4"
            strokeWidth={2}
            x1={CHART_PADDING_HORIZONTAL}
            x2={chartWidth - CHART_PADDING_HORIZONTAL}
            y1={averageLine}
            y2={averageLine}
          />
        ) : null}

        {chartPoints.length > 1 ? (
          <Path
            d={path}
            fill="none"
            stroke={theme.colors.brandBlue}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        ) : null}

        {chartPoints.map((point, index) => {
          const x = getX(index);
          const y = getY(point.numericGrade);

          return (
            <Circle
              key={point.id}
              cx={x}
              cy={y}
              fill={theme.colors.paper}
              r={6}
              stroke={theme.colors.brandBlue}
              strokeWidth={3}
            />
          );
        })}
      </Svg>

      <View style={styles.axisLabels}>
        {chartPoints.map((point) => (
          <View key={point.id} style={styles.axisLabelWrap}>
            <Text style={styles.axisLabel}>{point.indexLabel}</Text>
          </View>
        ))}
      </View>

      {average != null ? (
        <View style={styles.averageHint}>
          <View style={styles.averageHintDot} />
          <Text style={styles.averageHintText}>Gemiddelde lijn: {formatChartGrade(average)}</Text>
        </View>
      ) : null}

      <View style={styles.legendList}>
        {chartPoints.map((point) => (
          <View key={point.id} style={styles.legendRow}>
            <Text style={styles.legendIndex}>{point.indexLabel}</Text>
            <Text numberOfLines={1} style={styles.legendTitle}>
              {point.title}
            </Text>
            <Text style={styles.legendGrade}>{point.grade}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#F7FAFF',
    borderColor: theme.colors.divider,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyStateText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  axisLabels: {
    flexDirection: 'row',
    marginTop: -6,
    paddingHorizontal: CHART_PADDING_HORIZONTAL - 8,
  },
  axisLabelWrap: {
    alignItems: 'center',
    flex: 1,
  },
  axisLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
    fontSize: 11,
  },
  averageHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  averageHintDot: {
    backgroundColor: theme.colors.brandGreenDark,
    borderRadius: theme.radius.pill,
    height: 8,
    width: 18,
  },
  averageHintText: {
    color: theme.colors.textSoft,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
  },
  legendList: {
    backgroundColor: '#F8FBFF',
    borderRadius: 16,
    marginTop: 14,
    overflow: 'hidden',
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  legendIndex: {
    color: theme.colors.brandBlue,
    fontFamily: theme.fonts.heavy,
    fontSize: 12,
    width: 14,
  },
  legendTitle: {
    color: theme.colors.brandBlueDeep,
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  legendGrade: {
    color: theme.colors.brandBlueDeep,
    fontFamily: theme.fonts.heavy,
    fontSize: 13,
  },
});
