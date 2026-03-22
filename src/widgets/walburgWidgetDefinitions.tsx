import type { ReactNode } from 'react';
import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  cornerRadius,
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

export type LessonWidgetProps = {
  heading: string;
  title: string;
  time: string;
  meta: string;
  footer: string;
};

export type AgendaWidgetProps = {
  heading: string;
  title: string;
  time: string;
  meta: string;
  footer: string;
};

export type GradeWidgetProps = {
  heading: string;
  subject: string;
  title: string;
  grade: string;
  footer: string;
};

export type LessonAgendaWidgetProps = {
  lessonHeading: string;
  lessonTitle: string;
  lessonTime: string;
  lessonMeta: string;
  agendaHeading: string;
  agendaTitle: string;
  agendaTime: string;
  agendaMeta: string;
};

export type LessonGradeWidgetProps = {
  lessonHeading: string;
  lessonTitle: string;
  lessonTime: string;
  lessonMeta: string;
  gradeHeading: string;
  gradeSubject: string;
  gradeTitle: string;
  gradeValue: string;
};

function widgetShell(children: ReactNode) {
  return (
    <VStack
      spacing={10}
      modifiers={[padding({ all: 16 }), background('#17325E'), cornerRadius(24)]}
    >
      {children}
    </VStack>
  );
}

function widgetHeading(value: string) {
  return (
    <Text
      modifiers={[
        font({ size: 11, weight: 'bold' }),
        foregroundStyle('#7AD6F0'),
        lineLimit(1),
      ]}
    >
      {value.toUpperCase()}
    </Text>
  );
}

function sectionCard(children: ReactNode) {
  return (
    <VStack
      spacing={6}
      modifiers={[padding({ all: 12 }), background('#264D97'), cornerRadius(18)]}
    >
      {children}
    </VStack>
  );
}

const NextLessonSmallWidgetView = (props: LessonWidgetProps) => {
  'widget';

  return widgetShell(
    <>
      {widgetHeading(props.heading)}
      <Text
        modifiers={[
          font({ size: 19, weight: 'heavy' }),
          foregroundStyle('#FFFFFF'),
          lineLimit(2),
        ]}
      >
        {props.title}
      </Text>
      <Text
        modifiers={[
          font({ size: 15, weight: 'bold', design: 'monospaced' }),
          foregroundStyle('#FFFFFF'),
          monospacedDigit(),
          lineLimit(1),
        ]}
      >
        {props.time}
      </Text>
      <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#D7E2F0'), lineLimit(1)]}>
        {props.meta}
      </Text>
      <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>
        {props.footer}
      </Text>
    </>,
  );
};

const TodayAgendaSmallWidgetView = (props: AgendaWidgetProps) => {
  'widget';

  return widgetShell(
    <>
      {widgetHeading(props.heading)}
      <Text
        modifiers={[
          font({ size: 18, weight: 'heavy' }),
          foregroundStyle('#FFFFFF'),
          lineLimit(2),
        ]}
      >
        {props.title}
      </Text>
      <Text
        modifiers={[
          font({ size: 15, weight: 'bold', design: 'monospaced' }),
          foregroundStyle('#FFFFFF'),
          monospacedDigit(),
          lineLimit(1),
        ]}
      >
        {props.time}
      </Text>
      <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#D7E2F0'), lineLimit(1)]}>
        {props.meta}
      </Text>
      <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>
        {props.footer}
      </Text>
    </>,
  );
};

const LatestGradeSmallWidgetView = (props: GradeWidgetProps) => {
  'widget';

  return widgetShell(
    <>
      {widgetHeading(props.heading)}
      <HStack alignment="center" spacing={12}>
        <VStack
          spacing={2}
          modifiers={[padding({ all: 12 }), background('#EAF4D5'), cornerRadius(18)]}
        >
          <Text modifiers={[font({ size: 26, weight: 'heavy' }), foregroundStyle('#17325E')]}>
            {props.grade}
          </Text>
        </VStack>
        <VStack spacing={4}>
          <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>
            {props.subject}
          </Text>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#D7E2F0'), lineLimit(2)]}>
            {props.title}
          </Text>
        </VStack>
      </HStack>
      <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>
        {props.footer}
      </Text>
    </>,
  );
};

const NextLessonAgendaMediumWidgetView = (props: LessonAgendaWidgetProps) => {
  'widget';

  return widgetShell(
    <HStack spacing={12}>
      {sectionCard(
        <>
          {widgetHeading(props.lessonHeading)}
          <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>
            {props.lessonTitle}
          </Text>
          <Text
            modifiers={[
              font({ size: 14, weight: 'bold', design: 'monospaced' }),
              foregroundStyle('#FFFFFF'),
              monospacedDigit(),
              lineLimit(1),
            ]}
          >
            {props.lessonTime}
          </Text>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#D7E2F0'), lineLimit(2)]}>
            {props.lessonMeta}
          </Text>
        </>,
      )}
      {sectionCard(
        <>
          {widgetHeading(props.agendaHeading)}
          <Text modifiers={[font({ size: 17, weight: 'heavy' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>
            {props.agendaTitle}
          </Text>
          <Text
            modifiers={[
              font({ size: 14, weight: 'bold', design: 'monospaced' }),
              foregroundStyle('#FFFFFF'),
              monospacedDigit(),
              lineLimit(1),
            ]}
          >
            {props.agendaTime}
          </Text>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#D7E2F0'), lineLimit(2)]}>
            {props.agendaMeta}
          </Text>
        </>,
      )}
    </HStack>,
  );
};

const NextLessonGradeMediumWidgetView = (props: LessonGradeWidgetProps) => {
  'widget';

  return widgetShell(
    <HStack spacing={12}>
      {sectionCard(
        <>
          {widgetHeading(props.lessonHeading)}
          <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>
            {props.lessonTitle}
          </Text>
          <Text
            modifiers={[
              font({ size: 14, weight: 'bold', design: 'monospaced' }),
              foregroundStyle('#FFFFFF'),
              monospacedDigit(),
              lineLimit(1),
            ]}
          >
            {props.lessonTime}
          </Text>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#D7E2F0'), lineLimit(2)]}>
            {props.lessonMeta}
          </Text>
        </>,
      )}
      {sectionCard(
        <>
          {widgetHeading(props.gradeHeading)}
          <Text modifiers={[font({ size: 18, weight: 'heavy' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>
            {props.gradeSubject}
          </Text>
          <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle('#D7E2F0'), lineLimit(2)]}>
            {props.gradeTitle}
          </Text>
          <Text modifiers={[font({ size: 27, weight: 'heavy' }), foregroundStyle('#AAD44F'), lineLimit(1)]}>
            {props.gradeValue}
          </Text>
        </>,
      )}
    </HStack>,
  );
};

export const nextLessonSmallWidget = createWidget('WalburgNextLessonWidget', NextLessonSmallWidgetView);
export const todayAgendaSmallWidget = createWidget('WalburgTodayAgendaWidget', TodayAgendaSmallWidgetView);
export const latestGradeSmallWidget = createWidget('WalburgLatestGradeWidget', LatestGradeSmallWidgetView);
export const nextLessonAgendaMediumWidget = createWidget(
  'WalburgNextLessonAgendaWidget',
  NextLessonAgendaMediumWidgetView,
);
export const nextLessonGradeMediumWidget = createWidget(
  'WalburgNextLessonGradeWidget',
  NextLessonGradeMediumWidgetView,
);
