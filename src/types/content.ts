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

export interface AppPreferences {
  gradeNotifications: boolean;
  scheduleChangeNotifications: boolean;
  agendaReminders: boolean;
  agendaAutoAddEnabled: boolean;
  roundAveragesToWholeNumbers: boolean;
  savedReminderEventIds: string[];
}
