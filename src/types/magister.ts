export interface MagisterProfile {
  id: number;
  firstName: string;
  infix?: string;
  lastName: string;
  fullName: string;
  personId?: number;
}

export interface StoredSession extends MagisterProfile {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  xsrfToken?: string;
  tokenExpiresAt?: number;
  attendanceStudentId?: string;
  authMode: 'manual' | 'oauth';
  hasApiAccess: boolean;
  lastSyncedAt?: string;
}

export interface AccountResponse {
  Persoon?: {
    Id?: number;
    Roepnaam?: string;
    Tussenvoegsel?: string;
    Achternaam?: string;
  };
}

export interface RawMagisterAppointment {
  Id?: number;
  Omschrijving?: string;
  Start?: string;
  Einde?: string;
  LesuurVan?: number;
  LesuurTotMet?: number;
  DuurtHeleDag?: boolean;
  Lokatie?: string;
  Lokalen?: Array<{ Naam?: string }>;
  Vakken?: Array<{ Naam?: string; Code?: string }>;
  Docenten?: Array<{ Naam?: string }>;
  Inhoud?: string;
  InfoType?: number;
  HeeftBijlagen?: boolean;
  Status?: number;
  Type?: number;
  Subtype?: number;
  StatusNaam?: string;
  OmschrijvingStatus?: string;
  Aantekening?: string;
  LesIsVervallen?: boolean;
  Afgerond?: boolean;
}

export interface MagisterAppointment {
  id: string;
  title: string;
  subject: string;
  start: string;
  end: string;
  location: string;
  teachers: string;
  lessonHour?: number | null;
  lessonHourEnd?: number | null;
  lessonHours?: string | null;
  isAllDay?: boolean;
  description?: string;
  infoType?: number | null;
  hasAttachments?: boolean;
  isCancelled?: boolean;
  status?: number | null;
  type?: number | null;
  subtype?: number | null;
  completed?: boolean;
}

export interface MagisterGradeResult {
  id: string;
  subject: string;
  title: string;
  grade: string;
  weight?: string | null;
  enteredAt?: string | null;
}

export interface MagisterSubjectAverage {
  id: string;
  subject: string;
  average: string;
  roundedAverage?: string | null;
  exactAverage?: string | null;
  gradeCount: number;
  numericAverage?: number | null;
  scale?: 'numeric' | 'qualitative';
  weightTotal?: number;
}

export interface MagisterMessageSender {
  id: number;
  name: string;
}

export interface MagisterMessageSummary {
  id: number;
  subject: string;
  folderId: number;
  sender: MagisterMessageSender | null;
  hasPriority: boolean;
  hasAttachments: boolean;
  isRead: boolean;
  sentAt: string;
  selfLink?: string | null;
}

export interface MagisterMessageRecipient {
  id: number;
  displayName: string;
  type: string;
  mailGroup?: string | null;
}

export interface MagisterMessageAttachment {
  id: number;
  name: string;
  contentType?: string | null;
  size?: number | null;
  createdAt?: string | null;
  modifiedAt?: string | null;
  status?: string | null;
  selfLink?: string | null;
  downloadLink?: string | null;
}

export interface MagisterMessageDetail extends MagisterMessageSummary {
  bodyHtml: string;
  bodyText: string;
  recipients: MagisterMessageRecipient[];
  ccRecipients: MagisterMessageRecipient[];
  bccRecipients: MagisterMessageRecipient[];
  attachments: MagisterMessageAttachment[];
}

export interface MagisterMessageComposeRecipient {
  id: number;
  type: 'groep' | 'persoon';
}

export interface MagisterContactPerson {
  id: number;
  initials?: string | null;
  firstName?: string | null;
  infix?: string | null;
  lastName?: string | null;
  className?: string | null;
  type: string;
  displayName: string;
}

export interface MagisterAbsenceNotice {
  id: string;
  code: string;
  description: string;
  start: string;
  end: string;
  creatorName?: string | null;
  modifiedByName?: string | null;
  lastModified?: string | null;
}

export interface MagisterLessonAbsence {
  id: number;
  code: string;
  description: string;
  isExcused: boolean;
  lessonHour?: number | null;
  start: string;
  end: string;
  appointmentId?: number | null;
  appointmentTitle?: string | null;
  appointmentLocation?: string | null;
  appointmentContent?: string | null;
  hasAttachments: boolean;
}

export interface MagisterLearningResourceLink {
  rel: string;
  href: string;
}

export interface MagisterLearningResource {
  id: number;
  materialType: number;
  title: string;
  publisher?: string | null;
  status?: number | null;
  start?: string | null;
  end?: string | null;
  ean?: string | null;
  subjectAbbreviation?: string | null;
  subjectName?: string | null;
  links: MagisterLearningResourceLink[];
  contentLink?: string | null;
}

export interface MagisterTokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  xsrfToken?: string;
  tokenExpiresAt?: number;
}

export interface MagisterApiLink {
  rel: string;
  href: string;
}

export interface MagisterActivity {
  id: string;
  activityId: number;
  title: string;
  details?: string;
  visibleFrom?: string | null;
  visibleTo?: string | null;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  maximumRegistrations: number | null;
  minimumRegistrations: number | null;
  status: number | null;
  accessType: number | null;
  subscriptionCount: number;
  links: MagisterApiLink[];
  selfLink?: string | null;
}

export interface MagisterActivityElement {
  id: string;
  elementId: number;
  activityId: number;
  title: string;
  details?: string;
  subjectCode?: string | null;
  teacherCode?: string | null;
  room?: string | null;
  variantCode?: string | null;
  topic?: string | null;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
  maxParticipants: number | null;
  minParticipants: number | null;
  colorIndex: number | null;
  isSubscribed: boolean;
  isMandatory: boolean;
  availableSeats: number | null;
  canSubscribe: boolean;
  links: MagisterApiLink[];
  subscriptionLink?: string | null;
  selfLink?: string | null;
}

export interface StoredMagisterCache {
  personId: number;
  cachedAt: string;
  scheduleFrom?: string;
  scheduleTo?: string;
  appointments: MagisterAppointment[];
  grades: MagisterGradeResult[];
  subjectAverages: MagisterSubjectAverage[];
  inboxPreview: MagisterMessageSummary[];
}
