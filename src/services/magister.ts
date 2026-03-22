import {
  AccountResponse,
  MagisterActivity,
  MagisterActivityElement,
  MagisterApiLink,
  MagisterAppointment,
  MagisterContactPerson,
  MagisterGradeResult,
  MagisterLearningResource,
  MagisterLessonAbsence,
  MagisterMessageAttachment,
  MagisterMessageComposeRecipient,
  MagisterMessageDetail,
  MagisterMessageRecipient,
  MagisterMessageSender,
  MagisterMessageSummary,
  MagisterProfile,
  MagisterAbsenceNotice,
  MagisterSubjectAverage,
  RawMagisterAppointment,
  StoredSession,
} from '../types/magister';
import { formatDisplayLocation } from '../lib/location';
import { extractParagraphs, stripHtml } from '../lib/text';

const MAGISTER_API_BASE = 'https://ozhw.magister.net/api';
const ATTENDANCE_API_BASE = 'https://attendance.magister.net/api/v2';

type UnknownRecord = Record<string, unknown>;

function getField(record: UnknownRecord | null | undefined, ...keys: string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function buildHeaders(session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (session.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  if (session.xsrfToken || session.accessToken) {
    headers['X-XSRF-TOKEN'] = session.xsrfToken ?? session.accessToken ?? '';
  }

  return headers;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function magisterGet<T>(
  path: string,
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
): Promise<T> {
  const response = await fetch(`${MAGISTER_API_BASE}${path}`, {
    method: 'GET',
    headers: buildHeaders(session),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Magister reageert nu te vaak met 429. Wacht heel even en probeer daarna opnieuw.');
    }

    throw new Error(`Magister request faalde met status ${response.status}`);
  }

  return (await response.json()) as T;
}

function normalizeMagisterPath(pathOrHref: string) {
  if (!pathOrHref.trim()) {
    throw new Error('Lege Magister-link ontvangen.');
  }

  if (pathOrHref.startsWith('http://') || pathOrHref.startsWith('https://')) {
    const url = new URL(pathOrHref);
    return url.pathname.replace(/^\/api/, '') + url.search;
  }

  if (pathOrHref.startsWith('/api/')) {
    return pathOrHref.replace(/^\/api/, '');
  }

  return pathOrHref.startsWith('/') ? pathOrHref : `/${pathOrHref}`;
}

async function magisterRequest<T>(
  method: 'DELETE' | 'GET' | 'POST' | 'PUT',
  pathOrHref: string,
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${MAGISTER_API_BASE}${normalizeMagisterPath(pathOrHref)}`, {
    method,
    headers: buildHeaders(session),
    body: body == null ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Magister reageert nu te vaak met 429. Wacht heel even en probeer daarna opnieuw.');
    }

    throw new Error(`Magister request faalde met status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function attendanceGet<T>(
  path: string,
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
): Promise<T> {
  const response = await fetch(`${ATTENDANCE_API_BASE}${path}`, {
    method: 'GET',
    headers: buildHeaders(session),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Magister attendance reageert nu te vaak met 429. Wacht heel even en probeer daarna opnieuw.');
    }

    throw new Error(`Attendance request faalde met status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function magisterGetFirstAvailable<T>(
  paths: string[],
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
): Promise<T> {
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      return await magisterGet<T>(path, session);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Onbekende Magister-fout.');

      if (!/status 404/.test(lastError.message)) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error('Geen bruikbaar Magister-endpoint gevonden.');
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? (value as UnknownRecord) : null;
}

function nestedRecord(record: UnknownRecord | null | undefined, ...keys: string[]) {
  return asRecord(getField(record, ...keys));
}

function stringValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed || null;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return null;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = Number(value.replace(',', '.'));

    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

const QUALITATIVE_GRADE_VALUES: Record<string, number> = {
  O: 1,
  V: 2,
  G: 3,
  U: 4,
};

function numericValueOnly(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(',', '.');
  const match = normalized.match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function qualitativeGradeValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized in QUALITATIVE_GRADE_VALUES ? QUALITATIVE_GRADE_VALUES[normalized] : null;
}

function gradeValueToNumeric(value?: string | null) {
  return numericValueOnly(value) ?? qualitativeGradeValue(value);
}

function qualitativeAverageLabel(value: number) {
  const rounded = clamp(Math.round(value), 1, 4);

  return (
    Object.entries(QUALITATIVE_GRADE_VALUES).find(([, numericValue]) => numericValue === rounded)?.[0] ??
    'O'
  );
}

function formatGradeValue(value: number, decimals = 1) {
  return value.toFixed(decimals).replace('.', ',');
}

function extractCollection(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidate = asRecord(payload);

  if (!candidate) {
    return [];
  }

  for (const key of keys) {
    const collection = candidate[key];

    if (Array.isArray(collection)) {
      return collection;
    }
  }

  return [];
}

function extractLinks(record: UnknownRecord | null | undefined) {
  const values = getField(record, 'Links', 'links');

  if (!Array.isArray(values)) {
    return [] as MagisterApiLink[];
  }

  return values
    .map((value) => asRecord(value))
    .filter((value): value is UnknownRecord => Boolean(value))
    .map((value) => ({
      href: stringValue(getField(value, 'Href', 'href')) ?? '',
      rel: stringValue(getField(value, 'Rel', 'rel')) ?? '',
    }))
    .filter((value) => Boolean(value.href) && Boolean(value.rel));
}

function extractNamedLinks(record: UnknownRecord | null | undefined) {
  const linksRecord = nestedRecord(record, 'links', 'Links');

  if (!linksRecord) {
    return {} as Record<string, string>;
  }

  return Object.fromEntries(
    Object.entries(linksRecord)
      .map(([key, value]) => {
        const linkRecord = asRecord(value);
        const href = stringValue(getField(linkRecord, 'href', 'Href'));

        return href ? [key, href] : null;
      })
      .filter((value): value is [string, string] => Boolean(value)),
  );
}

function linkByRel(links: MagisterApiLink[], rel: string) {
  return links.find((link) => link.rel.toLowerCase() === rel.toLowerCase())?.href ?? null;
}

function formatMessageSender(record: UnknownRecord | null | undefined): MagisterMessageSender | null {
  if (!record) {
    return null;
  }

  const id = numberValue(getField(record, 'id', 'Id'));
  const name = stringValue(getField(record, 'naam', 'Naam', 'weergavenaam', 'Weergavenaam'));

  if (id == null && !name) {
    return null;
  }

  return {
    id: id ?? 0,
    name: name ?? 'Onbekende afzender',
  };
}

function formatMessageRecipient(record: UnknownRecord | null | undefined): MagisterMessageRecipient | null {
  if (!record) {
    return null;
  }

  const id = numberValue(getField(record, 'id', 'Id'));
  const displayName = stringValue(getField(record, 'weergavenaam', 'Weergavenaam', 'naam', 'Naam'));
  const type = stringValue(getField(record, 'type', 'Type'));

  if (id == null || !displayName || !type) {
    return null;
  }

  return {
    id,
    displayName,
    type,
    mailGroup: stringValue(getField(record, 'mailGroep', 'MailGroep')),
  };
}

function normalizeMessageSummary(record: UnknownRecord): MagisterMessageSummary {
  const links = extractNamedLinks(record);

  return {
    id: numberValue(getField(record, 'id', 'Id')) ?? 0,
    subject:
      stringValue(getField(record, 'onderwerp', 'Onderwerp')) ??
      stringValue(getField(record, 'subject', 'Subject')) ??
      'Bericht',
    folderId: numberValue(getField(record, 'mapId', 'MapId')) ?? 0,
    sender: formatMessageSender(nestedRecord(record, 'afzender', 'Afzender')),
    hasPriority: getField(record, 'heeftPrioriteit', 'HeeftPrioriteit') === true,
    hasAttachments: getField(record, 'heeftBijlagen', 'HeeftBijlagen') === true,
    isRead: getField(record, 'isGelezen', 'IsGelezen') === true,
    sentAt: stringValue(getField(record, 'verzondenOp', 'VerzondenOp')) ?? new Date().toISOString(),
    selfLink: links.self ?? null,
  };
}

function normalizeMessageAttachment(record: UnknownRecord): MagisterMessageAttachment {
  const links = extractNamedLinks(record);

  return {
    id: numberValue(getField(record, 'id', 'Id')) ?? 0,
    name: stringValue(getField(record, 'naam', 'Naam')) ?? 'Bijlage',
    contentType: stringValue(getField(record, 'contentType', 'ContentType')),
    size: numberValue(getField(record, 'grootte', 'Grootte')),
    createdAt: stringValue(getField(record, 'aangemaaktOp', 'AangemaaktOp')),
    modifiedAt: stringValue(getField(record, 'gewijzigdOp', 'GewijzigdOp')),
    status: stringValue(getField(record, 'status', 'Status')),
    selfLink: links.self ?? null,
    downloadLink: links.download ?? null,
  };
}

function normalizeMessageList(payload: unknown) {
  return extractCollection(payload, ['items', 'Items'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map(normalizeMessageSummary)
    .filter((item) => item.id > 0)
    .sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime());
}

function normalizeMessageDetail(payload: unknown, attachments: MagisterMessageAttachment[]): MagisterMessageDetail {
  const record = asRecord(payload);

  if (!record) {
    throw new Error('Berichtdetail ontbreekt.');
  }

  const summary = normalizeMessageSummary(record);
  const recipients = extractCollection(payload, ['ontvangers', 'Ontvangers'])
    .map((item) => formatMessageRecipient(asRecord(item)))
    .filter((item): item is MagisterMessageRecipient => Boolean(item));
  const ccRecipients = extractCollection(payload, ['kopieOntvangers', 'KopieOntvangers'])
    .map((item) => formatMessageRecipient(asRecord(item)))
    .filter((item): item is MagisterMessageRecipient => Boolean(item));
  const bccRecipients = extractCollection(payload, ['blindeKopieOntvangers', 'BlindeKopieOntvangers'])
    .map((item) => formatMessageRecipient(asRecord(item)))
    .filter((item): item is MagisterMessageRecipient => Boolean(item));
  const bodyHtml = stringValue(getField(record, 'inhoud', 'Inhoud')) ?? '';

  return {
    ...summary,
    bodyHtml,
    bodyText: extractParagraphs(bodyHtml).join('\n\n'),
    recipients,
    ccRecipients,
    bccRecipients,
    attachments,
  };
}

function normalizeContactPerson(record: UnknownRecord): MagisterContactPerson {
  const firstName = stringValue(getField(record, 'roepnaam', 'Roepnaam'));
  const infix = stringValue(getField(record, 'tussenvoegsel', 'Tussenvoegsel'));
  const lastName = stringValue(getField(record, 'achternaam', 'Achternaam'));
  const initials = stringValue(getField(record, 'voorletters', 'Voorletters'));

  return {
    id: numberValue(getField(record, 'id', 'Id')) ?? 0,
    initials,
    firstName,
    infix,
    lastName,
    className: stringValue(getField(record, 'klas', 'Klas')),
    type: stringValue(getField(record, 'type', 'Type')) ?? 'persoon',
    displayName:
      [firstName, infix, lastName].filter(Boolean).join(' ').trim() ||
      stringValue(getField(record, 'naam', 'Naam')) ||
      'Onbekend contact',
  };
}

function formatAbsenceActor(record: UnknownRecord | null | undefined) {
  if (!record) {
    return null;
  }

  return [stringValue(getField(record, 'initials', 'Initials')), stringValue(getField(record, 'infix', 'Infix')), stringValue(getField(record, 'lastName', 'LastName'))]
    .filter(Boolean)
    .join(' ')
    .trim() || null;
}

function normalizeAbsenceNotices(payload: unknown) {
  return extractCollection(payload, ['items', 'Items'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((record) => ({
      id:
        stringValue(getField(record, 'id', 'Id')) ??
        `${stringValue(getField(record, 'startDateTime', 'StartDateTime')) ?? 'absence'}-${stringValue(getField(record, 'attendanceTypeCode', 'AttendanceTypeCode')) ?? 'notice'}`,
      code: stringValue(getField(record, 'attendanceTypeCode', 'AttendanceTypeCode')) ?? '-',
      description: stringValue(getField(record, 'attendanceTypeDesc', 'AttendanceTypeDesc')) ?? 'Afwezigheid',
      start: stringValue(getField(record, 'startDateTime', 'StartDateTime')) ?? '',
      end: stringValue(getField(record, 'endDateTime', 'EndDateTime')) ?? '',
      creatorName: formatAbsenceActor(nestedRecord(record, 'creator', 'Creator')),
      modifiedByName: formatAbsenceActor(nestedRecord(record, 'modifiedBy', 'ModifiedBy')),
      lastModified: stringValue(getField(record, 'lastModified', 'LastModified')),
    }))
    .filter((item) => Boolean(item.id) && Boolean(item.start) && Boolean(item.end)) satisfies MagisterAbsenceNotice[];
}

function normalizeLessonAbsences(payload: unknown) {
  return extractCollection(payload, ['Items', 'items'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((record) => {
      const appointment = nestedRecord(record, 'Afspraak', 'afspraak');

      return {
        id: numberValue(getField(record, 'Id', 'id')) ?? 0,
        code: stringValue(getField(record, 'Code', 'code')) ?? '-',
        description: stringValue(getField(record, 'Omschrijving', 'omschrijving')) ?? 'Afwezigheid',
        isExcused: getField(record, 'Geoorloofd', 'geoorloofd') === true,
        lessonHour: numberValue(getField(record, 'Lesuur', 'lesuur')),
        start: stringValue(getField(record, 'Start', 'start')) ?? '',
        end: stringValue(getField(record, 'Eind', 'eind')) ?? '',
        appointmentId: numberValue(getField(record, 'AfspraakId', 'afspraakId')),
        appointmentTitle: stringValue(getField(appointment, 'Omschrijving', 'omschrijving')),
        appointmentLocation: formatDisplayLocation(stringValue(getField(appointment, 'Lokatie', 'lokatie'))),
        appointmentContent: stripHtml(stringValue(getField(appointment, 'Inhoud', 'inhoud')) ?? '') || null,
        hasAttachments: getField(appointment, 'HeeftBijlagen', 'heeftBijlagen') === true,
      };
    })
    .filter((item) => item.id > 0 && Boolean(item.start) && Boolean(item.end)) satisfies MagisterLessonAbsence[];
}

function normalizeLearningResources(payload: unknown) {
  return extractCollection(payload, ['Items', 'items'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((record) => {
      const subject = nestedRecord(record, 'Vak', 'vak');
      const links = extractLinks(record);

      return {
        id: numberValue(getField(record, 'Id', 'id')) ?? 0,
        materialType: numberValue(getField(record, 'MateriaalType', 'materiaalType')) ?? 0,
        title: stringValue(getField(record, 'Titel', 'titel')) ?? 'Leermiddel',
        publisher: stringValue(getField(record, 'Uitgeverij', 'uitgeverij')),
        status: numberValue(getField(record, 'Status', 'status')),
        start: stringValue(getField(record, 'Start', 'start')),
        end: stringValue(getField(record, 'Eind', 'eind')),
        ean: stringValue(getField(record, 'EAN', 'ean')),
        subjectAbbreviation: stringValue(getField(subject, 'Afkorting', 'afkorting')),
        subjectName: stringValue(getField(subject, 'Omschrijving', 'omschrijving')),
        links,
        contentLink: linkByRel(links, 'content'),
      };
    })
    .filter((item) => Boolean(item.title)) satisfies MagisterLearningResource[];
}

function parseActivityElementTitle(title?: string | null) {
  if (!title) {
    return {
      room: null,
      subjectCode: null,
      teacherCode: null,
      topic: null,
      variantCode: null,
    };
  }

  const [subjectCode, teacherCode, room, variantCode, lessonCode, ...rest] = title
    .split('\t')
    .map((part) => part.trim());
  const topic = rest.join(' ').trim() || lessonCode || null;

  return {
    room: formatDisplayLocation(room),
    subjectCode: subjectCode || null,
    teacherCode: teacherCode || null,
    topic,
    variantCode: variantCode || lessonCode || null,
  };
}

function subjectFromGradeRow(row: UnknownRecord) {
  const kolom =
    nestedRecord(row, 'Kolom', 'kolom', 'CijferKolom', 'cijferKolom') ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');
  const vak = asRecord(row.Vak) ?? asRecord(row.vak) ?? nestedRecord(kolom, 'Vak', 'vak');

  return (
    stringValue(getField(vak, 'Omschrijving', 'omschrijving')) ??
    stringValue(getField(vak, 'Naam', 'naam')) ??
    stringValue(getField(vak, 'Code', 'code')) ??
    stringValue(getField(vak, 'Afkorting', 'afkorting')) ??
    stringValue(getField(row, 'VakOmschrijving', 'vakOmschrijving')) ??
    stringValue(getField(row, 'VakNaam', 'vakNaam')) ??
    stringValue(getField(row, 'VakCode', 'vakCode')) ??
    stringValue(getField(kolom, 'VakOmschrijving', 'vakOmschrijving', 'Naam', 'naam', 'Code', 'code')) ??
    'Onbekend vak'
  );
}

function titleFromGradeRow(row: UnknownRecord) {
  const kolom =
    nestedRecord(row, 'Kolom', 'kolom', 'CijferKolom', 'cijferKolom') ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');

  return (
    stringValue(getField(row, 'Omschrijving', 'omschrijving')) ??
    stringValue(getField(row, 'KolomKop', 'kolomKop')) ??
    stringValue(getField(row, 'Titel', 'titel')) ??
    stringValue(getField(row, 'Onderwerp', 'onderwerp')) ??
    stringValue(getField(kolom, 'Omschrijving', 'omschrijving', 'KolomKop', 'kolomKop', 'Naam', 'naam')) ??
    'Resultaat'
  );
}

function gradeFromGradeRow(row: UnknownRecord) {
  const kolom =
    nestedRecord(row, 'Kolom', 'kolom', 'CijferKolom', 'cijferKolom') ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');

  return (
    stringValue(getField(row, 'CijferStr', 'cijferStr')) ??
    stringValue(getField(row, 'Cijfer', 'cijfer')) ??
    stringValue(getField(row, 'ResultaatStr', 'resultaatStr')) ??
    stringValue(getField(row, 'Resultaat', 'resultaat')) ??
    stringValue(getField(row, 'Waarde', 'waarde')) ??
    stringValue(getField(kolom, 'Resultaat', 'resultaat', 'Waarde', 'waarde')) ??
    '-'
  );
}

function weightFromGradeRow(row: UnknownRecord) {
  const kolom =
    asRecord(getField(row, 'kolom', 'Kolom', 'CijferKolom', 'cijferKolom')) ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');

  return (
    stringValue(getField(row, 'Weging', 'weging')) ??
    stringValue(getField(row, 'Weegfactor', 'weegfactor')) ??
    stringValue(getField(kolom, 'Weging', 'weging', 'Weegfactor', 'weegfactor')) ??
    null
  );
}

function enteredAtFromGradeRow(row: UnknownRecord) {
  const kolom =
    nestedRecord(row, 'Kolom', 'kolom', 'CijferKolom', 'cijferKolom') ??
    nestedRecord(row, 'CijferKolomVoortgang', 'cijferKolomVoortgang');

  return (
    stringValue(getField(row, 'DatumIngevoerd', 'datumIngevoerd')) ??
    stringValue(getField(row, 'IngevoerdOp', 'ingevoerdOp')) ??
    stringValue(getField(row, 'Datum', 'datum')) ??
    stringValue(getField(row, 'DatumBehaald', 'datumBehaald')) ??
    stringValue(getField(row, 'AangemaaktOp', 'aangemaaktOp')) ??
    stringValue(getField(kolom, 'DatumIngevoerd', 'datumIngevoerd', 'Datum', 'datum')) ??
    null
  );
}

export function toProfile(account: AccountResponse): MagisterProfile {
  const id = account.Persoon?.Id;
  const firstName = account.Persoon?.Roepnaam?.trim() ?? 'Leerling';
  const infix = account.Persoon?.Tussenvoegsel?.trim() ?? '';
  const lastName = account.Persoon?.Achternaam?.trim() ?? '';

  if (!id) {
    throw new Error('Magister accountresponse bevat geen persoon-id.');
  }

  const fullName = [firstName, infix, lastName].filter(Boolean).join(' ').trim();

  return {
    id,
    personId: id,
    firstName,
    infix,
    lastName,
    fullName: fullName || firstName,
  };
}

function extractAppointments(payload: unknown): RawMagisterAppointment[] {
  return extractCollection(payload, ['Items', 'items', 'Afspraken']) as RawMagisterAppointment[];
}

function extractScheduleChanges(payload: unknown) {
  return extractCollection(payload, ['Items', 'items', 'Roosterwijzigingen', 'roosterwijzigingen'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item));
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? '';
}

function isUsefulAppointmentText(value?: string | null) {
  const normalized = normalizeText(value);

  return Boolean(normalized) && normalized !== 'schoolafspraak' && normalized !== 'locatie volgt';
}

function appointmentLikeSubject(row: UnknownRecord) {
  const vak = asRecord(getField(row, 'Vak', 'vak'));
  const vakken = getField(row, 'Vakken', 'vakken');

  if (Array.isArray(vakken)) {
    const values = vakken
      .map((item) => asRecord(item))
      .filter((item): item is UnknownRecord => Boolean(item))
      .map((item) => stringValue(getField(item, 'Naam', 'naam', 'Code', 'code')))
      .filter((value): value is string => Boolean(value));

    if (values.length > 0) {
      return values.join(', ');
    }
  }

  return (
    stringValue(getField(vak, 'Omschrijving', 'omschrijving', 'Naam', 'naam', 'Code', 'code')) ??
    stringValue(getField(row, 'VakOmschrijving', 'vakOmschrijving', 'VakNaam', 'vakNaam', 'VakCode', 'vakCode')) ??
    (isUsefulAppointmentText(stringValue(getField(row, 'Omschrijving', 'omschrijving')))
      ? stringValue(getField(row, 'Omschrijving', 'omschrijving'))
      : null) ??
    'Schoolafspraak'
  );
}

function appointmentLikeTeachers(row: UnknownRecord) {
  const docenten = getField(row, 'Docenten', 'docenten');

  if (Array.isArray(docenten)) {
    const values = docenten
      .map((item) => asRecord(item))
      .filter((item): item is UnknownRecord => Boolean(item))
      .map((item) => stringValue(getField(item, 'Naam', 'naam')))
      .filter((value): value is string => Boolean(value));

    if (values.length > 0) {
      return values.join(', ');
    }
  }

  return stringValue(getField(row, 'Docent', 'docent', 'DocentNaam', 'docentNaam')) ?? 'Docent onbekend';
}

function appointmentLikeLocation(row: UnknownRecord) {
  const lokalen = getField(row, 'Lokalen', 'lokalen');

  if (Array.isArray(lokalen)) {
    const values = lokalen
      .map((item) => asRecord(item))
      .filter((item): item is UnknownRecord => Boolean(item))
      .map((item) => stringValue(getField(item, 'Naam', 'naam')))
      .filter((value): value is string => Boolean(value));

    if (values.length > 0) {
      return formatDisplayLocation(values.join(', ')) || 'Locatie volgt';
    }
  }

  return formatDisplayLocation(stringValue(getField(row, 'Lokatie', 'lokatie', 'Lokaal', 'lokaal'))) || 'Locatie volgt';
}

function rowChangeLooksCancelled(row: UnknownRecord) {
  const statusText = [
    stringValue(getField(row, 'StatusNaam', 'statusNaam')),
    stringValue(getField(row, 'OmschrijvingStatus', 'omschrijvingStatus')),
    stringValue(getField(row, 'Aantekening', 'aantekening')),
    stringValue(getField(row, 'Omschrijving', 'omschrijving')),
    stringValue(getField(row, 'Inhoud', 'inhoud')),
    appointmentLikeLocation(row),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const explicitFlag = getField(row, 'LesIsVervallen', 'lesIsVervallen', 'Vervallen', 'vervallen', 'IsVervallen', 'isVervallen');
  return (
    explicitFlag === true ||
    /\b(vervallen|uitgevallen|uitval|afgelast|geannuleerd|cancelled|canceled)\b/.test(statusText)
  );
}

function rowChangeKeys(row: UnknownRecord) {
  const id = stringValue(getField(row, 'AfspraakId', 'afspraakId', 'Id', 'id'));
  const start = stringValue(getField(row, 'Start', 'start', 'Van', 'van', 'Begin', 'begin'));
  const end = stringValue(getField(row, 'Einde', 'einde', 'Tot', 'tot', 'Eind', 'eind'));
  const lessonHour = stringValue(getField(row, 'LesuurVan', 'lesuurVan', 'Lesuur', 'lesuur'));
  const subject = appointmentLikeSubject(row);
  const normalizedSubject = normalizeText(subject);
  const keys = new Set<string>();

  if (id) {
    keys.add(`id:${id}`);
  }

  if (start && end) {
    keys.add(`time:${start}|${end}`);

    if (lessonHour) {
      keys.add(`time-hour:${start}|${end}|${lessonHour}`);
    }

    if (normalizedSubject) {
      keys.add(`time-subject:${start}|${end}|${normalizedSubject}`);
    }
  }

  return Array.from(keys);
}

function appointmentKeys(appointment: MagisterAppointment) {
  const keys = new Set<string>();
  const normalizedSubject = normalizeText(appointment.subject);

  keys.add(`id:${appointment.id}`);
  keys.add(`time:${appointment.start}|${appointment.end}`);

  if (appointment.lessonHour != null) {
    keys.add(`time-hour:${appointment.start}|${appointment.end}|${String(appointment.lessonHour)}`);
  }

  if (normalizedSubject) {
    keys.add(`time-subject:${appointment.start}|${appointment.end}|${normalizedSubject}`);
  }

  return Array.from(keys);
}

function appointmentFromScheduleChange(row: UnknownRecord): MagisterAppointment | null {
  if (!rowChangeLooksCancelled(row)) {
    return null;
  }

  const start = stringValue(getField(row, 'Start', 'start', 'Van', 'van', 'Begin', 'begin'));
  const end = stringValue(getField(row, 'Einde', 'einde', 'Tot', 'tot', 'Eind', 'eind'));

  if (!start || !end) {
    return null;
  }

  const subject = appointmentLikeSubject(row);
  const lessonHourValue = numberValue(getField(row, 'LesuurVan', 'lesuurVan', 'Lesuur', 'lesuur'));
  const lessonHourEndValue = numberValue(getField(row, 'LesuurTotMet', 'lesuurTotMet', 'Lesuur', 'lesuur'));
  const lessonHours =
    lessonHourValue != null && lessonHourEndValue != null && lessonHourValue !== lessonHourEndValue
      ? `${lessonHourValue}/${lessonHourEndValue}`
      : lessonHourValue != null
        ? String(lessonHourValue)
        : null;

  return {
    id: stringValue(getField(row, 'AfspraakId', 'afspraakId', 'Id', 'id')) ?? `${start}-${end}-${subject}`,
    title: stringValue(getField(row, 'Omschrijving', 'omschrijving')) ?? subject,
    subject,
    start,
    end,
    location: '-',
    teachers: appointmentLikeTeachers(row),
    lessonHour: lessonHourValue,
    lessonHourEnd: lessonHourEndValue ?? lessonHourValue,
    lessonHours,
    isAllDay: false,
    description: stringValue(getField(row, 'Inhoud', 'inhoud', 'Aantekening', 'aantekening')) ?? undefined,
    infoType: numberValue(getField(row, 'InfoType', 'infoType')),
    hasAttachments: false,
    isCancelled: true,
    status: 5,
    type: numberValue(getField(row, 'Type', 'type')),
    subtype: numberValue(getField(row, 'Subtype', 'subtype')),
  };
}

function applyScheduleChanges(
  appointments: MagisterAppointment[],
  changePayload?: unknown,
) {
  const changes = extractScheduleChanges(changePayload).filter(rowChangeLooksCancelled);

  if (changes.length === 0) {
    return appointments;
  }

  const cancellationKeys = new Set<string>();
  const syntheticAppointments: MagisterAppointment[] = [];

  changes.forEach((change) => {
    rowChangeKeys(change).forEach((key) => cancellationKeys.add(key));

    const syntheticAppointment = appointmentFromScheduleChange(change);

    if (syntheticAppointment) {
      syntheticAppointments.push(syntheticAppointment);
    }
  });

  const updatedAppointments = appointments.map((appointment) => {
    const isCancelled =
      appointment.isCancelled ||
      appointmentKeys(appointment).some((key) => cancellationKeys.has(key));

    if (!isCancelled) {
      return appointment;
    }

    return {
      ...appointment,
      isCancelled: true,
      location: '-',
    };
  });

  const seenKeys = new Set(updatedAppointments.flatMap(appointmentKeys));
  const extraCancelledAppointments = syntheticAppointments.filter((appointment) =>
    !appointmentKeys(appointment).some((key) => seenKeys.has(key)),
  );

  return [...updatedAppointments, ...extraCancelledAppointments].sort(
    (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
  );
}

function withUniqueIds<T extends { id: string }>(items: T[]) {
  const seenIds = new Map<string, number>();

  return items.map((item) => {
    const currentCount = seenIds.get(item.id) ?? 0;
    seenIds.set(item.id, currentCount + 1);

    if (currentCount === 0) {
      return item;
    }

    return {
      ...item,
      id: `${item.id}-${currentCount + 1}`,
    };
  });
}

export function normalizeAppointments(payload: unknown, changePayload?: unknown): MagisterAppointment[] {
  const normalizedAppointments = extractAppointments(payload)
    .filter((appointment) => appointment.Start && appointment.Einde)
    .map((appointment) => {
      const statusText = [
        appointment.StatusNaam,
        appointment.OmschrijvingStatus,
        appointment.Aantekening,
        appointment.Omschrijving,
        appointment.Inhoud,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const vakkenSubject = appointment.Vakken?.map((item) => item.Naam || item.Code).filter(Boolean).join(', ');
      const fallbackSubject = isUsefulAppointmentText(appointment.Omschrijving?.trim()) ? appointment.Omschrijving?.trim() : null;
      const subject = vakkenSubject || fallbackSubject || 'Schoolafspraak';

      const location =
        formatDisplayLocation(appointment.Lokalen?.map((item) => item.Naam).filter(Boolean).join(', ')) ||
        formatDisplayLocation(appointment.Lokatie) ||
        'Locatie volgt';

      const teachers =
        appointment.Docenten?.map((item) => item.Naam).filter(Boolean).join(', ') || 'Docent onbekend';

      const lessonHour = appointment.LesuurVan ?? null;
      const lessonHours =
        appointment.LesuurVan && appointment.LesuurTotMet && appointment.LesuurVan !== appointment.LesuurTotMet
          ? `${appointment.LesuurVan}-${appointment.LesuurTotMet}`
          : appointment.LesuurVan
            ? String(appointment.LesuurVan)
            : null;

      return {
        id: String(appointment.Id ?? `${appointment.Start}-${appointment.Einde}`),
        title: appointment.Omschrijving?.trim() || subject,
        subject,
        start: appointment.Start ?? '',
        end: appointment.Einde ?? '',
        location,
        teachers,
        lessonHour,
        lessonHourEnd: appointment.LesuurTotMet ?? appointment.LesuurVan ?? null,
        lessonHours,
        isAllDay: appointment.DuurtHeleDag ?? false,
        description: appointment.Inhoud ? stripHtml(appointment.Inhoud) : undefined,
        infoType: appointment.InfoType ?? null,
        hasAttachments: appointment.HeeftBijlagen ?? false,
        isCancelled:
          appointment.Status === 5 ||
          appointment.LesIsVervallen === true ||
          /\b(vervallen|uitgevallen|uitval|afgelast|geannuleerd|cancelled|canceled)\b/.test(statusText),
        status: appointment.Status ?? null,
        type: appointment.Type ?? null,
        subtype: appointment.Subtype ?? null,
        completed: appointment.Afgerond ?? false,
      };
    })
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

  return applyScheduleChanges(normalizedAppointments, changePayload);
}

function normalizeActivities(payload: unknown): MagisterActivity[] {
  return extractCollection(payload, ['Items', 'items'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((row) => {
      const links = extractLinks(row);

      return {
        id: String(numberValue(getField(row, 'Id', 'id')) ?? stringValue(getField(row, 'Id', 'id')) ?? 'activiteit'),
        activityId: numberValue(getField(row, 'Id', 'id')) ?? 0,
        title: stringValue(getField(row, 'Titel', 'titel')) ?? 'Activiteit',
        details: stripHtml(stringValue(getField(row, 'Details', 'details')) ?? '') || undefined,
        visibleFrom: stringValue(getField(row, 'ZichtbaarVanaf', 'zichtbaarVanaf')),
        visibleTo: stringValue(getField(row, 'ZichtbaarTotEnMet', 'zichtbaarTotEnMet')),
        subscriptionStart: stringValue(getField(row, 'StartInschrijfdatum', 'startInschrijfdatum')),
        subscriptionEnd: stringValue(getField(row, 'EindeInschrijfdatum', 'eindeInschrijfdatum')),
        maximumRegistrations: numberValue(
          getField(row, 'MaximumAantalInschrijvingenPerActiviteit', 'maximumAantalInschrijvingenPerActiviteit'),
        ),
        minimumRegistrations: numberValue(
          getField(row, 'MinimumAantalInschrijvingenPerActiviteit', 'minimumAantalInschrijvingenPerActiviteit'),
        ),
        status: numberValue(getField(row, 'Status', 'status')),
        accessType: numberValue(getField(row, 'Toegangstype', 'toegangstype')),
        subscriptionCount: numberValue(getField(row, 'AantalInschrijvingen', 'aantalInschrijvingen')) ?? 0,
        links,
        selfLink: linkByRel(links, 'Self'),
      };
    })
    .filter((activity) => activity.activityId > 0);
}

function normalizeActivityElements(payload: unknown): MagisterActivityElement[] {
  return extractCollection(payload, ['Items', 'items'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((row) => {
      const links = extractLinks(row);
      const parsedTitle = parseActivityElementTitle(stringValue(getField(row, 'Titel', 'titel')));

      return {
        id: String(numberValue(getField(row, 'Id', 'id')) ?? stringValue(getField(row, 'Id', 'id')) ?? 'onderdeel'),
        elementId: numberValue(getField(row, 'Id', 'id')) ?? 0,
        activityId: numberValue(getField(row, 'ActiviteitId', 'activiteitId')) ?? 0,
        title: stringValue(getField(row, 'Titel', 'titel')) ?? 'Onderdeel',
        details: stripHtml(stringValue(getField(row, 'Details', 'details')) ?? '') || undefined,
        subjectCode: parsedTitle.subjectCode,
        teacherCode: parsedTitle.teacherCode,
        room: parsedTitle.room || null,
        variantCode: parsedTitle.variantCode,
        topic: parsedTitle.topic,
        subscriptionStart: stringValue(getField(row, 'StartInschrijfdatum', 'startInschrijfdatum')),
        subscriptionEnd: stringValue(getField(row, 'EindeInschrijfdatum', 'eindeInschrijfdatum')),
        maxParticipants: numberValue(getField(row, 'MaxAantalDeelnemers', 'maxAantalDeelnemers')),
        minParticipants: numberValue(getField(row, 'MinAantalDeelnemers', 'minAantalDeelnemers')),
        colorIndex: numberValue(getField(row, 'Kleurstelling', 'kleurstelling')),
        isSubscribed: getField(row, 'IsIngeschreven', 'isIngeschreven') === true,
        isMandatory: getField(row, 'IsVerplichtIngeschreven', 'isVerplichtIngeschreven') === true,
        availableSeats: numberValue(getField(row, 'AantalPlaatsenBeschikbaar', 'aantalPlaatsenBeschikbaar')),
        canSubscribe: getField(row, 'IsOpInTeSchrijven', 'isOpInTeSchrijven') === true,
        links,
        subscriptionLink: linkByRel(links, 'Subscriptions') ?? linkByRel(links, 'Subscribe'),
        selfLink: linkByRel(links, 'Self'),
      };
    })
    .filter((element) => element.elementId > 0);
}

export function normalizeGradeResults(payload: unknown): MagisterGradeResult[] {
  const results = extractCollection(payload, ['Items', 'items', 'Resultaten', 'resultaten'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((row) => {
      const enteredAt = enteredAtFromGradeRow(row);

      return {
        id:
          stringValue(getField(row, 'Id', 'id')) ??
          stringValue(getField(row, 'CijferKolomId', 'cijferKolomId')) ??
          `${subjectFromGradeRow(row)}-${titleFromGradeRow(row)}-${enteredAt ?? gradeFromGradeRow(row)}`,
        subject: subjectFromGradeRow(row),
        title: titleFromGradeRow(row),
        grade: gradeFromGradeRow(row),
        weight: weightFromGradeRow(row),
        enteredAt,
      };
    })
    .sort((left, right) => {
      const leftTime = left.enteredAt ? new Date(left.enteredAt).getTime() : 0;
      const rightTime = right.enteredAt ? new Date(right.enteredAt).getTime() : 0;

      return rightTime - leftTime;
    });

  return withUniqueIds(results);
}

export function normalizeSubjectAverages(payload: unknown): MagisterSubjectAverage[] {
  const averages = extractCollection(payload, ['Items', 'items', 'Gemiddelden', 'gemiddelden'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map((row) => {
      const vak = asRecord(row.Vak) ?? asRecord(row.vak);
      const subject =
        stringValue(getField(vak, 'Omschrijving', 'omschrijving')) ??
        stringValue(getField(vak, 'Naam', 'naam')) ??
        stringValue(getField(vak, 'Code', 'code')) ??
        stringValue(getField(row, 'VakOmschrijving', 'vakOmschrijving')) ??
        stringValue(getField(row, 'VakNaam', 'vakNaam')) ??
        'Onbekend vak';

      const roundedAverage =
        stringValue(getField(row, 'AfgerondGemiddelde', 'afgerondGemiddelde')) ??
        stringValue(getField(row, 'Afgerond', 'afgerond')) ??
        stringValue(getField(row, 'GemiddeldeKolom', 'gemiddeldeKolom')) ??
        null;

      const average =
        roundedAverage ??
        stringValue(getField(row, 'Gemiddelde', 'gemiddelde')) ??
        stringValue(getField(row, 'GemiddeldeStr', 'gemiddeldeStr')) ??
        stringValue(getField(row, 'Cijfer', 'cijfer')) ??
        (numberValue(getField(row, 'Gemiddelde', 'gemiddelde')) != null
          ? String(numberValue(getField(row, 'Gemiddelde', 'gemiddelde')))
          : '-');

      return {
        id: stringValue(getField(row, 'Id', 'id')) ?? `${subject}-${average}`,
        subject,
        average,
        roundedAverage,
        exactAverage: average,
        gradeCount: 0,
        numericAverage: numericValueOnly(average),
        scale: 'numeric' as const,
        weightTotal: undefined,
      };
    })
    .sort((left, right) => left.subject.localeCompare(right.subject, 'nl-NL'));

  return withUniqueIds(averages);
}

export function calculateSubjectAveragesFromGrades(grades: MagisterGradeResult[]): MagisterSubjectAverage[] {
  const grouped = new Map<
    string,
    { weightedTotal: number; weightTotal: number; gradeCount: number; numericCount: number; qualitativeCount: number }
  >();

  grades.forEach((grade) => {
    const numericGrade = gradeValueToNumeric(grade.grade);

    if (numericGrade == null) {
      return;
    }

    const numericWeight = numericValueOnly(grade.weight) ?? 1;

    if (numericWeight <= 0) {
      return;
    }

    const current = grouped.get(grade.subject) ?? {
      weightedTotal: 0,
      weightTotal: 0,
      gradeCount: 0,
      numericCount: 0,
      qualitativeCount: 0,
    };
    current.weightedTotal += numericGrade * numericWeight;
    current.weightTotal += numericWeight;
    current.gradeCount += 1;
    current.numericCount += numericValueOnly(grade.grade) != null ? 1 : 0;
    current.qualitativeCount += qualitativeGradeValue(grade.grade) != null ? 1 : 0;
    grouped.set(grade.subject, current);
  });

  return Array.from(grouped.entries())
    .map(([subject, values]) => {
      const exactAverage = values.weightedTotal / values.weightTotal;
      const scale: 'numeric' | 'qualitative' =
        values.qualitativeCount > 0 && values.numericCount === 0 ? 'qualitative' : 'numeric';

      return {
        id: `${subject}-${values.weightTotal}`,
        subject,
        average: scale === 'qualitative' ? qualitativeAverageLabel(exactAverage) : formatGradeValue(exactAverage, 1),
        roundedAverage:
          scale === 'qualitative' ? qualitativeAverageLabel(exactAverage) : String(Math.round(exactAverage)).replace('.', ','),
        exactAverage: formatGradeValue(exactAverage, 2),
        gradeCount: values.gradeCount,
        numericAverage: exactAverage,
        scale,
        weightTotal: values.weightTotal,
      };
    })
    .sort((left, right) => left.subject.localeCompare(right.subject, 'nl-NL'));
}

export async function fetchAccountFromTokens(session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>) {
  return magisterGet<AccountResponse>('/account', session);
}

export async function fetchScheduleFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
  from: string,
  to: string,
) {
  return magisterGet<unknown>(`/personen/${personId}/afspraken?van=${from}&tot=${to}`, session);
}

export async function fetchScheduleChangesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
  from: string,
  to: string,
) {
  return magisterGet<unknown>(`/personen/${personId}/roosterwijzigingen?van=${from}&tot=${to}`, session);
}

export async function fetchAppointmentDetailFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
  appointmentId: number,
) {
  return magisterGet<unknown>(`/personen/${personId}/afspraken/${appointmentId}`, session);
}

export async function updateAppointmentCompletionFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
  appointmentId: number,
  completed: boolean,
) {
  const detailPayload = await fetchAppointmentDetailFromTokens(session, personId, appointmentId);
  const detailRecord = asRecord(detailPayload);

  if (!detailRecord) {
    throw new Error('De afspraakdetails konden niet worden geladen.');
  }

  const nextPayload = {
    ...detailRecord,
    Afgerond: completed,
    afgerond: completed,
  };

  await magisterRequest<unknown>('PUT', `/personen/${personId}/afspraken/${appointmentId}`, session, nextPayload);

  return normalizeAppointments({ Items: [nextPayload] })[0] ?? null;
}

export async function fetchLatestGradesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
) {
  const payload = await magisterGetFirstAvailable<unknown>(
    [
      `/personen/${personId}/cijfers/laatste?top=100&skip=0`,
      `/personen/${personId}/cijfers/laatste`,
      `/personen/${personId}/resultaten/laatste?top=100&skip=0`,
    ],
    session,
  );

  return normalizeGradeResults(payload);
}

export async function fetchSubjectAveragesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
) {
  const payload = await magisterGetFirstAvailable<unknown>(
    [
      `/personen/${personId}/cijfers/gemiddelden`,
      `/personen/${personId}/cijfers/gemiddeldenvoorexamen`,
      `/personen/${personId}/resultaten/gemiddelden`,
    ],
    session,
  );

  return normalizeSubjectAverages(payload);
}

export async function fetchActivitiesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
) {
  const payload = await magisterGetFirstAvailable<unknown>(
    [
      `/personen/${personId}/activiteiten?top=100&skip=0`,
      `/personen/${personId}/activiteiten`,
    ],
    session,
  );

  return normalizeActivities(payload);
}

export async function fetchActivityElementsFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
  activityId: number,
  selfLink?: string | null,
) {
  const payload = await magisterGet<unknown>(
    selfLink ? `${normalizeMagisterPath(selfLink)}/onderdelen` : `/personen/${personId}/activiteiten/${activityId}/onderdelen`,
    session,
  );

  return normalizeActivityElements(payload);
}

export async function subscribeToActivityElement(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  subscriptionLink: string,
  personId: number,
  activityId: number,
  elementId: number,
) {
  await magisterRequest<unknown>('POST', subscriptionLink, session, {
    activiteitId: activityId,
    onderdeelId: elementId,
    persoonId: personId,
  });
}

export async function unsubscribeFromActivityElement(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  subscriptionLink: string,
) {
  await magisterRequest<unknown>('DELETE', subscriptionLink, session);
}

export async function fetchInboxMessagesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  options?: { top?: number; skip?: number },
) {
  const top = options?.top ?? 20;
  const skip = options?.skip ?? 0;
  const payload = await magisterGet<unknown>(`/berichten/postvakin/berichten?top=${top}&skip=${skip}`, session);

  return normalizeMessageList(payload);
}

export async function fetchMessageDetailFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  messageId: number,
) {
  const detailPayload = await magisterGet<unknown>(`/berichten/berichten/${messageId}`, session);
  const attachmentPayload = await magisterGet<unknown>(`/berichten/berichten/${messageId}/bijlagen`, session).catch(() => null);
  const attachments = attachmentPayload
    ? extractCollection(attachmentPayload, ['items', 'Items'])
        .map((item) => asRecord(item))
        .filter((item): item is UnknownRecord => Boolean(item))
        .map(normalizeMessageAttachment)
    : [];

  return normalizeMessageDetail(detailPayload, attachments);
}

export async function searchMessageContactsFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  query: string,
  top = 50,
) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [] as MagisterContactPerson[];
  }

  const payload = await magisterGet<unknown>(
    `/contacten/personen?q=${encodeURIComponent(normalizedQuery)}&top=${top}&type=alle`,
    session,
  );

  return extractCollection(payload, ['items', 'Items'])
    .map((item) => asRecord(item))
    .filter((item): item is UnknownRecord => Boolean(item))
    .map(normalizeContactPerson)
    .filter((item) => item.id > 0);
}

export async function sendMessageFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  input: {
    recipients: MagisterMessageComposeRecipient[];
    ccRecipients?: MagisterMessageComposeRecipient[];
    bccRecipients?: MagisterMessageComposeRecipient[];
    hasPriority?: boolean;
    bodyHtml: string;
    subject: string;
  },
) {
  await magisterRequest<unknown>('POST', '/berichten/berichten', session, {
    ontvangers: input.recipients,
    kopieOntvangers: input.ccRecipients ?? [],
    blindeKopieOntvangers: input.bccRecipients ?? [],
    heeftPrioriteit: input.hasPriority ?? false,
    inhoud: input.bodyHtml,
    onderwerp: input.subject,
    verzendOptie: 'standaard',
    bijlagen: [],
  });
}

export async function fetchAbsenceNoticesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  attendanceStudentId: string,
) {
  const payload = await attendanceGet<unknown>(
    `/student/${attendanceStudentId}/absence-notices?orderColumn=startDateTime&orderBy=desc`,
    session,
  );

  return normalizeAbsenceNotices(payload);
}

export async function fetchLessonAbsencesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
  from: string,
  to: string,
) {
  const payload = await magisterGet<unknown>(
    `/personen/${personId}/absenties?tot=${encodeURIComponent(to)}&van=${encodeURIComponent(from)}`,
    session,
  );

  return normalizeLessonAbsences(payload);
}

export async function fetchLearningResourcesFromTokens(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  personId: number,
) {
  const payload = await magisterGet<unknown>(`/personen/${personId}/lesmateriaal`, session);
  return normalizeLearningResources(payload);
}

export async function resolveAuthenticatedExternalUrl(
  session: Pick<StoredSession, 'accessToken' | 'xsrfToken'>,
  pathOrHref: string,
) {
  const response = await fetch(`${MAGISTER_API_BASE}${normalizeMagisterPath(pathOrHref)}`, {
    method: 'GET',
    headers: buildHeaders(session),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Magister request faalde met status ${response.status}`);
  }

  return response.url;
}
