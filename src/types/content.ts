export interface SchoolAgendaItem {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  description?: string;
  url?: string;
}

export interface SchoolNewsItem {
  id: string;
  title: string;
  summary: string;
  link: string;
  imageUrl?: string;
  publishedAt: string;
}

export interface SchoolNewsArticle extends SchoolNewsItem {
  body: string[];
}

export type SchoolStaticPageId = 'about' | 'dmr' | 'studentCouncil';
export type SchoolStaffCategory = 'schoolleiding' | 'onderwijzend' | 'ondersteunend';

export interface SchoolStaffMember {
  id: string;
  name: string;
  emailPrefix: string;
  role: string;
  category: SchoolStaffCategory;
  abbreviation?: string;
}

export interface SchoolPageLink {
  label: string;
  description?: string;
  externalUrl?: string;
  pageId?: SchoolStaticPageId;
  route?: 'SchoolStaffDirectory';
}

export interface SchoolPageSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  links?: SchoolPageLink[];
}

export interface SchoolStaticPage {
  id: SchoolStaticPageId;
  heroTitle: string;
  heroSubtitle: string;
  sections: SchoolPageSection[];
}

export interface AppPreferences {
  mailNotificationsEnabled: boolean;
  priorityMailOnlyNotifications: boolean;
  gradeNotifications: boolean;
  scheduleChangeNotifications: boolean;
  agendaReminders: boolean;
  agendaAutoAddEnabled: boolean;
  demoModeEnabled: boolean;
  lessonRemindersEnabled: boolean;
  onboardingCompleted: boolean;
  roundAveragesToWholeNumbers: boolean;
  savedReminderEventIds: string[];
}
