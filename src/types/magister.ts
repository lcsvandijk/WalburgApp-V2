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
  StatusNaam?: string;
  OmschrijvingStatus?: string;
  Aantekening?: string;
  LesIsVervallen?: boolean;
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
}

export interface MagisterTokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  xsrfToken?: string;
  tokenExpiresAt?: number;
}

export interface StoredMagisterCache {
  personId: number;
  cachedAt: string;
  scheduleFrom?: string;
  scheduleTo?: string;
  appointments: MagisterAppointment[];
  grades: MagisterGradeResult[];
  subjectAverages: MagisterSubjectAverage[];
}
