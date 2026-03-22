import { NavigatorScreenParams } from '@react-navigation/native';

import { SchoolStaticPageId } from './content';

export type HomeStackParamList = {
  HomeIndex: undefined;
  FloorPlan: {
    focusLocation?: string;
    focusNonce?: string;
  } | undefined;
  NewsArticle: {
    articleId: string;
    fallbackImageUrl?: string;
    fallbackPublishedAt?: string;
    fallbackTitle?: string;
  };
  SchoolPage: {
    pageId: SchoolStaticPageId;
  };
  SchoolStaffDirectory: undefined;
  SchoolStaffMember: {
    memberId: string;
  };
};

export type ScheduleStackParamList = {
  ScheduleIndex:
    | {
        focusAppointmentId?: string;
        focusDate?: string;
        focusNonce?: string;
      }
    | undefined;
  ActivityDetails: {
    activityId: number;
    details?: string;
    subscriptionEnd?: string | null;
    subscriptionStart?: string | null;
    selfLink?: string | null;
    title: string;
    visibleFrom?: string | null;
    visibleTo?: string | null;
  };
};

export type RootTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList> | undefined;
  Rooster: NavigatorScreenParams<ScheduleStackParamList> | undefined;
  Cijfers:
    | {
        focusGradeId?: string;
        focusNonce?: string;
      }
    | undefined;
  Profiel: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type ProfileStackParamList = {
  ProfileIndex: undefined;
  Inbox: undefined;
  InboxMessage: {
    messageId: number;
  };
  ComposeMessage: undefined;
  AbsenceOverview: undefined;
  LearningResources: undefined;
};
